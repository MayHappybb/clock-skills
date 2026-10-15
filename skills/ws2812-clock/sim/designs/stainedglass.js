// Stained glass: the cross is a cathedral window. The hours are leaded into
// the left arm in amber, the minutes into the right in ruby, with the rose
// window between them as the colon; St Frog of the Round Glasses keeps watch
// in the top arm over a Tiffany pond. Nothing in the window ever lights
// itself: the real sky does. The sun rises behind the hours, stands behind
// the saint at noon and sets behind the minutes; clouds drift across and
// make the whole window breathe, a branch outside sways its shadow over the
// glass, God rays and dust hang in the air in front. At night: moonlight and
// a candle below. The rose's light runs round once a minute.
// Minute turn: a cloud shadow rolls over the changing numeral, its panes go
// dark one by one, the came is re-leaded in the dark, and the new numeral's
// panes catch the light one after another along the stroke, each with a
// glint, as the shadow leaves.
// Hour: the bells. Four strikes ring out from the rose as waves of light
// across every pane, the rose turns a full revolution, the saint's halo
// flares, and the hour numerals flash with each strike.
import * as kit from '../js/kit.js';
import { buildWindow, PAL, N, CX, CY, ROSE_R } from './stainedglass-art.js';
import { buildTile, TW, TH } from './stainedglass-glyphs.js';

const SLOTS = [[5, 70], [32, 70], [130, 70], [157, 70]];      // tile origins: HH | MM
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());

let W = null;                    // the static window
let PIX, LED, LI, LWX, LWY;      // cross pixels, their LED, light node + weights
let ROSEPIX;                     // pixels with rose coverage
const tiles = [];
const tile = (d) => tiles[d] || (tiles[d] = buildTile(d));

const NG = 49, STEP = 4;         // light field nodes
const LR = new Float32Array(NG * NG), LG = new Float32Array(NG * NG), LB = new Float32Array(NG * NG);
const img = new Float32Array(3 * N * N), lit = new Float32Array(3 * N * N);
const RAYS = new Float32Array(512);

function init(ctx) {
  W = buildWindow();
  const G = kit.grid(ctx);
  const pix = [], led = [];
  for (let p = 0; p < N * N; p++) if (G.idx[p] >= 0) { pix.push(p); led.push(G.idx[p]); }
  PIX = Int32Array.from(pix); LED = Int32Array.from(led);
  LI = new Int32Array(PIX.length); LWX = new Float32Array(PIX.length); LWY = new Float32Array(PIX.length);
  const rose = [];
  for (let k = 0; k < PIX.length; k++) {
    const p = PIX[k], x = p % N, y = (p / N) | 0;
    const fx = (x + 0.5) / STEP, fy = (y + 0.5) / STEP, ix = Math.min(NG - 2, fx | 0), iy = Math.min(NG - 2, fy | 0);
    LI[k] = iy * NG + ix; LWX[k] = fx - ix; LWY[k] = fy - iy;
    if (W.roseCov[p] > 0) rose.push(p);
  }
  ROSEPIX = Int32Array.from(rose);
}

// the branch outside, bottom left: segments [x0, y0, x1, y1, width] and leaves [x, y, r]
const BOUGH = [[-20, 215, 30, 160, 7], [30, 160, 72, 138, 4.5], [30, 160, 44, 196, 3.5], [52, 148, 58, 118, 3], [10, 182, -4, 150, 3.5]];
const LEAVES = [[72, 138, 9], [60, 124, 8], [58, 112, 7], [80, 146, 7], [44, 198, 8], [36, 186, 6], [-4, 148, 8], [4, 140, 6], [66, 152, 6]];

