// karesansui: a dry rock garden seen from straight above, lit by the real
// sun. The time is the gravel nobody raked: four flat islands in the shape
// of the digits, echoed outward by concentric furrows the way a rake rings
// a stone, then running out into long parallel lines. Two stones in moss
// are the colon.
//
// Rendering: every pixel is gravel with a height (a furrow profile along a
// distance field) shaded by a low light whose direction follows the sun
// across the day (from the right at dawn, overhead at noon, from the left
// at dusk; the moon at night). So the furrows that face the light glint and
// the ones along it go quiet, and the whole garden turns over the day.
// Nothing is outlined; the digits read only as smooth flats among grooves.
//
// Story: before each minute turns, a monk walks in and rakes the changing
// digits away in a boustrophedon, walking backwards so he never steps on
// what he has done; after :00 he rakes the new ones in. Fresh-raked gravel
// is damp and darker and dries in a few seconds. A maple overhangs the
// garden from outside the frame: only its shadow is seen, swaying, sliding
// with the sun, and now and then a leaf drops (its shadow meeting it as it
// lands) until a gust before the raking clears them off.
//
// Palette: sand, warm grey furrow shadow, sky-blue shade under the maple,
// granite, moss, and the season's leaf; re-lit per time of day.
// Hard pixels for the gravel (a per-pixel shader through a tone table);
// AA for the monk, rake and leaves, which move by fractions of a pixel.

import { mix, hex, clamp, lerp, progress, rand, clockFields, previousMinute } from '../js/kit.js';
import {
  W, H, P, RING, FW, FH, M, GLYPH, DX, DY, STONES, kind, stoneU, stoneGX, stoneGY,
  rnx, rny, rnz, lineV, lineGX, lineGY, grain, TW, TH, TOX, TOY, shadeA, shadeB, maple,
} from './karesansui-garden.js';

// ------------------------------------------------------------ tables

const SIN = new Float32Array(64), COS = new Float32Array(64);
for (let i = 0; i < 64; i++) { SIN[i] = Math.sin((i / 64) * Math.PI * 2); COS[i] = Math.cos((i / 64) * Math.PI * 2); }
const PH = 64 / P;          // table steps per pixel of phase
const TONES = 48, SHL = 8;  // tone levels, shadow levels

const PAL = {
  night: { lo: hex('#161d2c'), mid: hex('#4a5874'), hi: hex('#a6b6d2'), sh: hex('#0a0f1c'), rlo: hex('#0e1018'), rhi: hex('#6a7488'), mlo: hex('#0e1a14'), mhi: hex('#3a5a48'), shade: 0.45 },
  dawn: { lo: hex('#6c5a68'), mid: hex('#cdb0a0'), hi: hex('#ffe6c4'), sh: hex('#3e3c6e'), rlo: hex('#2a2430'), rhi: hex('#b09888'), mlo: hex('#26381e'), mhi: hex('#8aa050'), shade: 0.62 },
  day: { lo: hex('#7d7668'), mid: hex('#c9c1ae'), hi: hex('#f6f2e6'), sh: hex('#4c5c80'), rlo: hex('#2c2c32'), rhi: hex('#a6a296'), mlo: hex('#24401c'), mhi: hex('#86a640'), shade: 0.72 },
  dusk: { lo: hex('#64485a'), mid: hex('#c0906e'), hi: hex('#ffcc8e'), sh: hex('#36325e'), rlo: hex('#24181e'), rhi: hex('#b08060'), mlo: hex('#22301a'), mhi: hex('#8a8a3a'), shade: 0.62 },
};
const KEYS = [[0, 'night'], [5.2, 'night'], [6.3, 'dawn'], [8, 'day'], [16.6, 'day'], [18.2, 'dusk'], [19.4, 'night'], [24, 'night']];

