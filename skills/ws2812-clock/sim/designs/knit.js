// Knit: a close-up of a hand-knitted Fair Isle jumper, and the time is its
// colourwork. Every stitch is a real knit V of round yarn, 4 x 3 LEDs, with
// its own heather and the soft light of the fabric's folds. The hours are a
// cream motif on a band of shaded navy, the minutes on shaded madder.
//
// Always alive: the fabric hangs from two birch needles along the top edge
// and sways and breathes; the needles knit the live row across the panel,
// one stitch per 3.75 s with a click on every insert, wrap and pull, so the
// row is the minute's progress, and the work turns at the end of each row.
//
// Minute turn: the old numeral's yarn is pulled out stitch by stitch and
// flies away as a crimped strand, then a tapestry needle duplicate-stitches
// the new numeral, row by row, trailing its yarn.
// Hour: knitters call ripping out work "frogging" (rip-it, rip-it). So the
// frog comes: a knitted rainbow toy frog in glasses leaps in, bites the yarn
// end and hops away across the jumper, ripping out every changed numeral on
// one long kinked strand; then the needle sews the new hour back in.
import * as kit from '../js/kit.js';
import { GW, GH, GLYPHS, SEW } from './knit-glyphs.js';
import { W, H, seg, strand, kinked, darner } from './knit-draw.js';
import { frog } from './knit-frog.js';

const CW = 6, RH = 4, Y0 = 6, NC = 11, NR = 15, XO = -1;
const CREAM = kit.hex('#f6e8c4');
const HOUR_BG = ['#28387e', '#2e428e', '#344a9a', '#3850a2', '#324896', '#2c4088'].map(kit.hex);
const MIN_BG = ['#721e24', '#80242a', '#8c2a2c', '#942e2e', '#88282c', '#7a2226'].map(kit.hex);
const RIB = kit.hex('#3a2a20');
// outline yarn: a dark charcoal stranded round every numeral stitch
const OUTLINE = kit.hex('#0c0a10');
const PEERIE = [kit.hex('#e2a43a'), kit.hex('#3e6a34')];
const LIVE = [kit.hex('#b87a2a'), kit.hex('#4f7a34')];
const BIRCH = kit.hex('#8c9cb4'), BIRCH_HI = kit.hex('#ffffff'); // steel needles
const SLOTS = [[1, 1], [6, 1], [1, 8], [6, 8]]; // [col, row] of each numeral's chart

// ---------------------------------------------------------------- stitch
// One knit stitch drawn LED by LED (4 x 3): the two legs of the V, the dark
// notch between their tops, and the point dipping toward the row below.
// Lit from the upper left, so the right leg is a shade darker. The pattern
// is interpolated between LED centres (periodic), so when the fabric sways
// by a fraction of a pixel the stitches glide instead of hopping.
const STITCH = [
  [0.85, 0.40, 0.006, 0.006, 0.30, 0.62],
  [0.18, 1.00, 0.42, 0.26, 0.74, 0.12],
  [0.004, 0.26, 1.00, 0.78, 0.20, 0.004],
  [0.000, 0.006, 0.16, 0.12, 0.004, 0.000],
];
const TR = 8, TW = CW * TR, TH = RH * TR;
const TEX = new Float32Array(TW * TH);
for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
  const x = (i + 0.5) / TR - 0.5, y = (j + 0.5) / TR - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), u = x - x0, v = y - y0;
  const m = (a, b) => STITCH[((b % RH) + RH) % RH][((a % CW) + CW) % CW];
  TEX[j * TW + i] = (m(x0, y0) * (1 - u) + m(x0 + 1, y0) * u) * (1 - v) + (m(x0, y0 + 1) * (1 - u) + m(x0 + 1, y0 + 1) * u) * v;
}

