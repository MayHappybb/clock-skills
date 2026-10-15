// Topiary: a formal garden at the end of an allée, and the time is its
// topiary. Four clipped hedges in Versailles planters flank the gravel walk
// to a fountain, in one-point perspective: the hours on the left, the
// minutes on the right, the near pair outermost and largest, as a formal
// garden is laid out, mirror to mirror about the fountain. Each numeral is a
// hedge sculpture (topiary-glyphs.js: leafy height fields, shaded per minute
// by the real sun), the hours in old dark yew, the minutes in young box.
//
// Always alive: the head gardener (straw boater) walks the allée trimming the
// far topiaries' flanks, flecks falling at each snip; the apprentice (blue
// cap) rakes the gravel; a robin hops from crown to crown; gusts of breeze
// sweep across, turning the leaves pale; the fountain plays; clouds drift;
// the topiaries cast sundial shadows that swing with the sun, long and
// sideways at morning and evening, short at noon.
//
// Minute turn: the gardener carries his stepladder to the topiary about to
// change, climbs, and clips it from the top down; the shorn part shows bare
// brown wood (still the old numeral) and drops away top first in the last
// half-second; clippings fly. Only the trunk the two numerals share is kept.
// After :00 the new numeral bursts out of it in fast-forward: a lime-green
// leader shoot races along each limb and the limb fills out, overshooting
// into shaggy new growth, which the gardener trims back to shape (about 1.3
// s), then he climbs down and goes back to work. Never a wrong numeral:
// the old one stands (green or bare) until :00, the new one only grows after.
// The tens of minutes are done by the apprentice the same way.
// Hour: the whole crew turns out (two more gardeners come in from the left),
// the fountain rises into a tall display with crossing arcs, a rainbow forms
// over it by day, and white doves rise from behind the balustrade.
// Night (23:00-07:00): moon and stars, lanterns lit beside each topiary,
// warming its inner flank, a lantern hung on the working ladder; the hedges
// go moonlit blue-green so they still read against the indigo.
//
// Palette: the garden's own materials. Greens for the time only (a box ramp
// and a darker, bluer yew ramp, sunlit tips to deep leaf shade), so nothing
// else on the glass competes in that hue; warm buff gravel and pale stone so
// the greens stand off the ground; cream planters in slate frames with gilt
// finials; a real day's sky (dawn rose, blue noon, golden evening, indigo
// night). The staff wear warm, saturated colours (terracotta, blue, purple,
// straw) that never appear in the hedges. Hard pixels for the topiaries
// (their leaf texture is the detail); anti-aliasing for everything that
// moves: people, tools, birds, water, clouds, clippings.
//
// Cost: the topiaries are lookups of per-minute colour tables, the shadows a
// table walk, everything else kit shapes; per frame ~3 ms mean on an ESP32-C3.
// Once a minute (outside the frame estimate): the background canvas (~12,800
// px of integer blend and dither) and the four topiaries' shading (~6,800 px,
// a dot product and a lookup each), roughly 0.8 M cycles = 5 ms in fixed-point
// C, in the first frame of the minute (that frame stays under ~11 ms; it could
// be spread over the last second of the minute before). At a turn, the plans
// (a breadth-first walk over ~1,700 px each), well under 1 ms.
import { Gfx, hex, mix, scale, R, G, B, sin, cos, clamp, rand, hash, ease, progress, lerp, clockFields } from '../js/kit.js';
import { buildGlyph, PAD } from './topiary-glyphs.js';
import { gardener, ladder } from './topiary-people.js';
import { robin, doves } from './topiary-birds.js';

// ------------------------------------------------------------ layout
const W = 160, H = 80, HOR = 42, VPX = 80;
const KN = 1, KF = 0.62;
/** The four topiaries: hours on the left of the allée, minutes on the right, near ones outermost. */
const SLOT = [
  { x: 3, top: 24, k: KN, far: false },
  { x: 39, top: 31, k: KF, far: true },
  { x: 104, top: 31, k: KF, far: true },
  { x: 129, top: 24, k: KN, far: false },
].map((s) => ({ ...s, base: s.top + Math.round(44 * s.k), cx: s.x + 14 * s.k, z: s.far ? 0 : 1 }));
/** Depth on the gravel: z 0 at the far planters' front, 1 at the near ones'. */
const footAt = (z) => 65 + 14 * z, sizeAt = (z) => 0.62 + 0.38 * z;

const GLYPH = [KN, KF].map((k) => Array.from({ length: 10 }, (_, d) => buildGlyph(d, k, k === KN ? 7 : 11)));
const glyphOf = (slot, d) => GLYPH[SLOT[slot].far ? 1 : 0][d];

// ------------------------------------------------------------ timing of a turn (seconds into the minute)
const WALK0 = 53.6, ARRIVE = 55.3, SET1 = 56.0, CLIP0 = 57.0, CLIP1 = 59.97;
const BARE_T = 0.5, GROW0 = 0.06, GROW1 = 1.15, TRIM0 = 1.25, TRIM1 = 2.55, DOWN1 = 3.5, FOLD1 = 4.1, HOME1 = 5.9;

// ------------------------------------------------------------ the day
// hour, sky top, sky at the horizon, gravel, sun light colour, darkness 0..1
const DAY = [
  [0, '0d1838', '2e3e78', '4e5470', 'b8c8f0', 1], [4.8, '0d1838', '2e3e78', '4e5470', 'b8c8f0', 1],
  [5.8, '3a3a6e', 'd88a78', '7c7270', 'ffb090', 0.55], [7.2, '6a9ed8', 'f2dcb8', 'c4ae88', 'fff0d0', 0.08],
  [9, '5a9ae0', 'cfe6f2', 'ccb890', 'fffaf0', 0], [16.5, '5a9ae0', 'cfe6f2', 'ccb890', 'fffaf0', 0],
  [18.2, '6c88c8', 'f6c088', 'd0b088', 'ffd098', 0.12], [19.4, '3a3a72', 'd27a6a', '7a6c6c', 'ff9a7a', 0.55],
  [20.6, '0d1838', '2e3e78', '4e5470', 'b8c8f0', 1], [24, '0d1838', '2e3e78', '4e5470', 'b8c8f0', 1],
].map(([h, a, b, c, d, n]) => [h, hex(a), hex(b), hex(c), hex(d), n]);

function dayAt(hour) {
  let k = 1;
  while (DAY[k][0] < hour) k++;
  const a = DAY[k - 1], b = DAY[k], u = (hour - a[0]) / (b[0] - a[0]);
  return { top: mix(a[1], b[1], u), hor: mix(a[2], b[2], u), gravel: mix(a[3], b[3], u), sunC: mix(a[4], b[4], u), dark: lerp(a[5], b[5], u) };
}
/** The sun's arc across the southern sky, left (east) to right: x, y, elevation 0..1, or null. */
function sunAt(hour) {
  const u = (hour - 5.9) / 13.6;
  if (u <= 0 || u >= 1) return null;
  const e = sin(u * Math.PI);
  return { u, x: 10 + 140 * u, y: 40 - 33 * e, e };
}
function moonAt(hour) {
  const u = (((hour + 24 - 19.6) % 24)) / 11;
  if (u <= 0 || u >= 1) return null;
  return { u, x: 18 + 124 * u, y: 30 - 22 * sin(u * Math.PI) };
}

