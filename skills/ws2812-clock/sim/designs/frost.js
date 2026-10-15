// Hoarfrost: a window pane on a winter night. Through the glass, the city
// is out of focus (warm bokeh: sodium lamps, lit windows, cars) and snow
// falls in three depths of parallax. On the glass, the time is frost.
//
// Each numeral is an ice crystal (frost-glyphs.js): a skeleton with the
// pointed roofs of a hexagonal ice prism, every stroke a band of fern-frost
// barbs. Each glyph is an arrival-time field computed once, so growth is a
// threshold rising with time: the crystal races out from its nucleus along
// its strokes, then its feathers creep longer through the minute. Car lights
// passing below sweep across the pane and the facets flash as they turn to
// it; single grains twinkle; now and then a droplet runs down.
//
// Minute: a warm breath fogs the digit, it melts (feathers first, spine
// last, droplets run off), the fog evaporates and the new crystal grows.
// Hour: the whole pane steams over, a finger draws the frog with round
// glasses in the condensation while the old time melts; on the hour the fog
// lifts, the wiped lines freeze into prismatic rainbow frost and the new
// time crystallises. Never blank for more than about half a second.
import * as kit from '../js/kit.js';
import { buildGlyph } from './frost-glyphs.js';
import { frogField } from './frost-frog.js';

const W = 64, H = 64, N = W * H;
const pad2 = (n) => String(n).padStart(2, '0');
const digitsAt = (s) => { const d = new Date(s * 1000); return pad2(d.getHours()) + pad2(d.getMinutes()); };

// ---- composition: big hours top-left, smaller minutes bottom-right, a frost
// diagonal across the pane. The empty bottom-left is where the frog is drawn.
const SLOTS = [
  { x: 3, y: 3, w: 17, h: 30 }, { x: 23, y: 3, w: 17, h: 30 },
  { x: 34, y: 38, w: 13, h: 23 }, { x: 50, y: 38, w: 13, h: 23 },
];
for (const s of SLOTS) { s.cx = s.x + s.w / 2; s.cy = s.y + s.h / 2; }

const glyphs = new Map();
function glyph(d, k) {
  const key = d + '|' + k;
  let g = glyphs.get(key);
  if (!g) {
    const s = SLOTS[k], big = k < 2;
    g = buildGlyph(+d, s.w, s.h, 11 + k * 31 + +d, big ? { barbLen: 2.4, step: 2.4, room: 3 } : { barbLen: 1.7, step: 2.2, room: 2 });
    glyphs.set(key, g);
  }
  return g;
}

// ---- palette (linear)
const ICE = kit.hex('#9cc8ff'), CORE = kit.hex('#e8f4ff'), WATER = kit.hex('#3a7fb0');
const FOG = kit.hex('#3a4656');
const FROG_BANDS = ['#ff4040', '#ff9a30', '#ffe040', '#50e060', '#40a0ff', '#a060ff'].map((c) => kit.scale(kit.hex(c), 0.8));
const LAMPS = [kit.hex('#ffae4a'), kit.hex('#ffcf8a'), kit.hex('#ff8c3a'), kit.hex('#ffe2b8'), kit.hex('#ff5a3c'), kit.hex('#7fd6b0')];

// ---- the city behind the glass: static lights (bokeh discs)
const LIGHTS = [];
for (let i = 0; i < 9; i++) {
  const h = (k) => kit.hash(i, k, 404);
  const y = 30 + 32 * Math.sqrt(h(1));
  LIGHTS.push({
    x: -2 + 68 * ((i + 0.3 + 0.5 * h(0)) / 9), y, r: 2.4 + 3.0 * h(2),
    c: LAMPS[i % 7 === 5 ? 5 : Math.floor(h(3) * 5)], a: 0.05 + 0.08 * h(4) * (0.5 + (y - 30) / 64),
    ph: h(5) * kit.TAU, sp: 0.15 + 0.3 * h(6),
  });
}
// cars on the street below: headlights one way, tail lights the other
const CARS = [
  { y: 58, r: 3.8, c: kit.hex('#fff0d0'), a: 0.17, period: 13, off: 0.15, dir: 1, glint: true },
  { y: 55, r: 3.0, c: kit.hex('#ff3a2a'), a: 0.11, period: 17, off: 0.6, dir: -1 },
  { y: 60, r: 4.4, c: kit.hex('#ffe4b0'), a: 0.14, period: 29, off: 0.42, dir: -1, glint: true },
];
function carX(c, now) { const u = kit.fract(now / c.period + c.off); return c.dir > 0 ? -10 + u * 84 : 74 - u * 84; }