// ------------------------------------------------------------ the clock
const digitsOf = (d) => { const h = d.getHours(), m = d.getMinutes(); return [(h / 10) | 0, h % 10, (m / 10) | 0, m % 10]; };
/** Centre of a numeral's f-th sewn stitch (fractional f glides between). */
function sewPos(slot, digit, f, out) {
  const cells = SEW[digit], n = cells.length;
  f = kit.clamp(f, 0, n - 1);
  const i = Math.floor(f), j = Math.min(i + 1, n - 1), u = f - i;
  const [c0, r0] = SLOTS[slot];
  out[0] = XO + (c0 + kit.lerp(cells[i][0], cells[j][0], u)) * CW + CW / 2;
  out[1] = Y0 + (r0 + kit.lerp(cells[i][1], cells[j][1], u)) * RH + RH / 2;
  return out;
}
const P = [0, 0], Q = [0, 0];

// buffers
const IMG = new Float32Array(3 * W * H);
const SC = new Float32Array(3 * NC * NR);     // stitch colours
const KG = new Float32Array(NC * NR);         // contrast yarn per stitch
const FL = new Float32Array(NC * NR);         // flatness: motif stitches are fuller
const K = new Float32Array(4 * GW * GH);      // contrast yarn per numeral cell
const JIT = new Float32Array(NC * NR);
for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) JIT[r * NC + c] = 0.9 + 0.2 * kit.hash(c, r, 7);
const DXR = new Float32Array(H), DYC = new Float32Array(W);
const PTS = [];

/** Where each numeral is in its turn: removed U of its old stitches, sewn S
 *  of its new ones; plus the strands and needles in flight. */
function plan(date) {
  const sec = kit.secOf(date);
  const now = digitsOf(date), old = digitsOf(new Date(date.getTime() - 60000));
  const st = { now, old: now.slice(), U: [0, 0, 0, 0], S: now.map((d) => SEW[d].length), strands: [], needles: [], frog: null };
  const ch = [0, 1, 2, 3].filter((k) => old[k] !== now[k]);
  if (!ch.length) return st;
  const hour = old[0] !== now[0] || old[1] !== now[1];
  if (!hour && sec < 3.2) {
    ch.forEach((k, idx) => {
      const o = idx * 0.2, a = sec - o, nO = SEW[old[k]].length, nN = SEW[now[k]].length;
      st.old[k] = old[k];
      st.U[k] = nO * kit.ease.inOut(kit.clamp(a / 0.9));
      st.S[k] = nN * kit.ease.inOut(kit.clamp((a - 1.05) / 1.35));
      const exit = [XO + (SLOTS[k][0] + 2) * CW + (k % 2 ? 14 : -14), 76];
      if (a > 0 && a < 1.3) {
        sewPos(k, old[k], nO - st.U[k], P);
        let ax = P[0], ay = P[1];
        if (a > 0.9) { const z = kit.ease.in(kit.clamp((a - 0.9) / 0.35)); ax = kit.lerp(ax, exit[0], z); ay = kit.lerp(ay, exit[1], z); }
        st.strands.push([ax, ay, exit[0], exit[1], a]);
      }
      needleFor(st, k, now[k], a, 0.8, 1.05, 2.4, 2.75, st.S[k]);
    });
    return st;
  }
  if (!hour || sec >= 7) return st;
  // ------------------------------------------------ the hour: frogging
  for (const k of ch) st.old[k] = old[k];
  const order = ch.slice().reverse();
  const tot = order.reduce((s, k) => s + SEW[old[k]].length, 0);
  const Ut = tot * kit.ease.inOut(kit.clamp((sec - 0.85) / 2.25));
  let acc = 0, pull = null;
  for (const k of order) {
    const n = SEW[old[k]].length;
    st.U[k] = kit.clamp(Ut - acc, 0, n);
    if (!pull && st.U[k] < n) pull = sewPos(k, old[k], n - st.U[k], [0, 0]);
    acc += n;
  }
  for (const k of ch) st.S[k] = 0;
  st.frog = frogAt(sec);
  const mouth = st.frog.mouth;
  if (sec > 0.6 && sec < 3.6) {
    let [ax, ay] = pull || [mouth[0], mouth[1]];
    if (!pull) { /* fully ripped: the tail has gone */ }
    else if (sec > 3.1) { const z = kit.ease.in(kit.clamp((sec - 3.1) / 0.4)); ax = kit.lerp(ax, mouth[0], z); ay = kit.lerp(ay, mouth[1], z); }
    if (pull) st.strands.push([ax, ay, mouth[0], mouth[1], sec * 1.4]);
  }
  // sew the new numerals in reading order with one needle
  ch.forEach((k, j) => {
    const t0 = 3.2 + j * 0.8, n = SEW[now[k]].length;
    st.S[k] = n * kit.ease.inOut(kit.clamp((sec - t0 - 0.12) / 0.62));
    const last = j === ch.length - 1;
    if (sec >= t0 && (sec < t0 + 0.8 || last)) {
      const from = j ? sewPos(ch[j - 1], now[ch[j - 1]], 99, [0, 0]) : null;
      needleFor(st, k, now[k], sec - t0, 0, 0.12, 0.74, last ? 1.05 : 0.8, st.S[k], from);
    }
  });
  return st;
}