// ------------------------------------------------------------ hedge colour
// Clipped box: a green ramp from the deep shade inside the leaves to sunlit
// yellow-green tips. By night the ramp turns to moonlit blue-green, and each
// topiary's inner flank is warmed by the lantern beside it.
function ramp(stops) {
  const st = stops.map(([p, c]) => [p, hex(c)]), out = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const u = i / 255;
    let k = 1;
    while (st[k][0] < u) k++;
    out[i] = mix(st[k - 1][1], st[k][1], (u - st[k - 1][0]) / (st[k][0] - st[k - 1][0]));
  }
  return out;
}
const DAY_RAMP = ramp([[0, '0c2418'], [0.2, '173e22'], [0.42, '2a6428'], [0.64, '559430'], [0.84, '92c040'], [1, 'd6e886']]);
// the hours are old yew: darker, bluer, denser; the minutes young box
const YEW_RAMP = ramp([[0, '081c16'], [0.22, '123826'], [0.45, '1e5634'], [0.68, '357a40'], [0.86, '62a250'], [1, 'b4d68a']]);
const NIGHT_RAMP = ramp([[0, '0e2634'], [0.25, '1e4c50'], [0.5, '3a806a'], [0.75, '6cb492'], [1, 'c0ecd0']]);
const FRESH = ['a8d848', 'c4e660', '8cc43c', 'b6de58'].map(hex);       // new growth
const LANTERN = hex('ffb050');
/** The lantern beside each topiary, on its inner side: x, foot, height (screen px). */
const LAMP = [[34.5, 79, 14], [61, 65, 9], [99, 65, 9], [125.5, 79, 14]];

const to565 = (c) => ((R(c) >> 3) << 11) | ((G(c) >> 2) << 5) | (B(c) >> 3);
/** Integer channel mix, no library calls: what the device does per pixel. */
function mixI(a, b, u) {
  const ar = (a >>> 16) & 255, ag = (a >>> 8) & 255, ab = a & 255;
  return (((ar + (((b >>> 16) & 255) - ar) * u + 0.5) | 0) << 16) | (((ag + (((b >>> 8) & 255) - ag) * u + 0.5) | 0) << 8) | ((ab + ((b & 255) - ab) * u + 0.5) | 0);
}
/** 1/sqrt(v) for v in ~[25, 9000] by two Newton steps from a power-of-two guess. */
function rsqrt(v) {
  let y = v > 1600 ? 0.016 : v > 400 ? 0.035 : v > 100 ? 0.07 : 0.14;
  y = y * (1.5 - 0.5 * v * y * y); y = y * (1.5 - 0.5 * v * y * y); y = y * (1.5 - 0.5 * v * y * y);
  return y;
}

/**
 * One topiary's colours for this minute's light: rgb565 per pixel, a plain
 * and a "leaf turned" (rustling, paler) version. Integer-cheap per pixel (a
 * dot product, a lookup), ~1,700 px a glyph, once a minute.
 */
function shadeGlyph(gl, slot, light) {
  const S = SLOT[slot], n = gl.w * gl.h, base = new Uint16Array(n), pale = new Uint16Array(n);
  const [lx, ly, lz] = light.L, sunI = light.sunI, dark = light.dark;
  const lamp = LAMP[slot], lampX = lamp[0], lampY = lamp[1] - lamp[2];
  const x0 = S.x - PAD, y0 = S.top - PAD;
  for (let i = 0; i < n; i++) {
    const hh = gl.H[i];
    if (!hh) continue;
    const nx = gl.NX[i] / 127, ny = gl.NY[i] / 127, nz = gl.NZ[i] / 127;
    let d = nx * lx + ny * ly + nz * lz;
    if (d < 0) d = 0;
    const sky = 0.5 - 0.5 * ny, ao = hh / 255;
    const t = gl.T[i];
    let s = sunI * 0.8 * d * (0.55 + 0.45 * d) + 0.1 * sky + 0.26 * ao * ao + ((t & 15) - 7.5) * 0.012;
    let s2 = s + 0.16;
    s = s < 0 ? 0 : s > 1 ? 1 : s; s2 = s2 > 1 ? 1 : s2;
    const RP = slot < 2 ? YEW_RAMP : DAY_RAMP;
    let c = RP[(s * 255) | 0], c2 = RP[(s2 * 255) | 0];
    if (dark > 0) {
      const cn = NIGHT_RAMP[(s * 255) | 0], cn2 = NIGHT_RAMP[(s2 * 255) | 0];
      c = mixI(c, cn, dark); c2 = mixI(c2, cn2, dark);
      // the lantern: warm light on the faces turned toward it
      const X = x0 + (i % gl.w) + 0.5, Y = y0 + ((i / gl.w) | 0) + 0.5;
      const vx = lampX - X, vy = lampY - Y, vz = 5, dd = vx * vx + vy * vy + vz * vz;
      const inv = rsqrt(dd);
      let wl = (nx * vx + ny * vy + nz * vz) * inv;
      wl = wl < 0 ? 0 : wl * 260 / (dd + 160) * dark;
      if (wl > 0.02) { c = mixI(c, LANTERN, (wl > 0.7 ? 0.7 : wl)); c2 = mixI(c2, LANTERN, (wl > 0.68 ? 0.75 : wl * 1.1)); }
    } else if (light.warm > 0) {
      c = mixI(c, mixI(c, light.sunC, 0.5), light.warm * d); c2 = mixI(c2, mixI(c2, light.sunC, 0.5), light.warm * d);
    }
    base[i] = to565(c); pale[i] = to565(c2);
  }
  return { base, pale };
}

const SHADES = new Map();
function shades(slot, d, minuteKey, light) {
  const key = slot * 10 + d;
  let e = SHADES.get(key);
  if (!e || e.mk !== minuteKey) { e = shadeGlyph(glyphOf(slot, d), slot, light); e.mk = minuteKey; SHADES.set(key, e); }
  return e;
}

