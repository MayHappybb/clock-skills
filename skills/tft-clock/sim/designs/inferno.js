// Inferno: the time is four letters of fuel standing in a hearth, burning.
// Each numeral is a hard 1-bit glyph drawn as a line of fuel (heavy
// uprights, lighter crossings, terminals that taper into flicks) and it is
// on fire: a crown of flame tongues stands on every stretch of its upper
// edge, each one tapering, swaying and flickering, now and then leaping or
// tearing off a lick that rises on its own; low flames lick up off the coals
// between the letters; sparks rise and embers ride the draught across the
// whole strip. The 1 burns like a candle. Two embers are the colon.
//
// The time itself is alive every second: cooler flecks rise through each
// stroke's core; on the beat a heat ring runs in from the letters' edges to
// their centres (an inline that closes up), the coals and colon flare, and a
// gust crosses the strip left to right, flaring the tongues and laying them
// over. Every 10 s one letter pops and throws a shower of sparks. The
// silhouettes stay put: every effect stays 2+ px inside a stroke, and the
// fire only ever stands above a letter's crown (valleys like the 4's open
// top are bridged, and never more than 4 px down its flanks), behind a 2 px
// ground moat, so no flame closes a counter or touches a neighbour.
//
// Minute: from :58.2 the changing letters burn down: their flames climb
// higher while the stroke chars evenly from its edges in (every changing
// letter on the same schedule, by fraction of its own ink), so it thins to a
// glowing skeleton, crumbles to flecks and the ash blows up and away; empty
// by :59.8. At :00 the new letter is laid as a dotted line of fuel, a spark
// runs every stroke at once as a fuse, at :00.6 it ignites, swelling from
// the centreline to full weight, and flares up.
// Hour: a flashover. A wall of flame sweeps the strip right to left; inside
// it every letter shows in negative (the two colours swap, so the time
// stays readable), and in its wake the new letters stand lit and roaring.
//
// Two colours, a mono module's own pair: flame orange #ff7a1a ink on deep
// ember brown #1e0804, the colours of the fire and the soot behind it; heat
// is drawn only as 1-bit (ordered-dither fringes on the tongues, stipple in
// the coals). Night only dims the backlight (to 35 %) and lowers the flames.
//
// Cost: one integer pass over the glass (the fire through a heat buffer the
// tongues are rasterised into, a 64x128 noise lookup and a Bayer threshold;
// glyph lookups below the fire floor), ~15 tongues of ~25 rows, ~80 sparks.
// The fire floor and tongue sites are worked out once a minute from the
// glyphs' crowns (~30k integer ops, in the frame that needs them). Flash:
// glyphs 10 x 4 B x (32x50 + 28x38) = 107 KB, noise 8 KB, small tables ~1 KB.
// RAM: heat buffer 12.8 KB + a few per-minute layouts (~1 KB each).
import { to565, hash, clockFields, sin, cos, noise, clamp, ease } from '../js/kit.js';
import { makeGlyphs } from './inferno-glyphs.js';

const W = 160, H = 80;
const INK = to565(0xff7a1a), GND = to565(0x1e0804);
const BED = 76;                       // the coal bed: rows 76..79
const DIG_B = 74;                     // digits end above row 74 (rows 74, 75: moat)
const HG = makeGlyphs(32, 50, 9), MG = makeGlyphs(28, 38, 7);
const SLOTS = [
  { x: 6, y: DIG_B - 50, G: HG, L: 30 },
  { x: 42, y: DIG_B - 50, G: HG, L: 30 },
  { x: 88, y: DIG_B - 38, G: MG, L: 34 },
  { x: 120, y: DIG_B - 38, G: MG, L: 34 },
];
const COL_SLOT = new Int8Array(W).fill(-1);
SLOTS.forEach((S, k) => { for (let x = S.x; x < S.x + S.G.w; x++) COL_SLOT[x] = k; });