/** A tapestry needle sewing numeral `digit` into slot k: flies in over
 *  [e0, e1], sews to stitch S until s1, flies out by s2. */
function needleFor(st, k, digit, a, e0, e1, s1, s2, S, from = null) {
  if (a < e0 || a > s2) return;
  const n = SEW[digit].length;
  let tx, ty, ux = 1, uy = 0.35, thread = null;
  if (a < e1) {
    sewPos(k, digit, 0, P);
    const low = k >= 2; // minute numerals are reached from below, hours from above
    const fx = from ? from[0] : P[0] + 8, fy = from ? from[1] : low ? 80 : -14;
    const z = kit.ease.inOut((a - e0) / (e1 - e0));
    tx = kit.lerp(fx, P[0], z); ty = kit.lerp(fy, P[1], z);
    ux = P[0] - fx; uy = P[1] - fy;
  } else if (a < s1) {
    sewPos(k, digit, S, P); sewPos(k, digit, S - 1.4, Q);
    // the needle dips under each stitch's legs: a small weave
    const w = Math.sin(S * Math.PI * 2) * 0.5;
    tx = P[0]; ty = P[1] + w;
    ux = P[0] - Q[0]; uy = P[1] - Q[1] + 0.8;
    if (S > 0.5) { sewPos(k, digit, Math.max(0, S - 1), Q); thread = [Q[0], Q[1], CREAM]; }
  } else {
    sewPos(k, digit, n - 1, P);
    const z = kit.ease.in((a - s1) / (s2 - s1));
    tx = kit.lerp(P[0], P[0] + 10, z); ty = kit.lerp(P[1], k >= 2 ? 82 : -16, z);
    ux = 0.6; uy = k >= 2 ? 1 : -1;
    sewPos(k, digit, n - 1, Q); thread = [Q[0], Q[1], CREAM];
  }
  const L = Math.hypot(ux, uy) || 1;
  st.needles.push([tx, ty, ux / L, uy / L, thread]);
}

// The frog's hops: [t0, t1, x0, y0, x1, y1, height]
const HOPS = [[0, 0.6, 78, 80, 50, 49, 16], [1.0, 1.6, 50, 49, 30, 30, 9], [1.85, 2.45, 30, 30, 12, 47, 8], [2.7, 3.3, 12, 47, -24, 34, 10]];
function frogAt(t) {
  let x = HOPS[0][2], y = HOPS[0][3], sx = 1, sy = 1, legs = 0, puff = 0;
  for (let h = 0; h < HOPS.length; h++) {
    const [t0, t1, x0, y0, x1, y1, ht] = HOPS[h];
    if (t >= t1) {
      x = x1; y = y1;
      const since = t - t1, next = HOPS[h + 1]?.[0] ?? 99;
      const land = Math.exp(-since * 9);
      sx = 1 + 0.14 * land; sy = 1 - 0.18 * land;
      const crouch = kit.smoothstep(next - 0.2, next, t); // anticipation
      sx += 0.08 * crouch; sy -= 0.12 * crouch;
      puff = Math.max(0, Math.sin(kit.clamp((since - 0.05) / 0.3) * Math.PI));
      continue;
    }
    if (t >= t0) {
      const u = (t - t0) / (t1 - t0);
      x = kit.lerp(x0, x1, u); y = kit.lerp(y0, y1, u) - ht * 4 * u * (1 - u);
      sx = 0.94; sy = 1.08; legs = Math.sin(u * Math.PI); puff = 0;
    }
    break;
  }
  const face = t < 0.95 ? 1 : -1;
  return { x, y, sx, sy, legs, puff, face, mouth: [x + face * 4.4 * sx, y + 2.6 * sy] };
}