// ------------------------------------------------------------ the turn's plan
// For a slot going from digit a to b: which pixels stay (keep), are clipped
// away before :00 (cut, in order top to bottom, as the shears go), grow back
// after :00 (grow, in order outward from what was kept, or up out of the
// planter), and the shaggy overgrowth (fuzz) that bursts out with the new
// growth and is trimmed back. ORD holds each pixel's moment 0..255 within
// its phase. TIP holds where the shears are, 32 steps through each phase.
const KEEP = 1, CUT = 2, GROW = 3, FUZZ = 4;
const PLANS = new Map();
const rnd = (v) => (v + 0.5) | 0;
function planOf(slot, a, b) {
  const key = slot * 100 + a * 10 + b;
  let p = PLANS.get(key);
  if (p) return p;
  const go = glyphOf(slot, a), gn = glyphOf(slot, b), w = go.w, h = go.h, n = w * h;
  const K = new Uint8Array(n), ORD = new Uint8Array(n), FZ = new Uint8Array(n), KC = new Uint8Array(n), ORDC = new Uint8Array(n);
  let cy0 = 99, cy1 = -1;
  // Only the lower body of what both numerals share is kept: kept higher up,
  // the shared part can read as the new numeral before :00 (0 -> 1 left a
  // perfect 1). So the crown is clipped and regrown, the trunk stays.
  const keepY = PAD + 0.6 * (h - 2 * PAD);
  for (let i = 0; i < n; i++) {
    const o = go.H[i] > 0, nn = gn.H[i] > 0, low = ((i / w) | 0) >= keepY;
    const keep = o && nn && low;
    K[i] = keep ? KEEP : nn ? GROW : 0;        // after :00
    KC[i] = keep ? KEEP : o ? CUT : 0;         // before :00
    if (KC[i] === CUT) { const y = (i / w) | 0; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y; }
  }
  // cut order: top to bottom, ragged by the leaf clusters
  // the shears work across and down from the far side to the ladder's side: a sloping front
  const outer = slot < 2 ? -1 : 1;
  for (let i = 0; i < n; i++) if (KC[i] === CUT) {
    const y = (i / w) | 0, x = i % w, xu = outer > 0 ? x / w : 1 - x / w;
    const u = 0.8 * (cy1 > cy0 ? (y - cy0) / (cy1 - cy0) : 0.5) + 0.2 * xu;
    ORDC[i] = clamp(rnd((0.04 + 0.9 * u + 0.05 * ((go.T[i] & 7) / 7)) * 255), 0, 255);
  }
  // grow order: breadth-first from the kept hedge (or from the planter)
  const dist = new Int16Array(n).fill(-1), q = [];
  for (let i = 0; i < n; i++) if (K[i] === KEEP) { dist[i] = 0; q.push(i); }
  if (!q.length) {
    let yb = 0;
    for (let i = 0; i < n; i++) if (K[i] === GROW) { const y = (i / w) | 0; if (y > yb) yb = y; }
    for (let i = 0; i < n; i++) if (K[i] === GROW && ((i / w) | 0) >= yb - 1) { dist[i] = 0; q.push(i); }
  }
  let maxd = 1;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % w;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
    for (const j of nb) {
      if (j < 0 || j >= n || dist[j] >= 0) continue;
      if (K[j] === GROW) { dist[j] = dist[i] + 1; if (dist[j] > maxd) maxd = dist[j]; q.push(j); }
      else if (gn.F[j] && K[i] === GROW && !FZ[j]) { FZ[j] = 1; dist[j] = dist[i] + 1; q.push(j); }
      else if (gn.F[j] && FZ[i] && FZ[i] < 3 && !FZ[j]) { FZ[j] = FZ[i] + 1; dist[j] = dist[i] + 1; q.push(j); }
    }
  }
  let fy0 = 99, fy1 = -1;
  for (let i = 0; i < n; i++) {
    // a leader shoot races along the limb's core first, then the limb fills out to its edges
    if (K[i] === GROW) ORD[i] = clamp(rnd((dist[i] / maxd) * 0.62 * 255 + (1 - gn.H[i] / 255) * 0.3 * 255 + (gn.T[i] & 7) * 2), 0, 255);
    else if (FZ[i] && !K[i]) { K[i] = FUZZ; const y = (i / w) | 0; if (y < fy0) fy0 = y; if (y > fy1) fy1 = y; }
  }
  // fuzz: grows with its neighbour, trimmed top to bottom afterwards; GO holds when it sprouts
  const GO = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (K[i] === FUZZ) {
    GO[i] = clamp(rnd((dist[i] / maxd) * 0.9 * 255 + 20), 0, 255);
    const y = (i / w) | 0;
    ORD[i] = clamp(rnd(((fy1 > fy0 ? (y - fy0) / (fy1 - fy0) : 0.5) * 0.92 + 0.04 + 0.04 * ((gn.T[i] & 3) / 3)) * 255), 0, 255);
  }
  // where the shears are through the cut and the trim
  const tipPath = (KK, OO, kind) => {
    const sx = new Float32Array(32), sy = new Float32Array(32), sn = new Float32Array(32);
    for (let i = 0; i < n; i++) if (KK[i] === kind) { const b2 = OO[i] >> 3; sx[b2] += i % w; sy[b2] += (i / w) | 0; sn[b2]++; }
    const out = new Float32Array(64);
    let lx = -1, ly = -1;
    for (let b2 = 0; b2 < 32; b2++) if (sn[b2]) { lx = sx[b2] / sn[b2]; ly = sy[b2] / sn[b2]; break; }
    if (lx < 0) { lx = w / 2; ly = h * 0.35; }
    for (let b2 = 0; b2 < 32; b2++) {
      if (sn[b2]) { lx = lx + (sx[b2] / sn[b2] - lx) * 0.6; ly = ly + (sy[b2] / sn[b2] - ly) * 0.6; }
      out[b2 * 2] = lx + 0.5; out[b2 * 2 + 1] = ly + 0.5;
    }
    return out;
  };
  // a few grow pixels spread through the growth, where leaves burst out
  const gl = [];
  for (let i = 0; i < n; i++) if (K[i] === GROW) gl.push(i);
  gl.sort((u, v) => ORD[u] - ORD[v]);
  const burst = new Int32Array(18).fill(-1);
  if (gl.length) for (let j = 0; j < 18; j++) burst[j] = gl[rnd((j + 0.5) / 18 * (gl.length - 1))];
  p = { w, h, n, K, ORD, KC, ORDC, GO, burst, cutTip: tipPath(KC, ORDC, CUT), trimTip: tipPath(K, ORD, FUZZ), hasCut: cy1 >= 0, hasFuzz: fy1 >= 0 };
  PLANS.set(key, p);
  return p;
}
function tipAt(path, u) {
  const f = clamp(u, 0, 1) * 31, i = Math.min(30, f | 0), v = f - i;
  return [path[i * 2] + (path[i * 2 + 2] - path[i * 2]) * v, path[i * 2 + 1] + (path[i * 2 + 3] - path[i * 2 + 1]) * v];
}

// ------------------------------------------------------------ the garden, once a minute
// Sky, sun or moon, the far trees, the balustrade, the raked gravel of the
// allée converging on the fountain, the planters and the lantern posts: one
// canvas a minute (25.6 KB of RAM), copied each frame.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function put565(buf, x, y, r, g, b) {
  const t = BAYER[((y & 3) << 2) | (x & 3)] * 16 + 8;
  let r5 = (r * 31 * 256 + t * 255) >> 16, g6 = (g * 63 * 256 + t * 255) >> 16, b5 = (b * 31 * 256 + t * 255) >> 16;
  r5 = r5 < 0 ? 0 : r5 > 31 ? 31 : r5; g6 = g6 < 0 ? 0 : g6 > 63 ? 63 : g6; b5 = b5 < 0 ? 0 : b5 > 31 ? 31 : b5;
  buf[y * W + x] = (r5 << 11) | (g6 << 5) | b5;
}
const PLANTER = { panel: hex('eee6d2'), panelD: hex('cfc4aa'), post: hex('34483e'), postL: hex('4e6a5a'), finial: hex('c8a050') };
const STONE = hex('ddd2ba'), STONE_D = hex('a89c86');

