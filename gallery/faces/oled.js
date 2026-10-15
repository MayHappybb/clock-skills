// A monochrome OLED face, run by the OLED skill's controller emulator.
//
// Each frame continues from the controller the last one left, as firmware
// does; the panel is scanned out and painted only when a frame lands, or on
// every tick when tearing is shown.
//
// Two painters. 'exact' is the skill's own drawPanel, used in the focus view.
// It fills a rounded path per pixel, 8,192 of them a frame, which is fine for
// one panel, but a hall of them saturates the GPU (measured: the page fell to
// under 20 fps). 'fast' (the hall) builds the same picture on the CPU and
// sends it as one image: the board, glass and unlit pixels drawn once by
// drawPanel, then the bloom and the lit pixels with the colours, gamma,
// bloom strength and blur radius drawPanel uses.

import { buildFrame, scanout, DESIGNS, moduleOf, fpsOf } from '../lazy/oled.js';
import { drawPanel, canvasSize, pixelCentre, rowColour } from '../../skills/oled-clock/sim/js/panel.js';
import { loadDesign } from './load.js';

const DESIGN_DIR = new URL('../../skills/oled-clock/sim/designs/', import.meta.url);

export async function make(key, file, opts, canvas) {
  const design = await loadDesign(DESIGNS, DESIGN_DIR, key, file);
  const fps = fpsOf(design);
  const mod = moduleOf(design);
  const ctx = canvas.getContext('2d');
  let o = { scale: 10, crop: 'body', style: 'photo', colour: undefined, night: 'auto', tear: false, painter: 'exact' };
  let gen = null, lastK = null, prev = null, built = null, dirty = true, fast = null;

  const colour = () => o.colour ?? design.colour ?? mod.colours[0];

  function configure(next) {
    if (next.night !== undefined && next.night !== o.night) prev = null;
    o = { ...o, ...next };
    const { width, height } = canvasSize(mod, { scale: o.scale, crop: o.crop, colour: colour() });
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    fast = o.painter === 'fast' ? fastPainter(mod, { colour: colour(), scale: o.scale, style: o.style, crop: o.crop }) : null;
    dirty = true;
  }

  configure(opts);
  return {
    configure,
    tick(c) {
      if (c.gen !== gen) { gen = c.gen; lastK = null; prev = null; }
      const k = Math.floor(c.t * fps + 1e-6);
      const fresh = k !== lastK;
      if (fresh) {
        const tk = k / fps;
        built = buildFrame(key, { t: tk, date: new Date(c.epoch + tk * 1000), fps, night: o.night, prev });
        prev = built.oled;
        lastK = k;
      }
      if (fresh || dirty || o.tear) {
        const levels = scanout(built.oled, built.module, { tear: o.tear, t: c.t, frameStart: k / fps });
        if (fast) fast(ctx, levels);
        else drawPanel(ctx, built.module, levels, { colour: colour(), scale: o.scale, style: o.style, crop: o.crop });
        dirty = false;
      }
      return fresh;
    },
  };
}