// ---- flash: a tileable value-noise texture, 64 x 128, tall cells (flame tongues)
const NT = new Uint8Array(64 * 128);
{
  const oct = (cx, cy, amp, seed) => {
    const nx = 64 / cx, ny = 128 / cy;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
      const fx = x / cx, fy = y / cy, ix = Math.floor(fx), iy = Math.floor(fy);
      const ux = fx - ix, uy = fy - iy, sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
      const r = (a, b) => hash(((a % nx) + nx) % nx, ((b % ny) + ny) % ny, seed) / 4294967296;
      const v = r(ix, iy) * (1 - sx) * (1 - sy) + r(ix + 1, iy) * sx * (1 - sy) + r(ix, iy + 1) * (1 - sx) * sy + r(ix + 1, iy + 1) * sx * sy;
      NT[y * 64 + x] += Math.round(v * amp);
    }
  };
  oct(8, 16, 170, 1); oct(4, 8, 85, 2);
}
// ---- flash: the coal bed, lumps with 1-px gaps and rounded crowns (rows BED..79)
const COAL = new Uint8Array(W * 4);
{
  let x = 0, j = 0;
  while (x < W) {
    const w = 5 + (hash(j, 3) % 5), hgt = 2 + (hash(j, 4) % 3);   // lump width 5..9, height 2..4
    for (let i = 0; i < w && x + i < W; i++) {
      const edge = i === 0 || i === w - 1;
      const top = 4 - hgt + (edge ? 1 : 0);
      for (let r = Math.max(0, top); r < 4; r++) COAL[r * W + x + i] = 1;
    }
    x += w + 1; j++;
  }
}
// flash: a tongue's half-width along its height, and its sway envelope u^1.5
const TAPER = Float32Array.from({ length: 256 }, (_, i) => (1 - i / 255) ** 0.9 * (1 + 0.8 * i / 255));
const U15 = Float32Array.from({ length: 256 }, (_, i) => (i / 255) ** 1.5);
// flash: an ember, 6 x 6 (2 = its always-lit rim)
const EMBER = Uint8Array.from('.2222.222222221122221122222222.2222.'.replace(/\./g, '0'), Number);
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v * 16 + 8);