let BG = { key: -1 };
function background(mk, hour) {
  if (BG.key === mk) return BG;
  const day = dayAt(hour), sun = sunAt(hour), moon = moonAt(hour), dark = day.dark;
  const c = new Gfx(W, H), buf = c.buf;
  const tone = toner(dark);
  // sky: a vertical blend, dithered, plus the glow round the sun
  for (let y = 0; y < HOR; y++) {
    const u = y / (HOR - 1), uu = u * u;
    for (let x = 0; x < W; x++) {
      let r = R(day.top) + (R(day.hor) - R(day.top)) * uu, gg = G(day.top) + (G(day.hor) - G(day.top)) * uu, b = B(day.top) + (B(day.hor) - B(day.top)) * uu;
      if (sun) {
        const dx = x - sun.x, dy = y - sun.y, q = 1 - (dx * dx + dy * dy) / 900;
        if (q > 0) { const k = q * q * 0.55; r += (255 - r) * k; gg += (240 - gg) * k; b += (200 - b) * k; }
      }
      put565(buf, x, y, r, gg, b);
    }
  }
  if (moon && dark > 0.2) {
    c.radial(moon.x, moon.y, 14, [mix(day.hor, hex('8a9ac8'), 0.5), day.top], { box: [moon.x - 14, moon.y - 14, 28, 28], a: 0.5 * dark });
    c.fillCircle(moon.x, moon.y, 3.6, mix(day.top, hex('f4eed8'), dark), { aa: true });
    c.fillCircle(moon.x + 1.5, moon.y - 0.8, 3.0, mix(day.top, hex('d8d4c4'), dark), { aa: true, a: 0.35 });
  }
  if (dark > 0.3) for (let k = 0; k < 40; k++) {
    const x = (rand(k, 1, 5) * W) | 0, y = (rand(k, 2, 5) * 30) | 0;
    c.pixel(x, y, mix(day.top, hex('dce4ff'), dark * (0.35 + 0.5 * rand(k, 3, 5))));
  }
  if (sun) {
    c.fillCircle(sun.x, sun.y, 4.6, mix(hex('fff8e0'), hex('ffb070'), clamp(1 - sun.e * 2.2, 0, 1)), { aa: true });
  }
  // far trees: a hazy wood behind the balustrade, two dark cypresses framing the fountain
  const haze = (col, k) => mix(col, day.hor, k);
  const wood = tone(hex('3c5a4a')), woodFar = haze(wood, 0.55), cyp = haze(tone(hex('243e30')), 0.25);
  for (let k = 0; k < 16; k++) {
    const x = 4 + k * 10 + rand(k, 9) * 6, r = 6 + rand(k, 8) * 4;
    c.fillEllipse(x, 36 - r * 0.5, r, r * 0.8, woodFar, { aa: true });
  }
  c.fillRect(0, 34, W, HOR - 34, woodFar);
  for (const x of [63, 97]) {
    c.fillEllipse(x, 26, 3.4, 13, cyp, { aa: true });
    c.fillEllipse(x + 0.8, 24, 1.6, 9, haze(tone(hex('3a5a40')), 0.3), { aa: true, a: 0.6 });
  }
  // balustrade: top rail, balusters, plinth
  const st = tone(STONE), stD = tone(STONE_D);
  c.fillRect(14, 35, 132, 2, st);
  for (let x = 15; x < 145; x += 3) { c.fillRect(x, 37, 2, 3, st); c.pixel(x + 1, 38, stD); }
  c.fillRect(14, 40, 132, 2, stD);
  for (const x of [14, 46, 112, 144]) { c.fillRect(x - 1, 33, 4, 9, st); c.fillRect(x - 1, 33, 4, 1, stD); }
  // gravel: rows lighter toward the viewer, speckled, raked in lines that run to the fountain
  const gv = day.gravel, far = mix(gv, day.hor, 0.35);
  for (let y = HOR; y < H; y++) {
    const v = (y - HOR) / (H - HOR), base = mix(far, scale(gv, 1.06), v);
    const r0 = R(base), g0 = G(base), b0 = B(base), dy = y - HOR + 1.5;
    for (let x = 0; x < W; x++) {
      const a = (x + 0.5 - VPX) / dy, aa = a < 0 ? -a : a;
      let k = 0.97 + (rand(x, y, 3) - 0.5) * 0.08;
      if (aa < 0.56) k *= 1.07;                                   // the path, swept
      else if (aa < 0.64) k *= 1.13;                              // its stone kerb
      else { const f = (aa * 3.1) % 1; if (f < 0.25) k *= 0.93; }  // raked lines
      put565(buf, x, y, r0 * k, g0 * k, b0 * k);
    }
  }
  // the fountain: basin, pedestal, upper bowl (the water moves, drawn per frame)
  c.fillEllipse(VPX, 45.5, 15, 3.6, tone(STONE_D), { aa: true });
  c.fillEllipse(VPX, 44.8, 14, 3.0, st, { aa: true });
  c.fillEllipse(VPX, 44.6, 12, 2.1, tone(mix(day.hor, hex('5a8aa8'), 0.5)), { aa: true });
  c.fillRect(VPX - 1, 37, 3, 7, stD);
  c.fillRect(VPX - 1, 37, 1, 7, st);
  c.fillEllipse(VPX + 0.5, 37, 5.5, 1.4, st, { aa: true });
  // lantern posts (lit at night, per frame)
  for (const [x, foot, hgt] of LAMP) {
    const s = hgt / 14;
    if (dark > 0) c.radial(x, foot - 1, 13 * s, [LANTERN, 0x000000], { box: [x - 14 * s, foot - 4 * s, 28 * s, 6 * s], a: 0.35 * dark });
    c.fillEllipse(x + 0.5, foot - 0.3, 2.2 * s, 0.8 * s, 0x000000, { aa: true, a: 0.3 });
    c.fillRect(Math.round(x), foot - hgt, 1, hgt, tone(hex('2a2a2e')));
    c.fillRect(Math.round(x - 1), foot - 1, 3, 1, tone(hex('2a2a2e')));
  }
  // planters: Versailles boxes, cream panels in slate-green frames with gilt finials
  for (let i = 0; i < 4; i++) {
    const S = SLOT[i], k = S.k, pw = Math.round(20 * k), ph = Math.round(10 * k), px = Math.round(S.cx - pw / 2), py = S.base - 1;
    c.fillEllipse(S.cx + 1, py + ph, pw * 0.65, 1.6 * k + 0.4, 0x000000, { aa: true, a: 0.32 });
    c.fillRect(px, py, pw, ph, tone(PLANTER.panel));
    c.fillRect(px + 2, py + ph - 2, pw - 4, 1, tone(PLANTER.panelD));
    c.rect(px + Math.round(3 * k), py + Math.round(2 * k), pw - Math.round(6 * k), ph - Math.round(4.5 * k), tone(PLANTER.panelD));
    const pwid = Math.max(2, Math.round(2.4 * k));
    for (const qx of [px, px + pw - pwid]) {
      c.fillRect(qx, py - 1, pwid, ph + 1, tone(PLANTER.post));
      c.fillRect(qx, py - 1, 1, ph + 1, tone(PLANTER.postL));
      c.fillCircle(qx + pwid / 2, py - 1.6 * k, 1.25 * k + 0.2, tone(PLANTER.finial), { aa: true });
    }
    c.fillRect(px, py, pw, 1, tone(PLANTER.post));
  }
  // where a shadow may fall: the gravel, not the planters, posts or fountain
  const ground = new Uint8Array(W * H);
  for (let y = HOR; y < H; y++) for (let x = 0; x < W; x++) ground[y * W + x] = 1;
  for (const [px, py, pw, ph] of PBOX) for (let y = py - 3; y < py + ph; y++) for (let x = px; x < px + pw; x++) if (y >= 0 && y < H) ground[y * W + x] = 0;
  for (let y = HOR; y < 49; y++) for (let x = VPX - 16; x < VPX + 17; x++) ground[y * W + x] = 0;
  BG = { key: mk, canvas: c, day, sun, moon, dark, tone, ground };
  return BG;
}

/** Per-minute colour conversion for things drawn each frame: dimmer and bluer by night. */
function toner(dark) {
  const cache = new Map(), night = hex('1a2440');
  return (c) => {
    if (dark <= 0) return c;
    let v = cache.get(c);
    if (v === undefined) { v = mixI(mixI(c, scale(c, 0.42), dark), night, 0.25 * dark); cache.set(c, v); }
    return v;
  };
}

/** This minute's light on the topiary. */
function lightAt(hour) {
  const day = dayAt(hour), sun = sunAt(hour);
  let L, sunI, warm = 0;
  if (sun && day.dark < 0.9) {
    const ex = -cos(sun.u * Math.PI);
    L = [ex * 0.8, -(0.3 + 0.6 * sun.e), 0.55];
    sunI = 1 - day.dark;
    warm = clamp(1 - sun.e * 2, 0, 1) * 0.6;
  } else {
    L = [-0.5, -0.65, 0.55];
    sunI = 0.75;
  }
  const n = Math.hypot(L[0], L[1], L[2]);
  return { L: [L[0] / n, L[1] / n, L[2] / n], sunI, dark: day.dark, warm, sunC: day.sunC };
}

// ------------------------------------------------------------ per-frame drawing
/** A small dot that glides: a 2 x 2 bilinear splat. */
function splat(g, x, y, c, a) {
  x -= 0.5; y -= 0.5;
  const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy;
  g.cost.box += 8;
  const P = (px, py, w) => { if (px >= 0 && py >= 0 && px < W && py < H && w > 0.03) g.put(px, py, c, w > 1 ? 1 : w); };
  P(ix, iy, (1 - u) * (1 - v) * a); P(ix + 1, iy, u * (1 - v) * a); P(ix, iy + 1, (1 - u) * v * a); P(ix + 1, iy + 1, u * v * a);
}

/**
 * One topiary into the frame. mode 0: whole; 1: being cut (plan p, progress
 * u); 2: growing (plan p, growth u, trim v). gust: per-column rustle 0..1.
 */