/** Sky behind the glass at this moment: fills LR/LG/LB. */
function lightField(ctx, now, hour) {
  const h = hour;
  const sunA = Math.PI * (h - 6) / 12, alt = Math.sin(sunA);
  const sx = CX - 150 * Math.cos(sunA), sy = 205 - 195 * alt;
  const day = kit.smoothstep(-0.12, 0.25, alt), night = 1 - day;
  const warmth = 1 - kit.smoothstep(0.05, 0.5, alt);
  const sky = kit.mix([0.92, 0.95, 1.0], [1.0, 0.62, 0.36], warmth), skyB = 0.3 + 0.6 * day;
  const sunC = kit.mix([1.0, 0.94, 0.82], [1.0, 0.5, 0.18], warmth), sunB = 1.25 * day;
  // the moon on the opposite arc
  const mA = Math.PI * (h - 18 + (h < 6 ? 24 : 0)) / 12, malt = Math.sin(mA);
  const mx = CX - 150 * Math.cos(mA), my = 205 - 195 * malt;
  const moonB = night * (0.2 + 0.22 * kit.smoothstep(-0.1, 0.2, malt));
  const candle = 0.55 * night * (0.85 + 0.1 * Math.sin(now * 13.1) + 0.08 * Math.sin(now * 29.3 + 1) + 0.06 * kit.noise2(now * 7, 3));
  // the branch sways
  const sway = 0.035 * Math.sin(now * 0.63) + 0.018 * Math.sin(now * 1.71 + 1.3);
  const cs = Math.cos(sway), sn = Math.sin(sway), bx0 = -20, by0 = 215;
  const rot = (x, y) => [bx0 + (x - bx0) * cs - (y - by0) * sn, by0 + (x - bx0) * sn + (y - by0) * cs];
  const segs = BOUGH.map(([a, b, c, d, w]) => [...rot(a, b), ...rot(c, d), w]);
  const leaves = LEAVES.map(([x, y, r], k) => { const [px, py] = rot(x, y); return [px + 1.5 * Math.sin(now * 2.1 + k), py + 1.2 * Math.cos(now * 1.7 + k * 2), r]; });
  for (let j = 0; j < NG; j++) {
    for (let i = 0; i < NG; i++) {
      const x = i * STEP, y = j * STEP, n = j * NG + i;
      const cl = kit.fbm(x * 0.011 + now * 0.017, y * 0.011 - now * 0.004, now * 0.012, 3);
      const cm = 0.58 + 0.6 * kit.smoothstep(0.3, 0.72, cl);
      const dx = x - sx, dy = y - sy, g = Math.exp(-(dx * dx + dy * dy) / (2 * 52 * 52));
      // branch shadow (soft: the tree is a few metres behind the glass)
      let sh = 1;
      if (day > 0) {
        let dmin = 1e9;
        for (const s of segs) { const d = kit.segDist(x, y, s[0], s[1], s[2], s[3]) - s[4]; if (d < dmin) dmin = d; }
        for (const l of leaves) { const d = Math.hypot(x - l[0], y - l[1]) - l[2]; if (d < dmin) dmin = d; }
        sh = 1 - 0.5 * (1 - kit.smoothstep(-3, 9, dmin));
      }
      const sun = sunB * g * (0.35 + 0.65 * cm) * sh, sk = skyB * cm * (0.75 + 0.25 * sh);
      const dm = (x - mx) ** 2 + (y - my) ** 2, moon = moonB * (0.55 + 0.45 * Math.exp(-dm / (2 * 80 * 80))) * (0.8 + 0.2 * cm);
      const cd = (x - CX) ** 2 + (y - 205) ** 2, cand = candle * Math.exp(-cd / (2 * 100 * 100));
      LR[n] = sky[0] * sk + sunC[0] * sun + 0.62 * moon + 1.0 * cand;
      LG[n] = sky[1] * sk + sunC[1] * sun + 0.72 * moon + 0.58 * cand;
      LB[n] = sky[2] * sk + sunC[2] * sun + 1.0 * moon + 0.24 * cand;
    }
  }
  return { sx, sy, day, night };
}

/** Bells at the hour: four strikes. Returns the swell for a point at radius r from the rose. */
function bellWave(T, r) {
  let s = 0;
  for (let k = 0; k < 4; k++) {
    const tk = 2.9 + 1.2 * k, dt = T - tk;
    if (dt < 0 || dt > 2.4) continue;
    const front = 24 + 70 * dt, w = (r - front) / 20;
    s += Math.exp(-w * w) * Math.exp(-dt / 1.0) * 2.6;
  }
  return s;
}
function bellStrike(T) {
  let s = 0;
  for (let k = 0; k < 4; k++) { const dt = T - (2.9 + 1.2 * k); if (dt >= 0 && dt < 2) s += Math.exp(-dt / 0.35); }
  return s;
}

// rose window palettes
const ROSE_RING = [PAL.ruby[0], PAL.ruby[2]], ROUND = [PAL.emerald, PAL.amber[1]], OUTER = [PAL.ruby[1], PAL.gold];