// ---- snow, three depths
const FLAKES = [];
for (let i = 0; i < 46; i++) {
  const layer = i < 26 ? 0 : i < 40 ? 1 : 2, h = (k) => kit.hash(i, k, 77);
  FLAKES.push({ layer, x0: h(0) * 80, y0: h(1) * 72, v: [3.2, 6.5, 13][layer] * (0.8 + 0.4 * h(2)), r: [0.75, 1.05, 2.0][layer],
    a: [0.05, 0.085, 0.05][layer], sw: h(3) * kit.TAU, sa: 0.6 + 1.2 * h(4) });
}

// ---- per-pixel constants
const SKY = new Float32Array(3 * N), TW = new Float32Array(N), TWF = new Float32Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = y * W + x, u = y / 63;
  // deep night blue above, the city's warm haze low down
  SKY[3 * p] = 0.016 * u * u * u; SKY[3 * p + 1] = 0.008 * u * u * u; SKY[3 * p + 2] = 0.009 * u * u;
  TW[p] = kit.hash(p, 3, 9) * kit.TAU; TWF[p] = kit.hash(p, 4, 9) < 0.14 ? 0.7 + 1.6 * kit.hash(p, 5, 9) : 0;
}
const FROGF = frogField(W, H);
// crystalline grain: ice is never an even film
const GRAIN = new Float32Array(N);
for (let p = 0; p < N; p++) GRAIN[p] = 0.65 + 0.7 * kit.hash(p, 21, 5);
// a static cloud field: where condensation thins first as it evaporates
// (warm middle first, the cold pane edges last)
const NF = new Float32Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const e = Math.max(Math.abs(x - 31.5), Math.abs(y - 31.5)) / 32;
  NF[y * W + x] = 0.62 * kit.fbm(x * 0.09, y * 0.09, 3.3, 3) + 0.38 * e * e;
}
// condensation is a mottle of tiny droplets, never a flat film
const MOT = new Float32Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) MOT[y * W + x] = Math.max(0.15, 0.1 + 1.4 * kit.fbm(x * 0.22, y * 0.22, 7.7, 3) + 0.35 * (kit.hash(x, y, 77) - 0.5));

// ---- the minute's choreography, per boundary B (seconds), per slot
const plans = new Map();
function plan(B) {
  let P = plans.get(B);
  if (P) return P;
  const prev = digitsAt(B - 60), next = digitsAt(B), hour = next.endsWith('00');
  const ch = [0, 1, 2, 3].filter((k) => prev[k] !== next[k]);
  const slot = [];
  for (let k = 0; k < 4; k++) {
    const changed = ch.includes(k);
    let mS, gS, md, gd;
    if (hour) {
      // melt right to left inside the fog, all gone before the hour strikes;
      // then grow left to right after it
      const jm = [...ch].reverse().indexOf(k), jg = ch.indexOf(k);
      md = 1.4; mS = -1.4 - 0.25 * (ch.length - 1 - jm) - 0.05; gd = 2.1; gS = 0.25 * jg;
    } else {
      const j = ch.length - 1 - ch.indexOf(k);
      md = 1.0; mS = -1.15 - 0.2 * j; gd = 1.7; gS = 0.05 + 0.2 * (ch.indexOf(k));
    }
    slot.push({ changed, mS, mE: mS + md, gS, gE: gS + gd });
  }
  P = { B, prev, next, hour, slot };
  if (plans.size > 16) plans.clear();
  plans.set(B, P);
  return P;
}
/** Growth level of a crystal `age` s after its growth began: 0..1 racing out, then creeping to 1.45. */
function grow(age, dur) {
  if (age <= 0) return 0;
  if (age < dur) { const u = age / dur; return 1 - (1 - u) * (1 - u); }
  return 1 + 0.45 * kit.ease.out(Math.min(1, (age - dur) / 50));   // feathers creep longer all minute
}
/** Growth of slot k at `now` when it is not inside a turn: from its last change. */
function restLevel(k, now) {
  const B0 = Math.floor(now / 60) * 60;
  for (let j = 0; j < 4; j++) {
    const P = plan(B0 - 60 * j), s = P.slot[k];
    if (s.changed) return grow(now - P.B - s.gS, s.gE - s.gS);
  }
  return 1.45;
}