// ---------------------------------------------------------------- frame
export default {
  name: 'Knit',
  blurb: 'Fair Isle jumper: the time is its colourwork; needles knit the minute, a toy frog frogs the hour',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.34, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx), date = ctx.date, t = date.getTime() / 1000 % 86400;
    const sec = kit.secOf(date), mins = date.getMinutes();
    const st = plan(date);

    // contrast yarn per numeral cell
    K.fill(0);
    for (let k = 0; k < 4; k++) {
      const base = k * GW * GH;
      const so = SEW[st.old[k]], sn = SEW[st.now[k]];
      const nO = so.length;
      const showOld = st.old[k] !== st.now[k] || st.U[k] > 0;
      // a numeral being ripped out pales as its yarn goes, so what is left
      // of it reads as undone, not as another digit
      const pale = 1 - 0.5 * kit.clamp((st.U[k] / nO) * 3);
      if (showOld) for (let i = 0; i < nO; i++) {
        const v = kit.clamp(nO - st.U[k] - i) * pale;
        const p = base + so[i][1] * GW + so[i][0];
        if (v > K[p]) K[p] = v;
      }
      for (let i = 0; i < sn.length; i++) {
        const v = kit.clamp(st.S[k] - i);
        const p = base + sn[i][1] * GW + sn[i][0];
        if (v > K[p]) K[p] = v;
      }
    }

    // the needles' work point: one stitch per 3.75 s, turning every row
    const dir = mins % 2 ? 1 : -1;
    const sf = (sec / 60) * NC, sc = Math.floor(sf), ph = sf - sc;
    const cols = Math.min(NC, sc + kit.smoothstep(0.78, 1, ph));
    const xw = XO + (dir > 0 ? cols * CW : NC * CW - cols * CW);
    const liveNew = LIVE[mins % 2], liveOld = LIVE[(mins + 1) % 2];

    // stitch colours
    const bgDim = 1 - 0.6 * ctx.night;
    KG.fill(0);
    for (let r = 1; r < NR - 1; r++) {
      if (r === 7) continue;
      const hourBand = r < 7, gr = hourBand ? r - 1 : r - 8;
      for (let c = 0; c < NC; c++) {
        const slot = (hourBand ? 0 : 2) + (c >= 5 ? 1 : 0), gc = c - SLOTS[slot][0];
        if (gc >= 0 && gc < GW) KG[r * NC + c] = K[slot * GW * GH + gr * GW + gc];
      }
    }
    for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) {
      let col, k = 0, cr = CREAM;
      if (r === 0) {
        const kl = dir > 0 ? kit.clamp((xw - XO - c * CW) / CW) : kit.clamp(((c + 1) * CW - xw + XO) / CW);
        col = liveOld; cr = liveNew; k = kl;
      } else if (r === 7) col = PEERIE[c % 2];
      else if (r === 14) col = c % 2 ? RIB : MIN_BG[0];
      else {
        const hourBand = r < 7;
        col = hourBand ? HOUR_BG[r - 1] : MIN_BG[r - 8];
        k = KG[r * NC + c];
        // outline: ground stitches touching the motif are knitted in a
        // dark contrast yarn, so each numeral stands on a black keyline
        let o = 0;
        for (let q = 0; q < 4; q++) {
          const rr = r + (q === 0 ? -1 : q === 1 ? 1 : 0), cc = c + (q === 2 ? -1 : q === 3 ? 1 : 0);
          if (rr < 1 || rr >= NR - 1 || rr === 7 || cc < 0 || cc >= NC || (hourBand !== rr < 7)) continue;
          const v = KG[rr * NC + cc];
          if (v > o) o = v;
        }
        col = kit.mix(col, OUTLINE, o * 0.6);
      }
      FL[r * NC + c] = r === 0 ? 0 : k;
      const j = JIT[r * NC + c], lift = 1 + 1.6 * k * (1 - k);
      const p = 3 * (r * NC + c);
      // at night the ground sinks further than the cream motif, so the
      // numerals keep their contrast when the whole jumper dims
      const kb = (1 - k) * bgDim * 0.8, jl = j * lift * (1 + 0.2 * k);
      SC[p] = (col[0] * kb + cr[0] * k) * jl;
      SC[p + 1] = (col[1] * kb + cr[1] * k) * jl;
      SC[p + 2] = (col[2] * kb + cr[2] * k) * jl;
      if (r === 0 && k > 0) { const f = 1 - (1 - bgDim) * k; SC[p] *= f; SC[p + 1] *= f; SC[p + 2] *= f; }
    }

    // the fabric hangs, sways and breathes
    const breath = 0.45 * Math.sin((t * kit.TAU) / 6.5);
    for (let y = 0; y < H; y++) {
      const hang = kit.clamp((y - Y0) / 44);
      DXR[y] = (0.5 * Math.sin(t * 0.55 + y * 0.05) + 0.2 * Math.sin(t * 1.3 - y * 0.11)) * hang;
    }
    for (let x = 0; x < W; x++) DYC[x] = 0.3 * Math.sin(x * 0.09 + t * 0.8) + 0.15 * Math.sin(x * 0.23 - t * 1.1);
    const tugPh = ph * 4 - Math.floor(ph * 4);
    const tug = 0.5 * Math.sin(Math.PI * kit.clamp(tugPh / 0.5)) * (ph < 0.78 ? 1 : 0);

    const img = IMG;
    for (let y = 0; y < H; y++) {
      const hang = kit.clamp((y - Y0) / 44), dxr = DXR[y];
      const near = Math.exp(-(y - Y0) / 5);
      for (let x = 0; x < W; x++) {
        const fx = x + 0.5 + dxr - XO;
        let fy = y + 0.5 + DYC[x] * hang + breath * (y - Y0) / 60;
        const dxw = (x - xw) / 6;
        fy += tug * near * Math.exp(-dxw * dxw);
        const ry = fy - Y0;
        const o = 3 * (y * W + x);
        const r = Math.floor(ry / RH), c = Math.floor(fx / CW);
        if (r < -1) { img[o] = img[o + 1] = img[o + 2] = 0; continue; }
        const lx = fx - c * CW, ly = ry - r * RH;
        const v = TEX[Math.min(TH - 1, Math.floor(ly * TR)) * TW + Math.min(TW - 1, Math.floor(lx * TR))];
        // the stitch's yarn colour, blended with its neighbour within half
        // an LED of the cell edge so a shifted stitch glides
        let c2 = c, wc = 0, r2 = r, wr = 0;
        if (lx < 0.5) { c2 = c - 1; wc = 0.5 - lx; } else if (lx > CW - 0.5) { c2 = c + 1; wc = lx - CW + 0.5; }
        if (ly < 0.5) { r2 = r - 1; wr = 0.5 - ly; } else if (ly > RH - 0.5) { r2 = r + 1; wr = ly - RH + 0.5; }
        let R = 0, Gc = 0, B = 0, fl = 0;
        for (let q = 0; q < 4; q++) {
          const cc = q & 1 ? c2 : c, rr = q & 2 ? r2 : r;
          const w = (q & 1 ? wc : 1 - wc) * (q & 2 ? wr : 1 - wr);
          if (w <= 0 || rr < 0 || rr >= NR) continue;
          const sp = 3 * (rr * NC + (cc < 0 ? 0 : cc >= NC ? NC - 1 : cc));
          R += SC[sp] * w; Gc += SC[sp + 1] * w; B += SC[sp + 2] * w;
          fl += FL[sp / 3] * w;
        }
        // cream stitches are full and fluffy: their V gaps fill in, so the
        // numeral reads as one solid shape and not as loose chevrons
        const vv = v + (0.3 + 0.7 * v - v) * fl;
        R *= vv; Gc *= vv; B *= vv;
        // the soft light of the folds, drifting
        const L = 0.86 + 0.2 * Math.sin(0.07 * (x + 0.5 * y) - t * 0.4) + 0.08 * Math.sin(0.12 * (x - y) + t * 0.23);
        img[o] = R * L; img[o + 1] = Gc * L; img[o + 2] = B * L;
      }
    }

    // two steel needles along the top, crossing in an X at the work point
    const cyc = ph * 4, step = Math.floor(cyc), sub = cyc - step;
    const ins = ph < 0.78 ? Math.sin(Math.PI * kit.clamp(sub / 0.6)) : 0;
    const tipW = xw + dir * (3 + 3 * ins), tipU = xw - dir * 3.5;
    const farW = dir > 0 ? -14 : W + 14, farU = dir > 0 ? W + 14 : -14;
    const yAt = (x0, y0, x1, y1, x) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    // live loops: the back of each wrap, rising from its stitch over the needle
    for (let c = 0; c < NC; c++) {
      const x = XO + c * CW + CW / 2;
      if (Math.abs(x - xw) < 3) continue;
      const p = 3 * c;
      const lc = [SC[p] * 0.55, SC[p + 1] * 0.55, SC[p + 2] * 0.55];
      seg(img, x - 1.3, 6.5, x - 0.9, 0.8, 0.7, lc, 1);
      seg(img, x + 1.3, 6.5, x + 0.9, 0.8, 0.7, lc, 1);
    }
    const nd = (fx, fy, tx, ty) => {
      seg(img, fx + 0.4, fy + 1.1, tx + 0.4, ty + 1.1, 1.2, [0, 0, 0], 0.7);
      seg(img, fx, fy, tx, ty, 1.15, BIRCH, 1);
      seg(img, fx, fy - 0.55, tx, ty - 0.55, 0.35, BIRCH_HI, 0.7);
    };
    nd(farU, 3.4, tipU, 2.4);
    nd(farW, 2.4, tipW, 4.1);
    // the front of each wrap, over the needle
    for (let c = 0; c < NC; c++) {
      const x = XO + c * CW + CW / 2;
      if (Math.abs(x - xw) < 3) continue;
      const p = 3 * c, onW = dir > 0 ? x < xw : x > xw;
      const ny = onW ? yAt(farW, 2.4, tipW, 4.1, x) : yAt(farU, 3.4, tipU, 2.4, x);
      seg(img, x - 1.2, ny - 1.3, x + 1.2, ny + 1.4, 0.6, [SC[p], SC[p + 1], SC[p + 2]], 1);
    }
    // the working yarn rises from the needle tips to the ball off the top;
    // on every wrap it swings round the tip
    const wrap = ph < 0.78 && sub > 0.3 && sub < 0.75 ? Math.sin(((sub - 0.3) / 0.45) * kit.TAU) : 0;
    const yw = kinked(xw + dir * 1.5 + wrap * 1.5, 3.5 - Math.abs(wrap), xw + dir * 6 + 3 * Math.sin(t * 0.9), -6, { kink: 0.4, wave: 3, bow: -dir * 2, relax: 0, phase: t * 2, out: PTS });
    strand(img, yw, 0.65, liveNew, 1, 0.5);
    // click: a glint where the tips meet on every insert, wrap and pull
    if (ph < 0.78) {
      const glint = Math.exp(-sub * 10);
      const gx = Math.max(0, Math.min(W - 1, Math.round(xw))), gp = 3 * (3 * W + gx);
      img[gp] += 1.2 * glint; img[gp + 1] += 1.1 * glint; img[gp + 2] += 0.9 * glint;
    }

    // strands of unravelled yarn
    for (const [ax, ay, bx, by, a] of st.strands) {
      const pts = kinked(ax, ay, bx, by, { kink: 2.2, wave: 4.6, sag: 3, bow: 5 * Math.sin(a * 3 + ax * 0.1), phase: -a * 7, relax: 0.35, out: PTS });
      strand(img, pts, 0.7, CREAM, 1, 0.75);
    }
    for (const [tx, ty, ux, uy, thread] of st.needles) darner(img, tx, ty, ux, uy, 1, thread);
    if (st.frog) {
      const f = st.frog;
      frog(img, f.x, f.y, { sx: f.sx, sy: f.sy, face: f.face, puff: f.puff, legs: f.legs });
    }

    kit.blitGrid(ctx, img, 1 - 0.35 * ctx.night);
    void G;
  },
};