function drawRose(now, sec, phi, bell) {
  const sa = (sec / 60) * kit.TAU - Math.PI / 2;
  const tex = W.tex, rc = W.roseCov;
  for (let k = 0; k < ROSEPIX.length; k++) {
    const p = ROSEPIX[k], x = (p % N) + 0.5 - CX, y = ((p / N) | 0) + 0.5 - CY;
    const r = Math.hypot(x, y), th0 = Math.atan2(y, x), th = th0 - phi;
    let c, dl;
    if (r < 4.6) { c = PAL.gold; dl = Math.abs(r - 5); }
    else if (r < 13) {
      const s6 = (th / kit.TAU) * 6, k6 = Math.floor(s6), f = s6 - k6;
      c = ROSE_RING[((k6 % 2) + 2) % 2];
      dl = Math.min(Math.abs(r - 5), Math.abs(r - 13), r * Math.sin(Math.min(f, 1 - f) * kit.TAU / 6));
    } else if (r < 24.5) {
      const s12 = (th / kit.TAU) * 12, k12 = Math.round(s12), f = s12 - k12;
      const ax = th - (k12 / 12) * kit.TAU, rx = r * Math.cos(ax) - 18.75, ry = r * Math.sin(ax), rd = Math.hypot(rx, ry);
      if (rd < 4.7) { c = ROUND[((k12 % 2) + 2) % 2]; dl = Math.abs(rd - 4.7); }
      else { c = PAL.cobalt[((k12 % 3) + 3) % 3]; dl = Math.min(Math.abs(rd - 4.7), r * Math.abs(Math.sin((Math.abs(f) - 0.5) * kit.TAU / 12))); }
      dl = Math.min(dl, Math.abs(r - 13), Math.abs(r - 24.5));
    } else {
      const s12 = (th / kit.TAU) * 12 + 0.5, k12 = Math.floor(s12), f = s12 - k12;
      c = OUTER[((k12 % 2) + 2) % 2];
      dl = Math.min(Math.abs(r - 24.5), Math.abs(r - 29.4) - 0.5, r * Math.sin(Math.min(f, 1 - f) * kit.TAU / 12));
    }
    const glass = kit.smoothstep(0.35, 1.1, dl) * rc[p];
    if (glass <= 0) continue;
    // the minute's light runs round the rose (fixed to the sky, not to the glass)
    let da = th0 - sa; da -= kit.TAU * Math.round(da / kit.TAU);
    const trail = da < 0 ? Math.exp(da / 1.1) : 0;
    const gain = 0.6 + 2.2 * Math.exp(-(da * da) / (2 * 0.18 * 0.18)) + 0.7 * trail + bell * (1.2 - r / 40);
    const t = tex[p] * glass * gain;
    img[3 * p] += c[0] * lit[3 * p] * t; img[3 * p + 1] += c[1] * lit[3 * p + 1] * t; img[3 * p + 2] += c[2] * lit[3 * p + 2] * t;
  }
}