const IMG = new Float32Array(3 * N), BOK = new Float32Array(3 * N), FOGA = new Float32Array(N);
const GLOW = new Float32Array(3 * 17 * 17);

function disc(buf, x, y, r, c, a) {
  const x0 = Math.max(0, Math.floor(x - r - 1)), x1 = Math.min(W - 1, Math.ceil(x + r + 1));
  const y0 = Math.max(0, Math.floor(y - r - 1)), y1 = Math.min(H - 1, Math.ceil(y + r + 1));
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const d = Math.hypot(xx - x, yy - y);
    if (d > r + 0.8) continue;
    // an out-of-focus highlight: flat disc, a touch brighter at the rim
    const f = kit.clamp(r + 0.6 - d) * (0.8 + 0.35 * kit.smoothstep(r - 1.6, r, d)) * a, p = 3 * (yy * W + xx);
    buf[p] += c[0] * f; buf[p + 1] += c[1] * f; buf[p + 2] += c[2] * f;
  }
}
function soft(buf, x, y, r, c, a) {
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const q = ((xx - x) ** 2 + (yy - y) ** 2) / (r * r);
    if (q >= 1) continue;
    const f = (1 - q) * (1 - q) * a, p = 3 * (yy * W + xx);
    buf[p] += c[0] * f; buf[p + 1] += c[1] * f; buf[p + 2] += c[2] * f;
  }
}
/** Everything behind the glass at `now`: sky, bokeh, snow into BOK; the light's broad glow into GLOW. */
function outside(now) {
  BOK.set(SKY);
  GLOW.fill(0);
  const glowAdd = (x, y, c, a) => {
    for (let j = 0; j < 17; j++) for (let i = 0; i < 17; i++) {
      const q = ((i * 4 - x) ** 2 + (j * 4 - y) ** 2) / 150, f = a * Math.exp(-q), p = 3 * (j * 17 + i);
      GLOW[p] += c[0] * f; GLOW[p + 1] += c[1] * f; GLOW[p + 2] += c[2] * f;
    }
  };
  for (const L of LIGHTS) {
    const a = L.a * (0.85 + 0.15 * Math.sin(now * L.sp + L.ph));
    const x = L.x + 0.6 * Math.sin(now * 0.05 + L.ph);  // the eye's focus breathing
    disc(BOK, x, L.y, L.r, L.c, a);
    glowAdd(x, L.y, L.c, a * L.r * 0.5);
  }
  for (const c of CARS) {
    const x = carX(c, now);
    disc(BOK, x, c.y, c.r, c.c, c.a);
    glowAdd(x, c.y, c.c, c.a * c.r * 0.6);
  }
  for (const f of FLAKES) {
    const y = ((f.y0 + f.v * now) % 74) - 5;
    const x = ((f.x0 + now * (1.2 + f.layer) + f.sa * Math.sin(now * 0.7 + f.sw + y * 0.05)) % 80) - 8;
    const warm = 0.6 + 1.4 * (y / 64);
    soft(BOK, x, y, f.r + 0.6, [0.8, 0.86, 1], f.a * warm);
  }
}
const glowAt = (x, y, c) => {
  const gx = Math.min(15.999, x / 4), gy = Math.min(15.999, y / 4), i = gx | 0, j = gy | 0, u = gx - i, v = gy - j;
  const p = 3 * (j * 17 + i);
  return (GLOW[p + c] * (1 - u) + GLOW[p + 3 + c] * u) * (1 - v) + (GLOW[p + 51 + c] * (1 - u) + GLOW[p + 54 + c] * u) * v;
};