function paletteAt(hf) {
  let k = 1;
  while (KEYS[k][0] < hf) k++;
  const [h0, a] = KEYS[k - 1], [h1, b] = KEYS[k], u = (hf - h0) / (h1 - h0 || 1);
  const pa = PAL[a], pb = PAL[b], out = {};
  for (const f of Object.keys(pa)) out[f] = f === 'shade' ? lerp(pa[f], pb[f], u) : mix(pa[f], pb[f], u);
  return out;
}

/** Light: unit direction towards it over the ground, and how raking it is (0 overhead .. 1 at the horizon). */
function lightAt(hf) {
  // the sun from 6:00 (right) over the top to 18:30 (left); the moon back over the top by night
  const th = hf >= 6 && hf < 18.5 ? (Math.PI * (hf - 6)) / 12.5
    : Math.PI * (1 - (((hf + 24 - 18.5) % 24) / 11.5));
  const span = hf >= 6 && hf < 18.5 ? (hf - 6) / 12.5 : ((hf + 24 - 18.5) % 24) / 11.5;
  const elev = Math.sin(Math.PI * span);
  return { lx: Math.cos(th), ly: -Math.sin(th), low: 1 - 0.7 * elev };
}

function tone(lo, mid, hi, s) {
  return s < 0.55 ? mix(lo, mid, s / 0.55) : mix(mid, hi, (s - 0.55) / 0.45);
}

let lutKey = '', LUT = null;
function lutFor(pal, key) {
  if (key === lutKey) return LUT;
  LUT = new Int32Array(3 * SHL * TONES);
  for (let m = 0; m < 3; m++)
    for (let sh = 0; sh < SHL; sh++)
      for (let t = 0; t < TONES; t++) {
        const s = t / (TONES - 1);
        const c = m === 0 ? tone(pal.lo, pal.mid, pal.hi, s)
          : m === 1 ? tone(pal.rlo, mix(pal.rlo, pal.rhi, 0.5), pal.rhi, s)
            : tone(pal.mlo, mix(pal.mlo, pal.mhi, 0.55), pal.mhi, s);
        // shade under the maple: lit by sky only, so darker and bluer
        const k = (sh / (SHL - 1)) * pal.shade;
        LUT[(m * SHL + sh) * TONES + t] = mix(c, mix(pal.sh, c, 0.35 + 0.3 * s), k);
      }
  lutKey = key;
  return LUT;
}

// ------------------------------------------------------------ the clock as cells

/** The four cells' digits (null = blank: no leading zero on the hour). */
function cellsOf(f) {
  return [f.h >= 10 ? Math.floor(f.h / 10) : null, f.h % 10, Math.floor(f.m / 10), f.m % 10];
}
const firstChange = (a, b) => { for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return i; return -1; };

// ------------------------------------------------------------ the monk's path

const SH = 16, NS = 5, TURN = SH / 2;

function lineSeg(x0, y0, x1, y1, rake = -1) {
  return { k: 0, x0, y0, x1, y1, len: Math.hypot(x1 - x0, y1 - y0), rake };
}
function arcSeg(cx, cy, r, a0, a1) {
  return { k: 1, cx, cy, r, a0, a1, len: r * Math.abs(a1 - a0), rake: -1 };
}

const plans = new Map();
/** The raking of everything from cell `first` rightwards. */
function planFor(first) {
  if (plans.has(first)) return plans.get(first);
  const xa = first <= 0 ? 0 : DX[first] - 12, xb = W;
  const segs = [lineSeg(xa - TURN, -24, xa - TURN, 0), arcSeg(xa, 0, TURN, Math.PI, Math.PI / 2)];
  for (let j = 0; j < NS; j++) {
    const y = SH / 2 + SH * j, lr = j % 2 === 0;
    segs.push(lr ? lineSeg(xa, y, xb, y, j) : lineSeg(xb, y, xa, y, j));
    if (j < NS - 1) segs.push(lr ? arcSeg(xb, y + TURN, TURN, -Math.PI / 2, Math.PI / 2) : arcSeg(xa, y + TURN, TURN, Math.PI * 1.5, Math.PI / 2));
  }
  segs.push(lineSeg(xb, H - SH / 2, xb + 44, H - SH / 2));
  let L = 0;
  const sStrip = [];
  for (const s of segs) { s.s0 = L; if (s.rake >= 0) sStrip[s.rake] = L; L += s.len; }
  const T = clamp(L / 38, 9, 18);
  const plan = { first, xa, xb, segs, L, T, sStrip };
  plans.set(first, plan);
  return plan;
}