const COLS = SLOT.map((S) => new Int32Array(glyphOf(SLOT.indexOf(S), 0).w * glyphOf(SLOT.indexOf(S), 0).h));
function drawHedge(g, slot, sh, gl, mode, p, u, v, gust, fresh) {
  const S = SLOT[slot], x0 = S.x - PAD, w = gl.w, hh = gl.h, out = COLS[slot];
  const uq = (u * 255) | 0, vq = (v * 255) | 0, base = sh.base, pale = sh.pale, T = gl.T, Hm = gl.H;
  for (let j = 0; j < hh; j++) {
    const row = j * w;
    for (let i = 0; i < w; i++) {
      const k = row + i, X = x0 + i;
      let col = -1;
      if (mode === 0) { if (Hm[k]) col = base[k]; }
      else {
        const kind = p.K[k];
        if (mode === 1) {
          const kc = p.KC[k];
          if (kc === KEEP || (kc === CUT && p.ORDC[k] > uq)) col = base[k];
          else if (kc === CUT && p.ORDC[k] > vq) col = BARE565[T[k] & 7];   // shorn to the bare wood, then it falls
        } else if (kind === KEEP) col = base[k];
        else if (kind === GROW) {
          const o = p.ORD[k];
          if (o <= uq) col = uq - o < 70 * fresh ? FRESH565[T[k] & 3] : base[k];
        } else if (kind === FUZZ) {
          if (p.GO[k] <= uq && p.ORD[k] > vq) col = FRESH565[(T[k] >> 2) & 3];
        }
      }
      if (col >= 0 && X >= 0 && X < W && gust[X] > 0 && (T[k] & 127) < gust[X] && Hm[k] && col === base[k]) col = pale[k];
      out[k] = col;
    }
  }
  g.cost.box += 2 * w * hh;
}
/** Copy a topiary's colours (worked out by drawHedge) into the frame. */
function blitHedge(g, slot) {
  const S = SLOT[slot], gl = glyphOf(slot, 0), x0 = S.x - PAD, y0 = S.top - PAD, w = gl.w, out = COLS[slot], buf = g.buf;
  let n = 0;
  for (let j = 0; j < gl.h; j++) {
    const Y = y0 + j;
    if (Y < 0 || Y >= H) continue;
    for (let i = 0; i < w; i++) {
      const c = out[j * w + i], X = x0 + i;
      if (c < 0 || X < 0 || X >= W) continue;
      buf[Y * W + X] = c; n++;
    }
  }
  g.cost.box += w * gl.h; g.cost.px += n;
}

// ------------------------------------------------------------ cast shadows
// The sun is in the south, over the far end of the allée: shadows fall toward
// the viewer and away from it sideways, long in the morning and evening,
// short at noon, so the topiaries are a sundial too. Each gravel pixel in a
// topiary's shadow box looks back along the sun's ray to the topiary (its
// colours of this frame, so a half-clipped numeral casts a half-clipped
// shadow) or its planter. Then each shaded pixel is darkened once.
const STAMP = new Uint8Array(W * H), SHADED = new Int32Array(W * H);
let stampId = 0;
function planterBox(slot) {
  const S = SLOT[slot], k = S.k, pw = Math.round(20 * k), ph = Math.round(10 * k);
  return [Math.round(S.cx - pw / 2), S.base - 1, pw, ph];
}
const PBOX = SLOT.map((_, i) => planterBox(i));
function shadows(g, kx, ky, strength, ground) {
  if (strength <= 0.02 || ky <= 0.02) return;
  stampId = stampId >= 250 ? 1 : stampId + 1;
  let ns = 0;
  for (let slot = 0; slot < 4; slot++) {
    const S = SLOT[slot], gl = glyphOf(slot, 0), w = gl.w, out = COLS[slot];
    const [px, py, pw, ph] = PBOX[slot], gy0 = py + ph, x0 = S.x - PAD, y0 = S.top - PAD;
    const hmax = gy0 - y0, gy1 = Math.min(H - 1, Math.floor(gy0 + hmax * ky));
    for (let gy = gy0; gy <= gy1; gy++) {
      const hgt = (gy + 0.5 - gy0) / ky, hy = Math.floor(gy0 - hgt), sx = hgt * kx;
      const inPlanter = hy >= py && hy < gy0, j = hy - y0, inGlyph = j >= 0 && j < gl.h;
      if (!inPlanter && !inGlyph) continue;
      const xa = Math.max(0, Math.floor(Math.min(x0, px) + sx)), xb = Math.min(W - 1, Math.ceil(Math.max(x0 + w, px + pw) + sx));
      for (let gx = xa; gx <= xb; gx++) {
        g.cost.box++;
        const hx = Math.floor(gx + 0.5 - sx);
        let hit = inPlanter && hx >= px && hx < px + pw;
        if (!hit && inGlyph) { const i = hx - x0; hit = i >= 0 && i < w && out[j * w + i] >= 0; }
        if (!hit) continue;
        const q = gy * W + gx;
        if (!ground[q] || STAMP[q] === stampId) continue;
        STAMP[q] = stampId; SHADED[ns++] = q;
      }
    }
  }
  const k = (256 - 110 * strength) | 0, kb = (256 - 80 * strength) | 0, buf = g.buf;
  for (let n = 0; n < ns; n++) {
    const q = SHADED[n], v = buf[q];
    buf[q] = ((((v >> 11) & 31) * k >> 8) << 11) | ((((v >> 5) & 63) * k >> 8) << 5) | ((v & 31) * kb >> 8);
  }
  g.cost.box += ns * 4; g.cost.px += ns;
}
let FRESH565 = FRESH.map(to565);
// bare box wood, where the leaves have been shorn off: browns, a few dark gaps, a last green leaf
const BARE = ['5a3c24', '7a5634', '46301c', '94704a', '664830', '34241a', '7a5634', '3a5a28'].map(hex);
let BARE565 = BARE.map(to565);

/** The leftmost or rightmost hedge pixel of a glyph near row `j` (glyph coords), for snipping a flank. */
function flankX(gl, j, side) {
  for (let d = 0; d < gl.h; d++) {
    for (const jj of [j + d, j - d]) {
      if (jj < 0 || jj >= gl.h) continue;
      const row = jj * gl.w;
      if (side < 0) { for (let i = 0; i < gl.w; i++) if (gl.H[row + i]) return [i, jj]; }
      else for (let i = gl.w - 1; i >= 0; i--) if (gl.H[row + i]) return [i + 1, jj];
    }
  }
  return [gl.w / 2, j];
}

const LEAVES = [hex('3f7a2a'), hex('6aa236'), hex('9cc848'), hex('2c5a24')];
/** Clippings: n bits flung from the shears along a tip path, falling to `ground`. */
function clippings(g, path, ox, oy, t0, t1, age0, ground, seed, n, tone, sc) {
  for (let k = 0; k < n; k++) {
    const ts = t0 + (t1 - t0) * (k + 0.5) / n, age = age0 - ts;
    if (age <= 0 || age > 2.4) continue;
    const [tx, ty] = tipAt(path, (ts - t0) / (t1 - t0));
    const vx = (rand(seed, k, 1) - 0.5) * 22 * sc, vy = -(4 + rand(seed, k, 2) * 10) * sc;
    let x = ox + tx + vx * age, y = oy + ty + vy * age + 30 * sc * age * age;
    const gy = ground + rand(seed, k, 3) * 2;
    if (y > gy) {   // landed: stays where it fell
      const A = 30 * sc, Bq = vy, Cq = oy + ty - gy, tl = (-Bq + Math.sqrt(Math.max(0, Bq * Bq - 4 * A * Cq))) / (2 * A);
      y = gy; x = ox + tx + vx * tl;
    }
    const a = age > 1.8 ? (2.4 - age) / 0.6 : 1;
    splat(g, x, y, tone(LEAVES[k & 3]), a * 0.95);
  }
}