// ---- per minute: the fire's floor along the digits' upper envelope
const LOW_H = 11, R_CLOSE = 30, MOAT_S = 2, MOAT_T = 2, DEEP = 4;
const LAYOUTS = new Map();
function layoutOf(digs) {
  let L = LAYOUTS.get(digs);
  if (L) return L;
  const hgt = new Int16Array(W), fuel = new Uint8Array(W);
  for (let x = 0; x < W; x++) {
    const k = COL_SLOT[x];
    if (k < 0) continue;
    const S = SLOTS[k], top = S.G.top[+digs[k]][x - S.x];
    if (top >= 0) hgt[x] = DIG_B - (S.y + top);
  }
  // per glyph: fill valleys between its own peaks (the 4's open top), and keep
  // the floor at most DEEP px below the glyph's crown (no flames down its flanks)
  const h2 = new Int16Array(W).fill(-1);
  for (let k = 0; k < 4; k++) {
    const S = SLOTS[k];
    let apex = 0, ax = S.x;
    for (let x = S.x; x < S.x + S.G.w; x++) if (hgt[x] > apex) { apex = hgt[x]; ax = x; }
    const dl = digs[k] === '4' ? 60 : DEEP;   // the 4's diagonal is a crown too
    for (let x = S.x; x < S.x + S.G.w; x++) {
      if (!hgt[x]) continue;
      let lm = 0, rm = 0;
      for (let d = 0; d <= R_CLOSE; d++) {
        if (x - d >= S.x) lm = Math.max(lm, hgt[x - d]);
        if (x + d < S.x + S.G.w) rm = Math.max(rm, hgt[x + d]);
      }
      h2[x] = Math.max(hgt[x], Math.min(lm, rm), apex - (x < ax ? dl : DEEP));
    }
  }
  // empty columns (gaps, the sides of a 1, the margins): a straight bridge
  for (let x = 0; x < W; x++) if (h2[x] < 0) {
    let a = x, b = x;
    while (a >= 0 && h2[a] < 0) a--;
    while (b < W && h2[b] < 0) b++;
    const ha = a >= 0 ? h2[a] : h2[b], hb = b < W ? h2[b] : h2[a];
    const u = a >= 0 && b < W ? (x - a) / (b - a) : 0;
    h2[x] = Math.round(ha + (hb - ha) * u);
  }
  for (let x = 0; x < W; x++) if (h2[x] < 0) h2[x] = 0;
  const T = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    let m = 0;
    for (let d = -MOAT_S; d <= MOAT_S; d++) if (x + d >= 0 && x + d < W) m = Math.max(m, h2[x + d]);
    T[x] = DIG_B - m - MOAT_T;
    fuel[x] = hgt[x] <= 0 ? 0 : hgt[x] >= h2[x] - 3 ? 255 : 110;
  }
  // tongues: one every ~7 px along each fuelled run of a digit's crown
  const tongues = [];
  for (let k = 0; k < 4; k++) {
    const S = SLOTS[k];
    for (let x = S.x; x < S.x + S.G.w;) {
      if (fuel[x] !== 255) { x++; continue; }
      let e = x; while (e < S.x + S.G.w && fuel[e] === 255) e++;
      const n = e - x, c = Math.max(1, Math.round(n / 7));
      for (let i = 0; i < c; i++) tongues.push({ k, bx: Math.floor(x + ((i + 0.5) * n) / c), w: S.G === HG ? 4.6 : 3.9 });
      x = e;
    }
  }
  // low flames off the coals, only where no digit stands within 2 columns
  const bot = new Int16Array(W).fill(-1), LOW = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    const k = COL_SLOT[x];
    if (k < 0) continue;
    const S = SLOTS[k], G = S.G, E = G.E[+digs[k]];
    for (let y = G.h - 1; y >= 0; y--) if (E[y * G.w + x - S.x]) { bot[x] = S.y + y; break; }
  }
  for (let x = 0; x < W; x++) {
    let m = -1;
    for (let d = -2; d <= 2; d++) if (x + d >= 0 && x + d < W) m = Math.max(m, bot[x + d]);
    LOW[x] = m < 0 ? BED - LOW_H : Math.max(BED - LOW_H, m + 4);
  }
  L = { T, fuel, tongues, LOW };
  LAYOUTS.set(digs, L);
  if (LAYOUTS.size > 6) LAYOUTS.delete(LAYOUTS.keys().next().value);
  return L;
}

const digitsOf = (f) => f.hh + f.mm;
const ROWS = new Int8Array(H);
const FM = new Float32Array(4), HB = new Uint8Array(W * H);
const AMP = 120, WALL_T = 1.1, WALL_W = 30;
// slot state per frame: mode 0 rest, 1 burning (p), 2 fuse (f), 3 ignite (r)
const MODE = new Uint8Array(4), PAR = new Float32Array(4);

const N_SPARK = 30, N_DRIFT = 16, N_POP = 26;
function spark(buf, x, y, sz) {
  buf[y * W + x] = INK;
  if (sz > 1) { buf[y * W + x + 1] = INK; if (y + 1 < H) { buf[(y + 1) * W + x] = INK; buf[(y + 1) * W + x + 1] = INK; } }
}

function pulse(u) {
  if (u < 0 || u > 0.6) return 0;
  if (u < 0.05) return u / 0.05;
  const v = 1 - (u - 0.05) / 0.55;
  return v * v;
}