function pointAt(plan, s) {
  s = clamp(s, 0, plan.L);
  for (const g of plan.segs) {
    if (s > g.s0 + g.len && g !== plan.segs[plan.segs.length - 1]) continue;
    const f = g.len ? (s - g.s0) / g.len : 0;
    if (g.k === 0) {
      const tx = (g.x1 - g.x0) / g.len, ty = (g.y1 - g.y0) / g.len;
      return { x: g.x0 + (g.x1 - g.x0) * f, y: g.y0 + (g.y1 - g.y0) * f, tx, ty };
    }
    const a = g.a0 + (g.a1 - g.a0) * f, sg = Math.sign(g.a1 - g.a0);
    return { x: g.cx + g.r * Math.cos(a), y: g.cy + g.r * Math.sin(a), tx: -sg * Math.sin(a), ty: sg * Math.cos(a) };
  }
}

/** Path distance at which the rake passes pixel (x, y), or -1 if the pass does not cover it. */
function sOfPixel(plan, px, py) {
  if (px < plan.xa) return -1;
  const j = Math.min(NS - 1, (py / SH) | 0);
  return plan.sStrip[j] + (j % 2 === 0 ? px - plan.xa : plan.xb - px);
}

const ERASE_END = 59.4, DRAW_START = 0.6, DRY = 6;

// ------------------------------------------------------------ leaves

const LEAF = {
  autumn: [hex('#c8341e'), hex('#e0662a'), hex('#d89a2a'), hex('#a82a22')],
  summer: [hex('#5a8a2c'), hex('#7aa83a'), hex('#4a7426')],
  winter: [hex('#8a5a32'), hex('#a0703c')],
  spring: [hex('#e8a0a8'), hex('#8ab84a'), hex('#f0b8c0')],
};
function leafColours(mon) {
  return mon >= 9 && mon <= 11 ? LEAF.autumn : mon === 12 || mon <= 2 ? LEAF.winter : mon <= 5 ? LEAF.spring : LEAF.summer;
}
const GUST = 41;

// ------------------------------------------------------------ the face