/** The 'fast' painter for one module, colour, scale, style and crop: returns paint(ctx, levels). */
function fastPainter(mod0, { colour, scale, style, crop }) {
  const mod = colour === 'yellow-blue' ? mod0 : { ...mod0, zones: null };   // as drawPanel does
  const { width, height, box } = canvasSize(mod, { scale, crop, colour });
  const W = mod.cols, H = mod.rows, photo = style === 'photo';
  const mm = (v) => v * scale;
  const ox = mm(box.x), oy = mm(box.y);

  // Everything that does not change: board, glass, unlit emitters and sheen,
  // read back once. Each frame starts from a copy of it.
  const baseCanvas = new OffscreenCanvas(width, height);
  const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
  drawPanel(baseCtx, mod, new Float32Array(W * H), { colour, scale, style, crop });
  const base = baseCtx.getImageData(0, 0, width, height).data;
  const frame = new ImageData(width, height), F = frame.data;

  // Each pixel's emitter, in whole canvas pixels.
  const pw = mod.pixel.w, ph = mod.pixel.h;
  const xs = Array.from({ length: W }, (_, x) => { const c = pixelCentre(mod, x, 0)[0]; return [Math.round(mm(c - pw / 2) - ox), Math.round(mm(c + pw / 2) - ox)]; });
  const ys = Array.from({ length: H }, (_, y) => { const c = pixelCentre(mod, 0, y)[1]; return [Math.round(mm(c - ph / 2) - oy), Math.round(mm(c + ph / 2) - oy)]; });
  const rgbOf = Array.from({ length: H }, (_, y) => rowColour(mod, colour, y));

  // The bloom. drawPanel draws a 1.4x emitter square at 0.45 x level (the
  // squares overlap and stack as alpha, not light), blurs that by 0.9 pixel
  // pitches (a Gaussian sigma) and adds it. Here each pixel's square becomes
  // one grid cell, its alpha stacked over the square's larger area, blurred
  // there, and spread back with bilinear weights.
  const PAD = 3;                                      // cells of bloom round the edge
  const GW = W + 2 * PAD, GH = H + 2 * PAD;
  const A = new Float32Array(GW * GH), T = new Float32Array(GW * GH);
  const cover = ((1.4 * pw) * (1.4 * ph)) / (mod.pitch.x * mod.pitch.y);
  const kernel = (() => {                             // sigma in cells: 0.9 pitches, less the spread of bilinear
    const sigma = Math.sqrt(Math.max(0.1, 0.9 * 0.9 - 1 / 6));
    const k = [-2, -1, 0, 1, 2].map((i) => Math.exp(-(i * i) / (2 * sigma * sigma)));
    const sum = k.reduce((a, b) => a + b);
    return k.map((v) => v / sum);
  })();
  // Glow colour per grid row (rows past the edge take the nearest row's).
  const glowRow = Array.from({ length: GH }, (_, gy) => rowColour(mod, colour, Math.min(H - 1, Math.max(0, gy - PAD))).glow);
  // Canvas pixel -> grid position, along each axis (cell centres at pixel centres).
  const cellX = (px) => (px + 0.5 + ox) / scale, cellY = (py) => (py + 0.5 + oy) / scale;
  const x0mm = pixelCentre(mod, 0, 0)[0];
  const gx0 = Math.max(0, Math.floor(mm(x0mm - PAD * mod.pitch.x) - ox)), gx1 = Math.min(width, Math.ceil(mm(x0mm + (W - 1 + PAD) * mod.pitch.x) - ox));
  const rowsY = Array.from({ length: H }, (_, y) => pixelCentre(mod, 0, y)[1]);
  const gy0 = Math.max(0, Math.floor(mm(rowsY[0] - PAD * mod.pitch.y) - oy)), gy1 = Math.min(height, Math.ceil(mm(rowsY[H - 1] + PAD * mod.pitch.y) - oy));
  // Grid coordinate of each canvas column/row (rows honour the dual-colour gap).
  const colG = new Float32Array(width), rowG = new Float32Array(height);
  for (let px = gx0; px < gx1; px++) colG[px] = (cellX(px) - x0mm) / mod.pitch.x + PAD;
  for (let py = gy0; py < gy1; py++) {
    const y = cellY(py);
    let r = 0;
    while (r < H - 1 && rowsY[r + 1] <= y) r++;
    const span = r < H - 1 ? rowsY[r + 1] - rowsY[r] : mod.pitch.y;
    rowG[py] = y < rowsY[0] ? (y - rowsY[0]) / mod.pitch.y + PAD : r + (y - rowsY[r]) / span + PAD;
  }

  return function paint(ctx, levels) {
    F.set(base);
    if (photo) {
      A.fill(0);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) A[(y + PAD) * GW + x + PAD] = 1 - Math.pow(1 - 0.45 * Math.min(1, levels[y * W + x]), cover);
      // separable blur: A -> T along x, T -> A along y
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        let v = 0;
        for (let i = -2; i <= 2; i++) { const xx = x + i; if (xx >= 0 && xx < GW) v += A[y * GW + xx] * kernel[i + 2]; }
        T[y * GW + x] = v;
      }
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        let v = 0;
        for (let i = -2; i <= 2; i++) { const yy = y + i; if (yy >= 0 && yy < GH) v += T[yy * GW + x] * kernel[i + 2]; }
        A[y * GW + x] = v;
      }
      for (let py = gy0; py < gy1; py++) {
        const gy = Math.min(GH - 1.001, Math.max(0, rowG[py])), j = gy | 0, fy = gy - j;
        const g = glowRow[j];
        for (let px = gx0; px < gx1; px++) {
          const gx = Math.min(GW - 1.001, Math.max(0, colG[px])), i = gx | 0, fx = gx - i, o = j * GW + i;
          const a = (A[o] * (1 - fx) + A[o + 1] * fx) * (1 - fy) + (A[o + GW] * (1 - fx) + A[o + GW + 1] * fx) * fy;
          if (a < 0.002) continue;
          const d = (py * width + px) * 4;
          F[d] += g[0] * a; F[d + 1] += g[1] * a; F[d + 2] += g[2] * a;   // clamped by the array
        }
      }
    }
    // the lit emitters, opaque on top, in drawPanel's colours and gamma
    for (let y = 0; y < H; y++) {
      const { rgb } = rgbOf[y];
      const [y0, y1] = ys[y];
      for (let x = 0; x < W; x++) {
        const v = levels[y * W + x];
        if (v < 0.02) continue;
        const a = Math.pow(Math.min(1, v), 1 / 2.2);
        const r = Math.round(rgb[0] * a), gg = Math.round(rgb[1] * a), b = Math.round(rgb[2] * a);
        const [x0, x1] = xs[x];
        for (let py = y0; py < y1; py++) {
          let d = (py * width + x0) * 4;
          for (let px = x0; px < x1; px++, d += 4) { F[d] = r; F[d + 1] = gg; F[d + 2] = b; }
        }
      }
    }
    ctx.putImageData(frame, 0, 0);
  };
}