/** One numeral slot: old/new tiles, pane gains, cloud shadow. */
const gainOld = new Float32Array(64), gainNew = new Float32Array(64), flash = new Float32Array(64);
function drawSlot(slot, dOld, dNew, T, hourShow) {
  const [ox, oy] = SLOTS[slot], pal = slot < 2 ? PAL.amber : PAL.ruby;
  const changing = dOld !== dNew && T < 3.2;
  const tex = W.tex;
  // the cloud shadow over this slot
  let shadowOn = false;
  if (changing) {
    shadowOn = true;
    const M = 12, x0 = ox - M, y0 = oy - M, w = TW + 2 * M, h = TH + 2 * M;
    for (let j = 0; j < h; j++) {
      const y = y0 + j; if (y < 0 || y >= N) continue;
      const ej = Math.min(j, h - 1 - j);
      for (let i = 0; i < w; i++) {
        const x = x0 + i, p = y * N + x; if (x < 0 || x >= N) continue;
        const ux = i / w, nz = kit.noise2(x * 0.13 + slot * 7, y * 0.13 + T * 0.6);
        const edge = kit.smoothstep(2, M, Math.min(i, w - 1 - i, ej) + 8 * (nz - 0.5));
        const tt = T - 0.45 * ux - 0.3 * nz;
        const D = 0.93 * kit.smoothstep(0, 0.55, tt) * (1 - kit.smoothstep(1.55, 2.6, tt)) * edge;
        const m = 1 - D;
        img[3 * p] *= m; img[3 * p + 1] *= m; img[3 * p + 2] *= m;
      }
    }
  }
  const useNew = !changing || T >= 1.2;
  const tl = tile(useNew ? dNew : dOld);
  const g = useNew ? gainNew : gainOld;
  for (let c = 1; c < tl.ncell; c++) {
    flash[c] = 0;
    if (!changing) { g[c] = 1; continue; }
    if (!useNew) {
      const toff = 0.12 + 0.62 * (tl.cx[c] / TW) + 0.14 * kit.hash(c, slot, dOld);
      g[c] = 1 - kit.smoothstep(toff, toff + 0.25, T);
    } else {
      const ton = 1.25 + 0.95 * (c - 1) / Math.max(1, tl.ncell - 2);
      g[c] = kit.smoothstep(ton, ton + 0.3, T);
      const f = (T - ton - 0.18) / 0.13;
      flash[c] = 0.9 * Math.exp(-f * f);
    }
  }
  // hour: the hour numerals answer each bell strike, pane by pane
  if (hourShow && slot < 2) {
    for (let c = 1; c < tl.ncell; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) { const dt = hourShow - (3.05 + 1.2 * k) - 0.035 * c; if (dt > 0 && dt < 1.5) s += Math.exp(-dt / 0.3); }
      flash[c] += 0.7 * s;
    }
  }
  const dimNew = shadowOn ? 0.55 + 0.45 * kit.smoothstep(1.4, 2.6, T) : 1;
  const ta = tl.a, tL = tl.L, tc = tl.cell;
  for (let ty = 0; ty < TH; ty++) {
    for (let tx = 0; tx < TW; tx++) {
      const q = ty * TW + tx, a = ta[q], L = tL[q];
      if (a + L <= 0) continue;
      const p = (oy + ty) * N + ox + tx, c = tc[q], keep = Math.max(0, 1 - a - L);
      let r = img[3 * p] * keep, gg = img[3 * p + 1] * keep, b = img[3 * p + 2] * keep;
      if (c > 0 && a > 0) {
        const col = pal[c % 3], dens = 0.86 + 0.24 * kit.hash(c, slot + 10 * (useNew ? dNew : dOld)), k = a * g[c] * tex[p] * dens * dimNew;
        r += col[0] * lit[3 * p] * k; gg += col[1] * lit[3 * p + 1] * k; b += col[2] * lit[3 * p + 2] * k;
        const fl = flash[c] * a;
        if (fl > 0) { r += 0.55 * fl; gg += 0.42 * fl; b += 0.22 * fl; }
      }
      img[3 * p] = r; img[3 * p + 1] = gg; img[3 * p + 2] = b;
    }
  }
}

// dust motes in the air in front of the window
const MOTES = 46;