export default {
  name: 'Inferno',
  blurb: 'Four letters of fuel burning in a hearth, 1-bit: flame tongues on every crown, a heat ring each beat, burned to ash and lit by a fuse each minute, a flashover at the hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    const tt = f.h * 3600 + f.m * 60 + s;
    const cur = digitsOf(f);
    const nxt = digitsOf(clockFields(new Date(ctx.date.getTime() + 60000)));
    const prv = digitsOf(clockFields(new Date(ctx.date.getTime() - 60000)));

    // ---- what each slot is doing
    const hourTurn = prv.slice(0, 2) !== cur.slice(0, 2);
    let xf = 999;
    for (let k = 0; k < 4; k++) { MODE[k] = 0; FM[k] = 1; }
    const b0 = nxt.slice(0, 2) !== cur.slice(0, 2) ? 58.4 : 58.2;   // before the hour the burn ends later
    if (s >= b0) {
      const p = ease.inOutQuad(clamp((s - b0) / 1.55, 0, 1));
      for (let k = 0; k < 4; k++) if (cur[k] !== nxt[k]) {
        MODE[k] = 1; PAR[k] = p;
        FM[k] = (1 + 2 * sin(Math.PI * p)) * (1 - p * p) * (1 - p * p);
      }
    } else if (s < 3 && hourTurn) {
      // the hour: a flashover sweeps right to left and lights the new digits in its wake
      xf = 172 - 236 * clamp(s / WALL_T, 0, 1) ** 1.25;
      for (let k = 0; k < 4; k++) {
        const S = SLOTS[k], cx = S.x + S.G.w / 2, gi = (cx - xf) / 28;
        const since = clamp(gi / 4, 0, 1);   // ~0..0.5 s after the wall passed
        if (cur[k] !== prv[k]) {
          if (gi <= 0) { MODE[k] = 4; FM[k] = 0; }
          else if (gi < 1) { MODE[k] = 3; PAR[k] = ease.outCubic(gi); FM[k] = 0.3 + 2.2 * gi; }
          else { const u = Math.max(0, 1 - (s - WALL_T * 0.6) / 2.2); FM[k] = 1 + 1.5 * u * u + (1 - since) * 0.8; }
        } else if (gi > 0) { const u = Math.max(0, 1 - (s - WALL_T * 0.6) / 2.2); FM[k] = 1 + 1.2 * u * u * since; }
      }
    } else if (s < 3) {
      for (let k = 0; k < 4; k++) if (cur[k] !== prv[k]) {
        if (s < 0.6) { MODE[k] = 2; PAR[k] = ease.inOutQuad(clamp((s - 0.05) / 0.5, 0, 1)); FM[k] = 0; }
        else if (s < 1.2) { const gg = (s - 0.6) / 0.6; MODE[k] = 3; PAR[k] = ease.outCubic(gg); FM[k] = 2.2 * gg * gg * (3 - 2 * gg); }
        else { const u = Math.max(0, 1 - (s - 1.2) / 1.8); FM[k] = 1 + 1.2 * u * u; }
      }
    }
    const L = layoutOf(cur), T = L.T, fuel = L.fuel, LOW = L.LOW;

    const nightK = 1 - 0.35 * ctx.night, frac = s - Math.floor(s);
    const gAll = pulse(frac - 0.15);
    const sc = (tt * 52) & 127, sct = (tt * 9) | 0, gBed = pulse(frac - 0.1);
    // the whoosh, every 10 s from one digit (not near the turn)
    const whId = Math.floor(s / 10), wh = s < 52 && s % 10 >= 5 ? s % 10 - 5 : -1, whk = hash(mk, whId) % 4;
    if (wh >= 0 && wh < 1) FM[whk] *= 1 + 1.3 * sin(Math.PI * wh);

    // ---- the tongues: each a tapering flame on a fuelled stretch of a digit's crown
    HB.fill(0);
    let ops = 0;
    for (let j = 0; j < L.tongues.length; j++) {
      const tg = L.tongues[j], k = tg.k, S = SLOTS[k];
      const gu = pulse(frac - tg.bx / 480);
      const leap = 1 + 0.7 * pulse(((tt * 0.9 + j * 0.618) % 3) - 0.2);   // now and then one tongue leaps
      const Hj = S.L * FM[k] * (0.5 + 0.7 * noise(tt * 1.9 + j * 3.7, 9)) * (1 + 0.6 * gu) * leap * nightK;
      if (Hj < 2) continue;
      const wj = tg.w * (0.85 + 0.3 * noise(tt * 2.6 + j * 5.3, 11)) * (FM[k] < 1 ? 0.6 + 0.4 * FM[k] : 1);
      const y0 = T[tg.bx], ph = j * 2.1, om = 5 + (j % 3);
      const lean = gu * 0.45 + 0.08 * sin(tt * 0.7 + j);
      for (let r = 0; r < Hj; r++) {
        const y = y0 - 1 - r;
        if (y < 0) break;
        const u = r / Hj, ui = (u * 255) | 0, hw = wj * TAPER[ui];
        if (hw < 0.35) continue;
        const cx = tg.bx + 0.5 + 3 * U15[ui] * sin(tt * om + ph - u * 4) + lean * u * Hj;
        const xa = Math.max(0, (cx - hw) | 0), xb = Math.min(W - 1, (cx + hw) | 0), inv = 340 / hw;
        for (let x = xa; x <= xb; x++) {
          let dx = x + 0.5 - cx; if (dx < 0) dx = -dx;
          const hv = (340 - dx * inv) | 0;
          if (hv > 0) { const i = y * W + x, v = hv > 255 ? 255 : hv; if (v > HB[i]) HB[i] = v; }
        }
        ops += (xb - xa + 1) * 6 + 300;   // a row: taper and sway lookups, a ksin, fixed point
      }
      // a lick: now and then the tip tears off and rises as its own small flame
      const lp = (tt * (1.1 + (j % 4) * 0.13) + j * 0.37) % 1;
      if (lp < 0.4 && FM[k] > 0.7) {
        const q = lp / 0.4, rr = 2.6 * (1 - q) + 0.6, cy = y0 - Hj * 0.8 - q * 22;
        const cx = tg.bx + 0.5 + lean * Hj + 2 * sin(tt * om + ph);
        for (let y = Math.max(0, (cy - rr * 2) | 0); y <= cy + rr * 2 && y < H; y++) {
          const dy = (y + 0.5 - cy) / 2, w2 = rr * rr - dy * dy;
          if (w2 <= 0) continue;
          for (let x = Math.max(0, (cx - rr) | 0); x <= cx + rr && x < W; x++) {
            const dx = x + 0.5 - cx;
            if (dx * dx < w2) { const i = y * W + x; HB[i] = 255; }
          }
        }
        ops += 200;
      }
    }
    ops += 220 * 50;   // ~220 noise() calls a frame (tongues, low flames)
    const rip = frac < 0.4 ? 12 + ((frac / 0.4) * 34) | 0 : 0;   // the beat: a ring runs in from the edge
    const sc3 = (tt * 60) & 127, SHIM = 84;
    for (let y = 0; y < H; y++) ROWS[y] = Math.round(1.2 * sin(y * 0.5 - tt * 7.3));

    // ---- the frame, one pass: fire above the floor, digits below it, the coals
    const buf = g.buf;
    for (let x = 0; x < W; x++) {
      const Tx = T[x], ks = COL_SLOT[x], fx = ks >= 0 && fuel[x] === 255 ? (FM[ks] >= 1 ? 255 : (255 * FM[ks]) | 0) : 0;
      for (let y = 0; y < Tx; y++) {
        const i = y * W + x, d = Tx - y;
        let hv = HB[i];
        if (fx && d < 6) { const sk = (fx * (6 - d)) / 6 | 0; if (sk > hv) hv = sk; }
        let v = GND;
        if (hv) {
          const n = NT[(((y + sc) & 127) << 6) | ((x + ROWS[y]) & 63)];
          const h = hv + (((n - 128) * AMP) >> 7);
          const q = 128 + (h - 128) * 4;
          if (q > B4[((y & 3) << 2) | (x & 3)]) v = INK;
        }
        buf[i] = v;
      }
      ops += Tx * 8;
      const k = COL_SLOT[x];
      for (let y = Tx < 0 ? 0 : Tx; y < BED; y++) buf[y * W + x] = GND;
      // low flames licking up off the coals
      const lo = LOW[x];
      if (lo < BED) {
        const lb = (4 + 9 * noise(x / 3.2 + tt * 1.7, 13)) * (1 + 0.5 * pulse(frac - x / 480)) * nightK, lq = (65536 / lb) | 0;
        for (let y = lo; y < BED; y++) {
          const hb = 255 - (((BED - 1 - y) * lq) >> 8);
          if (hb < -100) continue;
          const n = NT[(((y + sc) & 127) << 6) | ((x + 23 + ROWS[y]) & 63)];
          const h = hb + (((n - 128) * AMP) >> 7);
          if (128 + (h - 128) * 4 > B4[((y & 3) << 2) | (x & 3)]) buf[y * W + x] = INK;
        }
        ops += (BED - lo) * 8 + 40;
      }
      if (k >= 0) {
        const S = SLOTS[k], G = S.G, dg = +cur[k], E = G.E[dg], gw = G.w, lx = x - S.x;
        const mode = MODE[k], par = PAR[k];
        const y0 = Math.max(S.y, Tx);
        for (let y = y0; y < S.y + G.h; y++) {
          const i = (y - S.y) * gw + lx, e = E[i];
          if (!e) continue;
          let on = true;
          if (mode === 1) on = G.K[dg][i] >= par * 256;
          else if (mode === 2) {
            const u = G.U[dg][i], D = G.D[dg][i], uf = par * 255;
            on = (D <= 10 && u <= uf) || (D <= 30 && u <= uf && u > uf - 16) || (D <= 6 && ((u >> 3) & 1) === 0);
          } else if (mode === 3) on = G.D[dg][i] <= 10 + par * 40;
          else if (mode === 4) on = false;
          if (on && e >= 20 && mode !== 3) {
            // heat: cooler flecks rising through the stroke's core (2.5 px in, so the edge stays crisp)
            const n = NT[((((y << 1) + sc3) & 127) << 6) | ((x + 21) & 63)];
            if (n < SHIM - gAll * 120) on = false;
          }
          if (on && rip > 0 && e >= 12 && e - rip < 6 && rip - e < 6 && mode === 0) on = false;
          if (on) buf[y * W + x] = INK;
        }
        ops += G.h * 6;
      }
      // coals: lumps whose glow crusts over between beats and flares on the beat
      for (let y = BED; y < H; y++) {
        const i = y * W + x;
        let on = false;
        if (COAL[(y - BED) * W + x]) {
          const n = NT[(((y * 5 + sct) & 127) << 6) | ((x * 3) & 63)];
          on = n + (B4[((y & 3) << 2) | (x & 3)] >> 2) > 110 + (y - BED) * 6 - gBed * 140;
        }
        buf[i] = on ? INK : GND;
      }
    }
    // ---- the colon: two embers between hours and minutes, crusting over and flaring on the beat
    for (let c = 0; c < 2; c++) {
      const ey = c ? 61 : 47;
      for (let r = 0; r < 6; r++) for (let q = 0; q < 6; q++) {
        if (!EMBER[r * 6 + q]) continue;
        const x = 79 + q, y = ey + r;
        const n = NT[((((y << 1) + sct * 3) & 127) << 6) | ((x * 3 + c * 17) & 63)];
        buf[y * W + x] = EMBER[r * 6 + q] === 2 || n > 70 - gBed * 120 ? INK : GND;
      }
    }
    ops += 72 * 4;
    // ---- ash: the charred flecks of a burning digit lift off and blow away up and right
    for (let k = 0; k < 4; k++) if (MODE[k] === 1) {
      const S = SLOTS[k], G = S.G, dg = +cur[k], E = G.E[dg], K = G.K[dg], pk = PAR[k] * 256;
      for (let i = 0; i < G.w * G.h; i++) {
        if (!E[i]) continue;
        const r = pk - K[i];
        if (r <= 0 || r > 64 || (hash(i, k) % 6)) continue;
        const a = r / 64, gx = i % G.w, gy = (i / G.w) | 0;
        const x = Math.round(S.x + gx + a * 16 + 2 * sin(a * 7 + i)), y = Math.round(S.y + gy - a * a * 30 - a * 14);
        if (x >= 0 && x < W && y >= 0 && y < BED) buf[y * W + x] = INK;
      }
      ops += G.w * G.h * 3;
    }
    // ---- the flashover wall: solid flame, ragged edges; inside it the digits show in negative
    if (xf < 999) {
      for (let y = 0; y < H; y++) {
        const jl = (NT[((((y << 1) + sc) & 127) << 6) | 7] - 128) >> 4, jr = (NT[((((y << 1) + sc) & 127) << 6) | 39] - 128) >> 4;
        const xa = Math.max(0, Math.round(xf + jl - (y < 40 ? (40 - y) >> 3 : 0))), xb = Math.min(W - 1, Math.round(xf + WALL_W + jr));
        for (let x = xa; x <= xb; x++) {
          const i = y * W + x;
          if (y < T[x]) buf[i] = NT[((((y >> 1) + sc + sc) & 127) << 6) | ((x * 2) & 63)] < 62 ? GND : INK;
          else buf[i] = y >= BED ? INK : buf[i] === INK ? GND : INK;
        }
        if (xb >= xa) ops += (xb - xa + 1) * 4;
      }
    }
    // ---- sparks: closed form from index and day-time, rising off the tongues
    const nT = L.tongues.length;
    for (let j = 0; j < N_SPARK; j++) {
      const P = 1.4 + (hash(j, 1) % 1000) / 800, ph = (hash(j, 2) % 1000) / 1000 * P;
      const cyc = Math.floor((tt + ph) / P), a = tt + ph - cyc * P;
      const tg = L.tongues[hash(j, cyc) % nT];
      if (!tg || FM[tg.k] < 0.3) continue;
      const v = 18 + (hash(j, cyc, 5) % 18);
      const y = Math.round(T[tg.bx] - 10 - v * a - 3 * a * a);
      const x = Math.round(tg.bx + ((hash(j, cyc, 6) % 9) - 4) + 2.2 * sin(a * 4 + j) + a * 6 * (hash(j, 7) & 1 ? 1 : -1));
      if (y < 0 || x < 0 || x >= W - 1 || y >= T[x] - 1 || y >= T[x + 1] - 1) continue;
      spark(buf, x, y, a < 0.35 ? 2 : 1);
    }
    // embers riding the draught across the whole strip, left to right
    for (let j = 0; j < N_DRIFT; j++) {
      const v = 34 + (hash(j, 21) % 40), y0 = 3 + (hash(j, 22) % 22);
      const xx = ((hash(j, 23) % 200) + v * tt) % 200 - 20;
      const x = Math.round(xx), y = Math.round(y0 + 3 * sin(tt * (1.3 + (j % 4) * 0.4) + j) - (xx / 40));
      if (x < 0 || x >= W - 1 || y < 0 || y >= T[x] - 1 || y >= T[x + 1] - 1) continue;
      spark(buf, x, y, j % 3 === 0 ? 2 : 1);
    }
    // the whoosh: every 10 s one digit throws a fan of sparks
    if (wh >= 0) for (let j = 0; j < N_POP; j++) {
      const a = wh - (j % 5) * 0.05;
      if (a <= 0 || a > 1.5) continue;
      const S = SLOTS[whk], side = j & 1 ? 1 : -1;
      const ang = side * (0.35 + ((hash(j, whId, 8) % 1000) / 1000) * 0.95);   // from vertical
      const v = 85 + (hash(j, whId, 9) % 80);
      const x = Math.round(S.x + S.G.w / 2 + sin(ang) * v * a), y = Math.round(S.y - 4 - cos(ang) * v * a + 70 * a * a);
      if (y < 1 || x < 1 || x >= W - 3 || y >= H - 3 || y >= T[x] - 2 || y >= T[x + 1] - 2) continue;
      spark(buf, x, y, 2);
    }
    ops += (N_SPARK + N_DRIFT) * 30 + N_POP * 50;
    g.cost.px += W * H; g.cost.box += ops;
  },
};