export default {
  name: 'Karesansui',
  blurb: 'A raked dry garden from above, lit by the real sun: the time is the gravel left smooth; a monk rakes each minute out and the next one in.',
  fps: 30,

  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec, date = ctx.date;
    ctx.lcd.backlight(1 - 0.62 * ctx.night);
    const hf = f.h + f.m / 60 + sec / 3600;
    const pal = paletteAt(hf);
    const L = lightAt(hf);
    const lut = lutFor(pal, Math.floor(hf * 120) + ':' + f.mon);
    const K = 0.14 + 0.16 * L.low;           // furrow flank contrast
    const lx = L.lx, ly = L.ly;
    const tt = (date.getTime() / 1000) % 7200; // continuous time for the wind

    // --- which digits are where, and who is raking
    const cur = cellsOf(f), prev = cellsOf(previousMinute(date)), next = cellsOf(clockFields(new Date(date.getTime() + 60000)));
    const fd = firstChange(prev, cur), fe = firstChange(cur, next);
    const pd = fd >= 0 ? planFor(fd) : null, pe = fe >= 0 ? planFor(fe) : null;
    const tE = pe ? ERASE_END - pe.T : 99;                 // erase pass starts
    const erasing = pe && sec >= tE;
    const drawing = pd && sec < DRAW_START + pd.T;
    const sRakeE = erasing ? (progress(sec, tE, ERASE_END)) * pe.L : -1;
    const sRakeD = drawing ? (progress(sec, DRAW_START, DRAW_START + pd.T)) * pd.L : -1;

    const slots = [];
    for (let p = 0; p < 4; p++) {
      if (cur[p] === null) continue;
      let gate = 0;
      if (erasing && p >= fe) gate = 1;       // present until the rake has passed
      if (drawing && p >= fd) gate = 2;       // present once the rake has passed
      const gl = GLYPH[cur[p]];
      slots.push({ u: gl.u, gx: gl.gx, gy: gl.gy, ox: DX[p] - M, oy: DY - M, gate });
    }
    const nSlots = slots.length;

    // damp gravel: the pass that is on, or just finished (the draw pass
    // covers the same ground as the erase pass a minute ago)
    const dampD = pd && sec < DRAW_START + pd.T + DRY ? pd : null;
    const dampE = erasing ? pe : null;

    // --- shadows: the maple (swaying, gusting, sliding with the sun) and the stones
    const gust = Math.max(0, Math.sin(Math.PI * progress(sec, GUST - 1, GUST + 6)));
    const shLen = 4 + 12 * L.low;
    const sunX = -lx * shLen, sunY = -ly * shLen;
    const swA = 1 + 2.5 * gust, swB = 1.6 + 4 * gust;
    const aX = Math.round(TOX - sunX + swA * (0.9 * Math.sin(tt * 0.83) + 0.5 * Math.sin(tt * 2.1 + 1))), aY = Math.round(TOY - sunY + swA * 0.5 * Math.sin(tt * 0.61));
    const bX = Math.round(TOX - sunX + swB * (0.9 * Math.sin(tt * 1.13 + 2) + 0.5 * Math.sin(tt * 2.7))), bY = Math.round(TOY - sunY + swB * 0.6 * Math.sin(tt * 0.9 + 1));
    const castLen = 1.5 + 5 * L.low;
    const casts = STONES.map((s) => ({ ax: s.cx, ay: s.cy, bx: s.cx - lx * castLen, by: s.cy - ly * castLen, r2: (s.r * 1.05) ** 2 }));

    const RTONE = TONES - 1;
    g.paint((px, py, x, y) => {
      const i = y * W + x;
      // maple shade
      let sh = 0;
      const ax = x + aX, ay = y + aY, bx = x + bX, by = y + bY;
      if (ax >= 0 && ax < TW && ay >= 0 && ay < TH) sh = shadeA[ay * TW + ax];
      if (bx >= 0 && bx < TW && by >= 0 && by < TH) { const v = shadeB[by * TW + bx]; if (v > sh) sh = v; }
      const k = kind[i];
      let s, mat = 0;
      if (k === 1) {
        mat = 1;
        s = 0.3 + 0.62 * Math.max(0, rnx[i] * lx * 0.8 + rny[i] * ly * 0.8 + rnz[i] * (1 - 0.6 * L.low)) + grain[i] * 1.5;
      } else {
        // the stones' cast shadow on moss and gravel
        for (let c = 0; c < 2; c++) {
          const q = casts[c], ex = q.bx - q.ax, ey = q.by - q.ay;
          let u = ((px - q.ax) * ex + (py - q.ay) * ey) / (ex * ex + ey * ey);
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const dx = px - q.ax - u * ex, dy = py - q.ay - u * ey;
          if (dx * dx + dy * dy < q.r2) { sh = sh > 0.85 ? sh : 0.85; }
        }
        if (k === 2) {
          mat = 2;
          s = 0.5 + grain[i] * 3.2 - 0.1 * stoneU[i] / 2;
        } else {
          let u = stoneU[i], gx = stoneGX[i], gy = stoneGY[i];
          let sE = -2, sD = -2;   // the pixel's rake distance in each pass, computed when needed
          for (let n = 0; n < nSlots; n++) {
            const sl = slots[n], qx = x - sl.ox, qy = y - sl.oy;
            if (qx < 0 || qy < 0 || qx >= FW || qy >= FH) continue;
            const q = qy * FW + qx, v = sl.u[q];
            if (v >= u) continue;
            if (sl.gate === 1) { if (sE === -2) sE = sOfPixel(pe, px, py); if (sE >= 0 && sE <= sRakeE) continue; }
            else if (sl.gate === 2) { if (sD === -2) sD = sOfPixel(pd, px, py); if (!(sD >= 0 && sD <= sRakeD)) continue; }
            u = v; gx = sl.gx[q]; gy = sl.gy[q];
          }
          if (u < 0) s = 0.88 + grain[i];                      // smooth, unraked: the time
          else {
            let ph, nx, ny;
            if (u < RING) { ph = u; nx = gx; ny = gy; } else { ph = lineV[i] + 8; nx = lineGX[i]; ny = lineGY[i]; }
            const t = (ph * PH) & 63;
            s = 0.44 + K * SIN[t] * (nx * lx + ny * ly) - 0.12 * (1 - COS[t]) + grain[i];
          }
          // damp from the rake: darker for a few seconds
          let wet = 0;
          if (dampE) {
            if (sE === -2) sE = sOfPixel(pe, px, py);
            if (sE >= 0 && sE <= sRakeE) wet = 1 - (sec - (tE + (sE / pe.L) * pe.T)) / DRY;
          }
          if (dampD) {
            if (sD === -2) sD = sOfPixel(pd, px, py);
            if (sD >= 0) {
              const at = DRAW_START + (sD / pd.L) * pd.T;
              const w = at <= sec ? 1 - (sec - at) / DRY : 1 - (sec + 60 - (ERASE_END - pd.T + (sD / pd.L) * pd.T)) / DRY;
              if (w > wet) wet = w;
            }
          }
          if (wet > 0) s -= 0.2 * (wet > 1 ? 1 : wet);
        }
      }
      let ti = (s * RTONE + 0.5) | 0;
      ti = ti < 0 ? 0 : ti > RTONE ? RTONE : ti;
      const si = (sh * (SHL - 1) + 0.5) | 0;
      return lut[(mat * SHL + si) * TONES + ti];
    });

    // --- leaves
    const cols = leafColours(f.mon);
    const shadeCol = mix(pal.sh, pal.lo, 0.3);
    for (let j = 0; j < 2; j++) {
      const key = f.minuteKey;
      const tFall = 5 + rand(key, j, 11) * 28, dur = 4.2 + rand(key, j, 12) * 1.5;
      if (sec < tFall) continue;
      const lxp = 12 + rand(key, j, 13) * 136, lyp = 8 + rand(key, j, 14) * 64;
      const p = progress(sec, tFall, tFall + dur), z = 1 - p;
      let x = lxp + 7 * z * Math.sin(p * 7 + j * 2), y = lyp - 3 * z * Math.cos(p * 5);
      let rot = rand(key, j, 15) * 6 + p * 6;
      // the gust takes it off to the right
      const tg = sec - (GUST + 0.3 * j);
      if (tg > 0) { x += 9 * tg * tg + 6 * tg; y += 2 * Math.sin(tg * 3 + j) * tg; rot += tg * 5; }
      if (x > W + 8) continue;
      const size = 2.8 + 0.8 * rand(key, j, 16) + 1.4 * z;
      const c = cols[(hashOf(key, j)) % cols.length];
      // its shadow lies away from the light and closes on it as it lands
      const off = (0.6 + 14 * z) * (0.5 + L.low);
      g.fillPolygon(maple(x - lx * off, y - ly * off, size * 0.95, rot), shadeCol, { aa: true, a: 0.45 });
      g.fillPolygon(maple(x, y, size, rot), c, { aa: true });
      g.thickLine(x, y, x + Math.cos(rot + 1.57) * size * 1.2, y + Math.sin(rot + 1.57) * size * 1.2, 0.7, mix(c, 0x000000, 0.35), { aa: true });
    }

    // --- the monk and his rake
    const active = erasing ? [pe, sRakeE] : drawing ? [pd, sRakeD] : null;
    if (active) drawMonk(g, active[0], active[1], pal, lx, ly, L.low, ctx.night);
  },
};