/** New growth: leaves burst out of the growing front and flutter down. */
function burst(g, p, ox, oy, s, sc, seed, tone) {
  for (let j = 0; j < 18; j++) {
    const i = p.burst[j];
    if (i < 0) continue;
    const ts = GROW0 + (GROW1 - GROW0) * (1 - Math.pow(1 - p.ORD[i] / 255, 1 / 3)), age = s - ts;
    if (age <= 0 || age > 1.6) continue;
    const ang = rand(seed, j, 7) * 6.283, sp = (10 + 14 * rand(seed, j, 8)) * sc;
    const x = ox + (i % p.w) + 0.5 + cos(ang) * sp * age, y = oy + ((i / p.w) | 0) + 0.5 + sin(ang) * sp * age * 0.7 + 14 * sc * age * age;
    splat(g, x, y, tone(FRESH[j & 3]), age > 1.1 ? (1.6 - age) * 2 : 1);
  }
}
/** Idle trimming: two flecks fall from the shears at each snip. */
function flecks(g, P, t, tone) {
  const rate = 13.8 / 6.283, k0 = Math.floor(t * rate);
  for (let k = k0 - 3; k <= k0; k++) {
    const age = t - k / rate;
    if (age < 0) continue;
    for (let m = 0; m < 2; m++) {
      const vx = (rand(k, m, 21) - 0.5) * 8 - P.snipping.side * 4;
      splat(g, P.tipX + vx * age, P.tipY + 18 * age * age, tone(LEAVES[(k + m) & 3]), 1 - age / 1.3);
    }
  }
}

// ------------------------------------------------------------ the gardeners
// Four on the staff, one per topiary: the head gardener (straw boater) does
// the minute every minute; the apprentice (blue cap) the tens of minutes; two
// more come in from the left for the hours. In between, the head gardener
// trims the far topiaries' flanks from the path and the apprentice rakes.
const HOME = [{ x: 90, z: 0.42 }, { x: 70, z: 0.8 }, { x: -16, z: 0.25 }, { x: -16, z: 0.95 }];
const WORKER_SLOT = [3, 2, 1, 0];
const SPOT_A = { x: 99.4, z: 0.02, dir: 1, slot: 2, side: -1 }, SPOT_B = { x: 60.6, z: 0.02, dir: -1, slot: 1, side: 1 };
const G0_PLAN = [   // [from s, to s, what, from, to]
  [HOME1, 8.4, 'walk', HOME[0], SPOT_A], [8.4, 21, 'snip', SPOT_A], [21, 24.6, 'walk', SPOT_A, SPOT_B],
  [24.6, 39, 'snip', SPOT_B], [39, 42.6, 'walk', SPOT_B, SPOT_A], [42.6, 51, 'snip', SPOT_A], [51, WALK0, 'walk', SPOT_A, HOME[0]],
];
const GAIT = 0.62;   // radians of stride per pixel walked, at scale 1

function walkPose(a, b, u, tWalk) {
  const e = ease.inOutQuad(clamp(u, 0, 1)), x = lerp(a.x, b.x, e), z = lerp(a.z, b.z, e);
  const dist = Math.abs(b.x - a.x) * e + Math.abs(b.z - a.z) * 14 * e;
  return { x, z, dir: b.x >= a.x ? 1 : -1, walk: (dist * GAIT) / sizeAt(z) + (tWalk ?? 0) };
}

function idlePose(gi, s, t, digits) {
  if (gi === 0) {
    for (const [s0, s1, what, A, B2] of G0_PLAN) {
      if (s < s0 || s >= s1) continue;
      if (what === 'walk') return walkPose(A, B2, (s - s0) / (s1 - s0));
      const S = SLOT[A.slot], gl = glyphOf(A.slot, +digits[A.slot]), sc = sizeAt(A.z);
      const j = Math.round(gl.h * (0.62 + 0.14 * sin(t * 0.55)));
      const [fx, fy] = flankX(gl, j, A.side);
      return { x: A.x, z: A.z, dir: A.dir, tipX: S.x - PAD + fx - A.side * 0.6, tipY: S.top - PAD + fy, snip: 0.5 + 0.5 * sin(t * 13.8), snipping: A, sc };
    }
    return { x: HOME[0].x, z: HOME[0].z, dir: -1 };
  }
  if (gi === 1) {
    const x = 80 + 13 * sin(t * 0.19), vx = cos(t * 0.19);
    return { x, z: 0.82, dir: vx >= 0 ? 1 : -1, walk: (x * GAIT) / sizeAt(0.82), rake: t * 3.4 };
  }
  return { x: HOME[gi].x, z: HOME[gi].z, dir: 1 };
}

/** A gardener at work on `slot`, τ seconds from the turn, with the turn's plan. */
function jobPose(gi, slot, τ, p, from, to, t) {
  const S = SLOT[slot], wz = S.z, sc = sizeAt(wz), ground = footAt(wz), wx = S.cx + (slot < 2 ? -1 : 1) * 6 * sc;
  const ox = S.x - PAD, oy = S.top - PAD;
  const top = ground - (ground - S.top) * 0.42;
  const feetFor = (ty) => clamp(ty + 14 * sc, top, ground);
  const tip = (path, u) => { const q = tipAt(path, u); return [ox + q[0], oy + q[1]]; };
  const work = { x: wx, z: wz };
  const lad = (open) => ({ x: wx, ground, top, open, sc });
  const c0 = tip(p.cutTip, 0), c1 = tip(p.cutTip, 1), r0 = tip(p.trimTip, 0), r1 = tip(p.trimTip, 1);
  const T0 = WALK0 - 60, T1 = ARRIVE - 60, T2 = SET1 - 60, T3 = CLIP0 - 60, T4 = CLIP1 - BARE_T - 60;
  const pose = (o) => ({ z: wz, x: wx, ...o });
  const reachLean = (tx) => clamp((tx - wx) / sc - (tx > wx ? 12 : -12), -3.5, 3.5);   // leans out to reach
  if (τ < T1) return { ...walkPose(from, work, (τ - T0) / (T1 - T0)), carry: true };
  if (τ < T2) return pose({ foot: ground, dir: c0[0] >= wx ? 1 : -1, ladder: lad(ease.outQuad((τ - T1) / (T2 - T1))) });
  if (τ < T3) {
    const u = ease.inOutQuad((τ - T2) / (T3 - T2));
    return pose({ foot: lerp(ground, feetFor(c0[1]), u), dir: c0[0] >= wx ? 1 : -1, ladder: lad(1), climb: τ * 9 });
  }
  if (τ < 0) {
    const u = clamp((τ - T3) / (T4 - T3), 0, 1), [tx, ty] = tip(p.cutTip, u);
    return pose({ foot: feetFor(ty), dir: tx >= wx ? 1 : -1, ladder: lad(1), tipX: tx, tipY: ty, snip: 0.5 + 0.5 * sin(t * 31), lean: reachLean(tx) });
  }
  if (τ < TRIM0) {
    const u = ease.inOutQuad(τ / TRIM0);
    return pose({ foot: lerp(feetFor(c1[1]), feetFor(r0[1]), u), dir: r0[0] >= wx ? 1 : -1, ladder: lad(1), lean: -1.2 * sin(Math.min(1, τ / GROW1) * Math.PI) });
  }
  if (τ < TRIM1) {
    const u = (τ - TRIM0) / (TRIM1 - TRIM0), [tx, ty] = tip(p.trimTip, u);
    return pose({ foot: feetFor(ty), dir: tx >= wx ? 1 : -1, ladder: lad(1), tipX: tx, tipY: ty, snip: 0.5 + 0.5 * sin(t * 31), lean: reachLean(tx) });
  }
  if (τ < DOWN1) {
    const u = ease.inOutQuad((τ - TRIM1) / (DOWN1 - TRIM1));
    return pose({ foot: lerp(feetFor(r1[1]), ground, u), dir: to.x >= wx ? 1 : -1, ladder: lad(1) });
  }
  if (τ < FOLD1) return pose({ foot: ground, dir: to.x >= wx ? 1 : -1, ladder: lad(1 - ease.inQuad((τ - DOWN1) / (FOLD1 - DOWN1))) });
  return { ...walkPose(work, to, (τ - FOLD1) / (HOME1 - FOLD1)), carry: true };
}