export default {
  name: 'Stained Glass',
  blurb: 'a cross-shaped cathedral window lit by the real sky; hours and minutes leaded in amber and ruby, re-leaded under a passing cloud; bells at the hour',
  layouts: ['hub-cross'], look: 'smoke', fps: 60, brightness: 0.45, dither: true,
  frame(ctx) {
    if (!W) init(ctx);
    const date = ctx.date, now = date.getTime() / 1000;
    const sec = kit.secOf(date), hour = date.getHours() + date.getMinutes() / 60 + sec / 3600;
    const cur = digitsOf(date), prev = digitsOf(new Date(date.getTime() - 60000));
    const T = sec;                                  // seconds into the minute
    const hourShow = date.getMinutes() === 0 && T < 9 ? T : 0;
    const sky = lightField(ctx, now, hour);

    // bells: waves of light from the rose, and the rose turns once
    const bell = hourShow ? bellStrike(T) : 0;
    const phi = hourShow ? kit.TAU * kit.ease.inOut(kit.clamp((T - 2.7) / 5.2)) : 0;

    // backlight each pane
    const col = W.col, key = W.key;
    for (let k = 0; k < PIX.length; k++) {
      const p = PIX[k], n = LI[k], wx = LWX[k], wy = LWY[k];
      const w00 = (1 - wx) * (1 - wy), w10 = wx * (1 - wy), w01 = (1 - wx) * wy, w11 = wx * wy;
      let lr = LR[n] * w00 + LR[n + 1] * w10 + LR[n + NG] * w01 + LR[n + NG + 1] * w11;
      let lg = LG[n] * w00 + LG[n + 1] * w10 + LG[n + NG] * w01 + LG[n + NG + 1] * w11;
      let lb = LB[n] * w00 + LB[n + 1] * w10 + LB[n + NG] * w01 + LB[n + NG + 1] * w11;
      if (hourShow) {
        const x = (p % N) - CX, y = ((p / N) | 0) - CY;
        const s = bellWave(T, Math.sqrt(x * x + y * y)) + 0.7 * bell;
        const hk = key[p];
        const halo = hk >= 320 && hk < 342 ? 1.4 * bell : 0;
        lr += s + halo; lg += 0.85 * s + 0.8 * halo; lb += 0.6 * s + 0.4 * halo;
      }
      lit[3 * p] = lr; lit[3 * p + 1] = lg; lit[3 * p + 2] = lb;
      img[3 * p] = col[3 * p] * lr; img[3 * p + 1] = col[3 * p + 1] * lg; img[3 * p + 2] = col[3 * p + 2] * lb;
    }
    drawRose(now, sec, phi, bell);
    for (let s = 0; s < 4; s++) drawSlot(s, +prev[s], +cur[s], T, hourShow);

    // God rays: parallel shafts from the sun's side, in the air in front
    const out = ctx.out, dim = 1 - 0.45 * ctx.night;
    const rayK = 0.07 * sky.day;
    let nx = CX - sky.sx, ny = CY - sky.sy;
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    if (rayK > 0) for (let k = 0; k < 512; k++) { const v = kit.noise2(k * 0.075, now * 0.05); RAYS[k] = v * v * v * v * 2.2; }
    for (let k = 0; k < PIX.length; k++) {
      const p = PIX[k], i = LED[k];
      let r = img[3 * p], g = img[3 * p + 1], b = img[3 * p + 2];
      if (rayK > 0) {
        const x = (p % N) - sky.sx, y = ((p / N) | 0) - sky.sy;
        const u = -x * ny + y * nx, along = x * nx + y * ny;
        const ri = (u * 0.5 + 256) | 0;
        if (ri >= 0 && ri < 512) {
          const a = RAYS[ri] * rayK * kit.smoothstep(-40, 80, along);
          r += a; g += 0.9 * a; b += 0.7 * a;
        }
      }
      out[3 * i] = r * dim; out[3 * i + 1] = g * dim; out[3 * i + 2] = b * dim;
    }
    // dust: drifting, catching the rays
    const G = kit.grid(ctx);
    for (let m = 0; m < MOTES; m++) {
      const sp = 0.6 + kit.hash(m, 1) * 1.2;
      const x = kit.fract(kit.hash(m, 2) + now * 0.0021 * (kit.hash(m, 3) - 0.5)) * N + 5 * Math.sin(now * 0.21 * sp + m);
      const y = kit.fract(kit.hash(m, 4) + now * 0.0035 * sp) * N + 3 * Math.sin(now * 0.33 * sp + 2 * m);
      let a;
      if (rayK > 0) {
        const dx = x - sky.sx, dy = y - sky.sy, u = -dx * ny + dy * nx, ri = (u * 0.5 + 256) | 0;
        a = (0.05 + 0.6 * (ri >= 0 && ri < 512 ? RAYS[ri] : 0)) * sky.day;
      } else a = 0.05 * sky.night * kit.smoothstep(100, 190, y);
      a *= 0.6 + 0.4 * Math.sin(now * 1.3 * sp + m * 3);
      if (a <= 0.003) continue;
      const ix = Math.floor(x - 0.5), iy = Math.floor(y - 0.5), fx = x - 0.5 - ix, fy = y - 0.5 - iy;
      for (let oy = 0; oy < 2; oy++) for (let oxx = 0; oxx < 2; oxx++) {
        const gx = ix + oxx, gy = iy + oy;
        if (gx < 0 || gy < 0 || gx >= N || gy >= N) continue;
        const i = G.idx[gy * N + gx]; if (i < 0) continue;
        const w = (oxx ? fx : 1 - fx) * (oy ? fy : 1 - fy) * a * dim;
        out[3 * i] += w; out[3 * i + 1] += 0.88 * w; out[3 * i + 2] += 0.66 * w;
      }
    }
  },
};