function hashOf(a, b) { return Math.floor(rand(a, b, 17) * 1000); }

function drawMonk(g, plan, s, pal, lx, ly, low, night) {
  const R = pointAt(plan, s), Mk = pointAt(plan, s + 11);
  if (Mk.x < -10 || Mk.x > W + 10 || Mk.y > H + 10 || Mk.y < -10) { if (R.x > W + 12 || R.y < -12) return; }
  const nx = -R.ty, ny = R.tx;                       // along the rake head
  let fx = R.x - Mk.x, fy = R.y - Mk.y;                // the monk faces his rake
  const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
  const qx = -fy, qy = fx;                           // his shoulders
  const shx = -lx * (2 + 3 * low), shy = -ly * (2 + 3 * low);
  const shadow = { aa: true, a: 0.38 };
  const shc = mix(pal.sh, 0x000000, 0.2);
  const half = SH / 2 - 0.5;
  // shadows
  g.thickLine(R.x - nx * half + shx, R.y - ny * half + shy, R.x + nx * half + shx, R.y + ny * half + shy, 1.6, shc, shadow);
  g.fillCircle(Mk.x + shx * 1.6, Mk.y + shy * 1.6, 4.3, shc, shadow);
  // rake: tines, head, handle
  const wood = mix(hex('#8a5e32'), pal.lo, 0.25 + 0.4 * night), dark = mix(wood, 0x000000, 0.4);
  for (let k = -7; k <= 7; k += 2) g.pixel(R.x + nx * k - R.tx * 1.6, R.y + ny * k - R.ty * 1.6, dark);
  g.thickLine(R.x - nx * half, R.y - ny * half, R.x + nx * half, R.y + ny * half, 1.8, wood, { aa: true });
  const gx = Mk.x + fx * 4.2, gy = Mk.y + fy * 4.2;
  g.thickLine(R.x, R.y, gx, gy, 1.1, wood, { aa: true });
  // robe and sleeves
  const robe = mix(hex('#283252'), 0x000000, 0.3 * night);
  const body = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    body.push([Mk.x - fx * 1.6 + qx * 5.2 * Math.cos(a) + fx * 3.4 * Math.sin(a), Mk.y - fy * 1.6 + qy * 5.2 * Math.cos(a) + fy * 3.4 * Math.sin(a)]);
  }
  g.fillPolygon(body, robe, { aa: true });
  for (const sd of [-1, 1]) g.thickLine(Mk.x + qx * 4.2 * sd, Mk.y + qy * 4.2 * sd, gx + qx * 1 * sd, gy + qy * 1 * sd, 2, robe, { aa: true });
  g.fillCircle(gx, gy, 1, mix(hex('#d6a882'), 0x000000, 0.4 * night), { aa: true });
  // the straw hat, lit from the light's side
  const straw = mix(hex('#d4ac5c'), pal.lo, 0.2 + 0.4 * night);
  g.fillCircle(Mk.x - fx * 0.5, Mk.y - fy * 0.5, 3.3, mix(straw, 0x000000, 0.3), { aa: true });
  g.fillCircle(Mk.x - fx * 0.5 + lx * 0.6, Mk.y - fy * 0.5 + ly * 0.6, 2.6, straw, { aa: true });
  g.fillCircle(Mk.x - fx * 0.5 + lx * 1.1, Mk.y - fy * 0.5 + ly * 1.1, 1.3, mix(straw, 0xffffff, 0.35), { aa: true });
}