// ------------------------------------------------------------ the fountain
const WATER = hex('e8f4ff'), WATER_D = hex('a8cce8');
/** jet: height of the centre jet; show 0..1: the hour's display (tall jet, arcs). */
function fountain(g, t, jet, show, tone, glow) {
  const top = 37 - jet, wc = tone(WATER), wd = tone(WATER_D);
  const wob = 0.4 * sin(t * 7.3);
  g.thickLine(VPX + 0.5, 37, VPX + 0.5 + wob * 0.5, top + 1, 1.2 + 0.6 * show, wc, { aa: true, a: 0.85 });
  g.fillCircle(VPX + 0.5 + wob, top + 0.5, 1.1 + 0.5 * show, wc, { aa: true, a: 0.8 });
  // the spray falling back: a crown of drops
  const N = 22;
  for (let k = 0; k < N; k++) {
    const ph = (t * 0.85 + k / N) % 1, side = k & 1 ? 1 : -1, sp = 1.5 + 3.2 * rand(k, 4) + 3 * show;
    const x = VPX + 0.5 + side * sp * ph * 2.2, y = top + (44 - top) * ph * ph - 2.5 * ph * (1 - ph) * (1 + show);
    splat(g, x, y, k % 3 ? wd : wc, 0.75 * (1 - 0.4 * ph));
  }
  // the hour: four arcs from the basin rim, crossing over the bowl
  if (show > 0.02) {
    const M = 12, hgt = 20 * show;
    for (const [x0, x1] of [[VPX - 12, VPX + 4], [VPX + 13, VPX - 3], [VPX - 7, VPX + 9], [VPX + 8, VPX - 8]]) {
      for (let k = 0; k < M; k++) {
        const u = ((k + t * 2.4) / M) % 1;
        const x = x0 + (x1 - x0) * u, y = 44 - hgt * 4 * u * (1 - u) * (x0 < x1 ? 1 : 0.85);
        splat(g, x + 0.5, y, wc, 0.8 * show);
      }
    }
  }
  // ripples on the basin
  for (let k = 0; k < 3; k++) {
    const u = (t * 0.4 + k / 3) % 1, rx = 3 + 8 * u;
    g.fillRect(Math.round(VPX - rx), 45, Math.round(2 * rx * 0.3), 1, wc, { a: 0.35 * (1 - u) });
    g.fillRect(Math.round(VPX + rx * 0.4), 44, Math.round(2 * rx * 0.3), 1, wc, { a: 0.3 * (1 - u) });
  }
  if (glow > 0) g.fillEllipse(VPX + 0.5, 44.6, 10, 1.6, hex('ffd890'), { aa: true, a: 0.25 * glow });
}

const RAIN = ['e04040', 'f08a30', 'f0d040', '50b050', '4080e0', '7050c0'].map(hex);
function rainbow(g, a) {
  if (a <= 0.01) return;
  g.clip(0, 0, W, HOR);
  for (let i = 0; i < 6; i++) g.arc(VPX + 0.5, 62, 44 - i * 1.4, 45.4 - i * 1.4, -1.25, 1.25, RAIN[i], { aa: true, a: a * 0.32 });
  g.unclip();
}

/** Clouds: a few, drifting right, opaque with soft edges (cheap: the inside is a plain store). */
function clouds(g, t, day, tone) {
  if (day.dark > 0.85) return;
  const col = tone(mix(hex('ffffff'), day.hor, 0.25)), sh = tone(mix(hex('d8e0ea'), day.top, 0.3));
  g.clip(0, 0, W, 32);
  for (let k = 0; k < 3; k++) {
    const x = ((t * (0.9 + 0.25 * k) + k * 73 + 20) % 220) - 30, y = 7 + k * 6.5;
    const sz = 1 - 0.18 * k;
    g.fillEllipse(x, y + 1.2 * sz, 9 * sz, 2.4 * sz, sh, { aa: true });
    g.fillEllipse(x - 3 * sz, y, 5 * sz, 2.8 * sz, col, { aa: true });
    g.fillEllipse(x + 2.8 * sz, y - 0.8 * sz, 4.6 * sz, 3.4 * sz, col, { aa: true });
  }
  g.unclip();
}

/** The lantern heads on their posts: dark iron and glass by day, lit by night with a flicker. */
function lanterns(g, t, dark, tone) {
  for (let i = 0; i < 4; i++) {
    const [x, foot, hgt] = LAMP[i], s = hgt / 14, y = foot - hgt;
    const lit = dark, fl = 0.85 + 0.15 * sin(t * 9.1 + i * 2) * sin(t * 5.3 + i);
    if (lit > 0.05) g.fillCircle(x + 0.5, y - 1.2 * s, 4.2 * s, LANTERN, { aa: true, a: 0.22 * lit * fl });
    g.fillRect(Math.round(x - 1.2 * s), Math.round(y - 3.4 * s), Math.max(2, Math.round(3.4 * s)), Math.max(2, Math.round(3.2 * s)), lit > 0.05 ? mix(tone(hex('5a6070')), hex('ffe0a0'), lit * fl) : tone(hex('8a9aa8')));
    g.fillRect(Math.round(x - 1.4 * s), Math.round(y - 4.4 * s), Math.max(3, Math.round(3.8 * s)), 1, tone(hex('2a2a2e')));
  }
}

// ------------------------------------------------------------ the robin
// It keeps to the crowns of the topiaries, a perch per 15 s, never on one
// that is being clipped or is growing (or it leaves the garden for a while).
function perchOf(segAbs, q, dg, before, after) {
  const ok = [];
  for (let slot = 0; slot < 4; slot++) {
    if (q === 0 && dg[slot] !== before[slot]) continue;
    if (q === 3 && dg[slot] !== after[slot]) continue;
    ok.push(slot);
  }
  if (!ok.length) return { x: -8, y: 12, slot: -1 };
  const slot = ok[hash(segAbs, 3) % ok.length], gl = glyphOf(slot, +dg[slot]), S = SLOT[slot];
  const i0 = Math.round(gl.w * (0.3 + 0.4 * rand(segAbs, 4)));
  for (let d = 0; d < gl.w; d++) for (const i of [i0 + d, i0 - d]) {
    if (i < 0 || i >= gl.w) continue;
    for (let j = 0; j < gl.h; j++) if (gl.H[j * gl.w + i]) return { x: S.x - PAD + i + 0.5, y: S.top - PAD + j + 0.6, slot };
  }
  return { x: -8, y: 12, slot: -1 };
}
function drawRobin(g, s, minuteKey, cur, prv, nxt, tone) {
  const q = Math.floor(s / 15), seg = minuteKey * 4 + q, ss = s - q * 15;
  const B2 = perchOf(seg, q, cur, prv, nxt);
  const A = q > 0 ? perchOf(seg - 1, q - 1, cur, prv, nxt) : perchOf(seg - 1, 3, prv, prv, cur);
  const FL = 1.3;
  if (ss < FL && (A.x !== B2.x || A.y !== B2.y)) {
    const u = ease.inOutQuad(ss / FL), x = lerp(A.x, B2.x, u), y = lerp(A.y, B2.y, u) - (6 + Math.abs(B2.x - A.x) * 0.12) * sin(u * Math.PI);
    robin(g, x, y, B2.x >= A.x ? 1 : -1, ss * 40, 0, tone, 1);
    return;
  }
  if (B2.slot < 0) return;
  const k = SLOT[B2.slot].far ? 0.85 : 1;
  const hopN = Math.floor(ss / 2.6), hu = ss - hopN * 2.6, hop = hu < 0.28 ? sin(hu / 0.28 * Math.PI) * 1.6 : 0;
  const dir = hash(seg, hopN, 5) & 1 ? 1 : -1, flick = hu > 1.2 && hu < 1.5 ? sin((hu - 1.2) / 0.3 * Math.PI) : 0;
  robin(g, B2.x, B2.y - hop, dir, null, flick, tone, k);
}