export default {
  name: 'Hoarfrost',
  blurb: 'the time grows as ice crystals on a night window; breath melts a minute, a finger draws the frog at the hour',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx), o = ctx.out;
    const now = ctx.date.getTime() / 1000;
    const B = Math.round(now / 60) * 60, tB = now - B, P = plan(B);
    const dim = 1 - 0.6 * ctx.night;
    outside(now);

    // ---- fog on the glass
    FOGA.fill(0);
    let hourFog = 0;
    if (P.hour) {
      hourFog = kit.smoothstep(-5.2, -4.0, tB);
      const c = kit.lerp(-0.25, 1.15, kit.smoothstep(0.2, 3.6, tB));   // evaporation front over NF
      if (hourFog > 0 && tB < 3.8) for (let p = 0; p < N; p++) FOGA[p] = hourFog * kit.smoothstep(c - 0.1, c + 0.1, NF[p]) * 0.95;
    } else {
      for (let k = 0; k < 4; k++) {
        const s = P.slot[k], S = SLOTS[k];
        if (!s.changed || tB < s.mS - 0.7 || tB > s.gS + 1.8) continue;
        // a breath: a milky oval blooms out from the digit, then shrinks as its
        // thin rim evaporates first
        const front = kit.ease.out(kit.clamp((tB - (s.mS - 0.7)) / 0.55));
        const R = front * (1 - kit.ease.inOut(kit.clamp((tB - (s.gS + 0.1)) / 1.7)));
        if (R <= 0.01) continue;
        const rx = S.w / 2 + 4, ry = S.h / 2 + 3.5;
        for (let y = Math.max(0, S.y - 6); y < Math.min(H, S.y + S.h + 6); y++) for (let x = Math.max(0, S.x - 7); x < Math.min(W, S.x + S.w + 7); x++) {
          const p = y * W + x, d = Math.hypot((x - S.cx) / rx, (y - S.cy - 1) / ry) + 0.12 * (NF[p] - 0.45);
          const f = 0.8 * (1 - kit.smoothstep(R * 0.45, R, d));
          if (f > FOGA[p]) FOGA[p] = f;
        }
      }
    }
    // the finger wipes the frog through the hour's fog
    const fingerP = P.hour ? kit.clamp((tB + 3.9) / 3.4) : 0;
    const frozen = P.hour ? kit.smoothstep(0.6, 2.4, tB) * (1 - kit.smoothstep(18, 28, tB)) : 0;
    if (P.hour && fingerP > 0 && hourFog > 0) {
      for (let y = 34; y < 63; y++) for (let x = 0; x < 30; x++) {
        const p = y * W + x, s = FROGF.s[p];
        if (s > 2) continue;
        const passed = kit.clamp((fingerP - s) / 0.012);
        FOGA[p] *= 1 - 0.92 * passed * (1 - kit.smoothstep(0.8, 1.6, FROGF.d[p]));
      }
    }

    // ---- compose: outside seen through the fog, the fog's own glow
    for (let p = 0; p < N; p++) {
      const f = FOGA[p], x = p & 63, y = p >> 6, k = 3 * p;
      if (f <= 0) { IMG[k] = BOK[k]; IMG[k + 1] = BOK[k + 1]; IMG[k + 2] = BOK[k + 2]; continue; }
      const veil = 1 - 0.8 * f, m = f * MOT[p];
      IMG[k] = BOK[k] * veil + m * (FOG[0] + 0.45 * glowAt(x, y, 0));
      IMG[k + 1] = BOK[k + 1] * veil + m * (FOG[1] + 0.45 * glowAt(x, y, 1));
      IMG[k + 2] = BOK[k + 2] * veil + m * (FOG[2] + 0.45 * glowAt(x, y, 2));
    }
    // the headlight beam sweeping across the glass: a faint warm sheen
    for (const c of CARS) {
      if (!c.glint) continue;
      const gx = carX(c, now);
      if (gx < -20 || gx > 84) continue;
      for (let y = 0; y < H; y++) {
        const bx = gx - (63 - y) * 0.35, x0 = Math.max(0, Math.floor(bx - 14)), x1 = Math.min(63, Math.ceil(bx + 14)), fy = 0.004 + 0.01 * (y / 63);
        for (let x = x0; x <= x1; x++) {
          const a = fy * Math.exp(-(((x - bx) / 7) ** 2)), k = 3 * (y * W + x);
          IMG[k] += c.c[0] * a; IMG[k + 1] += c.c[1] * a; IMG[k + 2] += c.c[2] * a;
        }
      }
    }
    // beads of water pushed to the edges of the finger's line
    if (P.hour && fingerP > 0 && hourFog > 0) {
      for (let y = 34; y < 63; y++) for (let x = 0; x < 30; x++) {
        const p = y * W + x, s = FROGF.s[p], d = FROGF.d[p];
        if (s > 2 || d < 1.3) continue;
        const b = kit.clamp((fingerP - s) / 0.012) * kit.smoothstep(1.3, 1.9, d) * (1 - kit.smoothstep(1.9, 2.6, d)) * FOGA[p];
        IMG[3 * p] += 0.07 * b; IMG[3 * p + 1] += 0.08 * b; IMG[3 * p + 2] += 0.1 * b;
      }
    }

    // ---- the frost
    const glints = [];
    for (const c of CARS) if (c.glint) { const x = carX(c, now); if (x > -12 && x < 76) glints.push(x); }
    for (let k = 0; k < 4; k++) {
      const s = P.slot[k], S = SLOTS[k];
      let d, g, wet = 0, growing = 0;
      if (s.changed && tB < 0) {
        d = P.prev[k];
        const m = kit.clamp((tB - s.mS) / (s.mE - s.mS));
        g = restLevel(k, now) * (1 - kit.ease.inOut(m)); wet = kit.smoothstep(-0.25, 0.3, tB - s.mS);
      } else if (s.changed) {
        d = P.next[k]; g = grow(tB - s.gS, s.gE - s.gS); growing = 1 - kit.smoothstep(s.gE - 0.4, s.gE + 0.6, tB);
      } else { d = (tB < 0 ? P.prev : P.next)[k]; g = restLevel(k, now); }
      if (g <= 0) continue;
      const Gl = glyph(d, k), gw = Gl.w, ox = S.x - Gl.pad, oy = S.y - Gl.pad;
      for (let j = 0; j < Gl.h; j++) {
        const y = oy + j;
        if (y < 0 || y >= H) continue;
        for (let i = 0; i < gw; i++) {
          const q = j * gw + i, cv = Gl.cov[q];
          if (cv <= 0.02) continue;
          const x = ox + i;
          if (x < 0 || x >= W) continue;
          const T = Gl.T[q], e = g - T;
          if (e <= -0.03) continue;
          const v = cv * kit.smoothstep(-0.03, 0.03, e);
          const p = y * W + x, kk = 3 * p, sp = Gl.spine[q];
          // light from behind scatters in the ice
          const br = 0.25 * BOK[kk] + 0.6 * BOK[kk + 1] + 0.15 * BOK[kk + 2] + 0.5 * glowAt(x, y, 1);
          const lvl = (0.26 + 0.8 * sp + 1.5 * br) * (sp > 0.5 ? 1 : GRAIN[p]);
          let r = ICE[0] * lvl + 0.5 * BOK[kk], gg = ICE[1] * lvl + 0.5 * BOK[kk + 1], b = ICE[2] * lvl + 0.5 * BOK[kk + 2];
          // sparkle: passing car light catching the facets that face it, twinkling grains, the growing front
          let sk = 0;
          for (const gx of glints) {
            // the beam leans: it comes up from the street, so it crosses lower rows first
            const bx = gx - (63 - y) * 0.35;
            const band = Math.exp(-(((x - bx) / 9) ** 2)), c2 = Math.cos(2 * (Gl.ang[q] - (gx / 64) * Math.PI));
            sk += band * (0.2 + (c2 > 0 ? 1.4 * c2 ** 6 : 0));
          }
          if (TWF[p] > 0) { const t = Math.sin(now * TWF[p] * 2.2 + TW[p]); if (t > 0.9) sk += ((t - 0.9) * 10) ** 2 * 0.45; }
          if (e < 0.09) sk += (1 - e / 0.09) * (0.15 + 0.5 * growing);
          sk *= 1 - wet;
          r += CORE[0] * sk; gg += CORE[1] * sk; b += CORE[2] * sk;
          if (wet > 0) {   // melting: glassy water that shows the lights through it
            const w = wet * 0.8;
            r = kit.lerp(r, WATER[0] * 0.35 + 2 * BOK[kk], w); gg = kit.lerp(gg, WATER[1] * 0.35 + 2 * BOK[kk + 1], w); b = kit.lerp(b, WATER[2] * 0.35 + 2 * BOK[kk + 2], w);
          }
          const a = v * (1 + 0.25 * FOGA[p]);
          IMG[kk] += r * a; IMG[kk + 1] += gg * a; IMG[kk + 2] += b * a;
        }
      }
    }
    // ---- the frog the finger drew: wet lines that freeze into prismatic frost
    if (P.hour && tB > -4.2) {
      for (let y = 34; y < 63; y++) for (let x = 0; x < 30; x++) {
        const p = y * W + x, s = FROGF.s[p];
        if (s > 2) continue;
        const core = 1 - kit.smoothstep(0.6, 1.5, FROGF.d[p]), kk = 3 * p;
        if (core <= 0) continue;
        // the fingertip: water pushed ahead of it glints
        const tip = Math.exp(-(((fingerP - s) / 0.012) ** 2)) * hourFog * (fingerP < 1 ? 1 : 0);
        if (tip > 0.01) { IMG[kk] += 0.16 * tip * core; IMG[kk + 1] += 0.18 * tip * core; IMG[kk + 2] += 0.2 * tip * core; }
        if (frozen > 0 && s <= 1) {
          // ice prisms split the street light: the frog freezes in rainbow bands
          const band = Math.floor(kit.clamp((y - 38.5) / 22) * 5.99);
          const c = FROG_BANDS[band];
          let sk = 0;
          if (TWF[p] > 0) { const t = Math.sin(now * TWF[p] * 3 + TW[p]); if (t > 0.8) sk = (t - 0.8) * 5 * 0.4; }
          const fz = frozen * (1 - FOGA[p]), a = fz * core * (0.42 * GRAIN[p] + sk);
          IMG[kk] += c[0] * a + CORE[0] * sk * fz; IMG[kk + 1] += c[1] * a + CORE[1] * sk * fz; IMG[kk + 2] += c[2] * a + CORE[2] * sk * fz;
        }
      }
    }

    // ---- droplets: off each melting digit, and now and then from the top of the pane
    const drops = [];
    for (let k = 0; k < 4; k++) {
      const s = P.slot[k], S = SLOTS[k];
      if (!s.changed) continue;
      for (let i = 0; i < 3; i++) drops.push([s.mS + 0.3 + 0.3 * i, S.x + 1 + (S.w - 2) * ((i + 0.5 * kit.hash(B, k, i)) / 3), S.y + S.h * (0.12 + 0.3 * kit.hash(B, k, i + 5)), k * 3 + i]);
    }
    for (let e = Math.floor(now / 13) - 1; e <= Math.floor(now / 13); e++) {
      if (kit.hash(e, 3, 31) > 0.55) continue;
      drops.push([e * 13 + 6 * kit.hash(e, 1, 31) - B, 2 + 60 * kit.hash(e, 2, 31), 3 + 18 * kit.hash(e, 4, 31), 50 + e]);
    }
    for (const [t0, x0, y0, id] of drops) {
      const tau = tB - t0;
      if (tau < 0 || tau > 9) continue;
      const tm = Math.max(0, tau - 0.4);                       // a bead swells, then lets go
      const y = y0 + 6.5 * tm - (5.5 / 3.1) * Math.sin(3.1 * tm);  // stop-go, never backwards
      if (y > 66) continue;
      const ph = kit.hash(id, 7, 7) * 6;
      const xAt = (yy) => x0 + 0.7 * Math.sin((yy - y0) * 0.21 + ph);
      const sw = kit.smoothstep(0, 0.4, tau);
      // the wet trail behind it
      for (let yy = Math.ceil(y0); yy < y - 1; yy++) {
        const xx = xAt(yy), xi = Math.floor(xx), u = xx - xi, a = 0.03 * Math.exp(-(y - yy) / 9);
        for (const [cx, w] of [[xi, 1 - u], [xi + 1, u]]) {
          if (cx < 0 || cx >= W || yy < 0 || yy >= H) continue;
          const kk = 3 * (yy * W + cx);
          IMG[kk] += (0.3 + 3 * BOK[kk]) * a * w; IMG[kk + 1] += (0.45 + 3 * BOK[kk + 1]) * a * w; IMG[kk + 2] += (0.6 + 3 * BOK[kk + 2]) * a * w;
        }
      }
      // the bead: a tiny lens showing the warm street, with a cold highlight
      const bx = xAt(y), r = 1.2 + 0.4 * sw;
      const kc = 3 * (Math.min(63, Math.max(0, Math.round(y))) * W + Math.min(63, Math.max(0, Math.round(bx))));
      soft(IMG, bx, y, r, [0.5 + 4 * BOK[kc], 0.6 + 3 * BOK[kc + 1], 0.75 + 2 * BOK[kc + 2]], 0.32 * sw);
      soft(IMG, bx - 0.3, y - 0.4, 0.9, CORE, 0.3 * sw);
    }
    kit.blitGrid(ctx, IMG, dim);
  },
};