// ------------------------------------------------------------ the face
const GUST = new Int16Array(W);

export default {
  name: 'Topiary',
  blurb: 'A formal garden: the time is four clipped-box topiaries; the gardeners clip the old numeral away and the new one bursts out in leaf.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, t = ctx.date.getTime() / 1000 % 86400;
    const hour = f.h + f.m / 60;
    ctx.lcd.backlight(1 - 0.5 * ctx.night);
    const bg = background(f.minuteKey, hour), tone = bg.tone, light = lightAt(hour);
    if (bg.fresh === undefined) { bg.fresh = FRESH.map((c) => to565(tone(c))); bg.bare = BARE.map((c) => to565(tone(c))); }
    FRESH565 = bg.fresh; BARE565 = bg.bare;
    g.draw(bg.canvas, 0, 0);
    clouds(g, t, bg.day, tone);

    const cur = f.hh + f.mm;
    const nf = clockFields(new Date(ctx.date.getTime() + 60000)), nxt = nf.hh + nf.mm;
    const pf = clockFields(new Date(ctx.date.getTime() - 60000)), prv = pf.hh + pf.mm;
    const hourTurn = (cur[1] !== nxt[1] && s > 50) ? s - 60 : (cur[1] !== prv[1] && s < 12) ? s : null;

    // the hour's show: a tall jet and arcs (and a rainbow by day)
    const show = hourTurn === null ? 0 : ease.inOutQuad(progress(hourTurn, -5, -2.5)) * (1 - ease.inOutQuad(progress(hourTurn, 6, 10)));
    rainbow(g, show * (1 - bg.dark) * (bg.sun ? 1 : 0));
    if (hourTurn !== null) doves(g, hourTurn, Math.floor((f.minuteKey + 2) / 60), tone);

    // the breeze: a gust sweeping left to right every 11 s, turning leaves
    const gx = ((t % 11) / 11) * 280 - 60, gamp = 46 + 30 * sin(t * 0.21);
    for (let x = 0; x < W; x++) { const d = (x - gx) / 20, q = 1 - d * d; GUST[x] = q > 0 ? (q * gamp) | 0 : 0; }

    // the four topiaries: far ones first, then the staff behind the near ones, then the near ones
    const poses = [];
    for (let gi = 0; gi < 4; gi++) {
      const slot = WORKER_SLOT[gi];
      let P = null;
      if (cur[slot] !== nxt[slot] && s >= WALK0) {
        P = jobPose(gi, slot, s - 60, planOf(slot, +cur[slot], +nxt[slot]), idlePose(gi, WALK0, t, cur), idlePose(gi, 59.9, t, cur), t);
      } else if (cur[slot] !== prv[slot] && s < HOME1) {
        P = jobPose(gi, slot, s, planOf(slot, +prv[slot], +cur[slot]), idlePose(gi, 0, t, cur), idlePose(gi, HOME1, t, cur), t);
      } else P = idlePose(gi, s, t, cur);
      if (P.x < -12) continue;
      P.outfit = gi;
      poses.push(P);
    }
    poses.sort((a, b) => a.z - b.z);
    const drawStaff = (lo, hi) => {
      for (const P of poses) {
        if (P.z < lo || P.z >= hi) continue;
        const sc = sizeAt(P.z), foot = P.foot ?? footAt(P.z);
        if (P.ladder) {
          const L = P.ladder;
          ladder(g, L.x, L.ground, L.top, L.sc, L.open, tone);
          if (bg.dark > 0.2) {   // by night a lantern hangs from the ladder's top
            const lx = L.x + 2.6 * L.sc, ly = L.top + 2.5 * L.sc, fl = 0.85 + 0.15 * sin(t * 8.7 + L.x);
            g.fillCircle(lx, ly, 5 * L.sc, LANTERN, { aa: true, a: 0.2 * bg.dark * L.open * fl });
            g.fillRect(Math.round(lx - 0.8 * L.sc), Math.round(ly - 1.2 * L.sc), Math.max(2, Math.round(1.8 * L.sc)), Math.max(2, Math.round(2.4 * L.sc)), mix(tone(0x5a6070), hex('ffe0a0'), bg.dark * L.open));
          }
        }
        gardener(g, P.x, foot, sc, P, tone);
      }
    };

    const hedge = (slot) => {
      const d = +cur[slot], gl = glyphOf(slot, d), sh = shades(slot, d, f.minuteKey, light);
      if (cur[slot] !== nxt[slot] && s >= CLIP0) {
        const p = planOf(slot, d, +nxt[slot]);
        const cut = (x) => clamp((x - CLIP0) / (CLIP1 - BARE_T - CLIP0), 0, 1);
        // the shorn wood keeps the old numeral's outline until it drops, top first, in the last half second
        drawHedge(g, slot, sh, gl, 1, p, cut(s), clamp((s - (CLIP1 - BARE_T)) / BARE_T, 0, 1), GUST, 0);
      } else if (cur[slot] !== prv[slot] && s < TRIM1 + 0.1) {
        const p = planOf(slot, +prv[slot], d);
        const u = ease.outCubic(clamp((s - GROW0) / (GROW1 - GROW0), 0, 1)), v = clamp((s - TRIM0) / (TRIM1 - TRIM0), 0, 1);
        drawHedge(g, slot, sh, gl, 2, p, u, v, GUST, 1 - clamp((s - GROW1) / 0.8, 0, 1));
      } else drawHedge(g, slot, sh, gl, 0, null, 0, 0, GUST, 0);
    };
    for (let slot = 0; slot < 4; slot++) hedge(slot);
    if (bg.sun) {
      const sd = -cos(bg.sun.u * Math.PI), tanEl = 0.12 + 1.9 * bg.sun.e;
      shadows(g, clamp(-sd / tanEl, -3.2, 3.2), Math.min(0.55, (0.25 + 0.75 * (1 - sd * sd)) * 0.32 / tanEl), (1 - bg.dark) * 0.9, bg.ground);
    }
    blitHedge(g, 1); blitHedge(g, 2);
    fountain(g, t, 15 + 22 * show, show, tone, bg.dark);
    drawStaff(-1, 0.9);
    blitHedge(g, 0); blitHedge(g, 3);
    // what flies: clippings from the shears, the new growth's burst of leaves, flecks from the idle trimming
    for (let slot = 0; slot < 4; slot++) {
      const S = SLOT[slot], ox = S.x - PAD, oy = S.top - PAD, ground = footAt(S.z) - 0.5, sc = S.k;
      if (cur[slot] !== nxt[slot] && s >= CLIP0) {
        const p = planOf(slot, +cur[slot], +nxt[slot]);
        if (p.hasCut) clippings(g, p.cutTip, ox, oy, CLIP0, CLIP1 - BARE_T, s, ground, f.minuteKey * 4 + slot, 26, tone, sc);
      }
      if (cur[slot] !== prv[slot] && s < TRIM1 + 2.5) {
        const p = planOf(slot, +prv[slot], +cur[slot]);
        if (p.hasCut && s < 2.4) clippings(g, p.cutTip, ox, oy, CLIP0 - 60, CLIP1 - BARE_T - 60, s, ground, (f.minuteKey - 1) * 4 + slot, 26, tone, sc);
        if (p.hasFuzz) clippings(g, p.trimTip, ox, oy, TRIM0, TRIM1, s, ground, f.minuteKey * 4 + slot + 2, 20, tone, sc);
        burst(g, p, ox, oy, s, sc, f.minuteKey + slot, tone);
      }
    }
    for (const P of poses) if (P.snipping) flecks(g, P, t, tone);
    drawRobin(g, s, f.minuteKey, cur, prv, nxt, tone);
    lanterns(g, t, bg.dark, tone);
    drawStaff(0.9, 2);
  },
};
