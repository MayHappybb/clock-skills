// Draws the glass, at its true geometry, as RGBA bytes: shared by the PNG
// renderer (Node) and the live view (browser).
//
// The light model, per glass pixel and channel, in linear light:
//
//   E = backlight x uniformity(x, y) x (black + (1 - black) x T)
//
// T is the liquid crystal's transmittance for the pixel's value (player.js,
// through the gamma curve). black = 1 / contrast ratio: an LCD cannot block
// all of its backlight, so "black" is a dark grey that rises toward the
// corners (IPS glow, as `glow`). E = 1 is full white at full backlight,
// which the camera maps to white; out-of-range light clips.
//
// 'photo' also draws each pixel's structure: three colour-filter stripes
// with a black matrix around them. On this panel the stripes run along the
// controller's source lines, which in landscape are the glass's rows, so a
// pixel is red, green and blue stacked vertically (references/hardware.md).
// At true size the structure averages out; zoomed in it shows as a fine
// horizontal texture. 'clean' draws each pixel as a flat square of exactly
// the colour the panel transmits: use it to judge pixel art.

const STRIPE_MIX = 0.25;   // how strongly the stripes separate colour in 'photo' (a camera blurs them)

/** sRGB encode, 0..1 linear -> 0..255. */
const ENC = new Uint8Array(4097);
for (let i = 0; i <= 4096; i++) {
  const v = i / 4096;
  ENC[i] = Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
}
const enc = (v) => ENC[v <= 0 ? 0 : v >= 1 ? 4096 : (v * 4096) | 0];

/**
 * Output size and layout for a module at `scale` screen pixels per mm.
 * crop: 'view' (the active area) | 'glass' (the whole glass) | 'body' (the board).
 */
export function layout(mod, { scale, crop = 'view' }) {
  const ppx = mod.pitch * scale;                 // screen pixels per glass pixel
  const P = ppx >= 3 ? Math.round(ppx) : ppx;    // whole pixels when the structure is drawn
  const s = P / mod.pitch;                       // the scale actually used
  const aw = mod.cols * P, ah = mod.rows * P;
  let ox = 0, oy = 0, width = Math.round(aw), height = Math.round(ah);
  if (crop === 'glass' || crop === 'body') {
    const g = mod.glass, b = mod.pcb;
    const gx = (crop === 'body' ? b.glassX : 0), gy = (crop === 'body' ? b.glassY : 0);
    ox = Math.round((gx + g.activeX) * s); oy = Math.round((gy + g.activeY) * s);
    width = Math.round((crop === 'body' ? b.w : g.w) * s); height = Math.round((crop === 'body' ? b.h : g.h) * s);
  }
  return { P, s, ox, oy, width, height, aw: Math.round(aw), ah: Math.round(ah), crop };
}

/** Light per glass pixel and channel (linear), from transmittance. */
export function emission(mod, levels, { backlight = 1, room = 'dark' } = {}) {
  const W = mod.cols, H = mod.rows, p = mod.panel;
  const black = 1 / p.contrast;
  const out = new Float32Array(W * H * 3);
  const ambient = room === 'lit' ? p.reflect : 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // Edge-lit backlight: a little brighter near the LED edge; dark level higher at the corners.
      const u = (x + 0.5) / W - 0.5, v = (y + 0.5) / H - 0.5;
      const uni = 1 - p.falloff * (0.5 - (p.ledEdge === 'left' ? -u : p.ledEdge === 'right' ? u : p.ledEdge === 'top' ? -v : v));
      const corner = (4 * u * u) * (4 * v * v);
      const bl = black * (1 + p.glow * corner);
      for (let c = 0; c < 3; c++) {
        const i = (y * W + x) * 3 + c;
        out[i] = backlight * uni * (bl + (1 - bl) * levels[i]) + ambient;
      }
    }
  return out;
}

/** The stripe weights of one glass pixel drawn P x P: per screen pixel, the gain for R, G, B. */
const TILES = new Map();
function tile(mod, P) {
  const key = `${mod.key}/${P}`;
  if (TILES.has(key)) return TILES.get(key);
  const p = mod.panel, n = 4;                  // 4 x 4 samples per screen pixel
  const w = new Float32Array(P * P * 3);
  let total = 0;
  for (let sy = 0; sy < P; sy++)
    for (let sx = 0; sx < P; sx++)
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const u = (sx + (i + 0.5) / n) / P, v = (sy + (j + 0.5) / n) / P;   // 0..1 across the pixel
          if (u < p.gapX || u > 1 - p.gapX) continue;
          const k = Math.min(2, Math.floor(v * 3)), f = v * 3 - k;
          if (f < p.gapY * 3 || f > 1 - p.gapY * 3) continue;
          const ch = p.stripes[k];               // which filter colour this stripe is: 0 R, 1 G, 2 B
          for (let c = 0; c < 3; c++) w[(sy * P + sx) * 3 + c] += ((1 - STRIPE_MIX) + (c === ch ? 3 * STRIPE_MIX : 0)) / (n * n);
          total += 1 / (n * n);
        }
  // Normalise so a flat area averages to its pixel's light.
  const gain = (P * P) / total;
  for (let i = 0; i < w.length; i++) w[i] *= gain;
  TILES.set(key, w);
  return w;
}

/**
 * Paint the glass into RGBA bytes.
 * @param {object} mod     module
 * @param {Float32Array} levels  transmittance per channel (player.js)
 * @param {object} o       { scale (px/mm), style: 'photo'|'clean', crop, backlight, room }
 * @returns {{ width, height, rgba: Uint8ClampedArray }}
 */
export function paintGlass(mod, levels, o = {}) {
  const L = layout(mod, o);
  const { P, width, height, ox, oy } = L;
  const rgba = o.into && o.into.length === width * height * 4 ? o.into : new Uint8ClampedArray(width * height * 4);
  if (L.crop !== 'view') drawSurround(mod, rgba, L, o);
  const W = mod.cols, H = mod.rows;
  const clean = o.style === 'clean';
  const E = clean ? levels : emission(mod, levels, o);

  if (P >= 3) {
    const Pi = P | 0, tl = clean ? null : tile(mod, Pi);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const e = (y * W + x) * 3, r = E[e], g = E[e + 1], b = E[e + 2];
        const gridGap = clean && Pi >= 8;      // a hairline between pixels so they can be counted
        for (let sy = 0; sy < Pi; sy++) {
          let d = ((oy + y * Pi + sy) * width + ox + x * Pi) * 4;
          for (let sx = 0; sx < Pi; sx++, d += 4) {
            if (clean) {
              const k = gridGap && (sx === Pi - 1 || sy === Pi - 1) ? 0.55 : 1;
              rgba[d] = enc(r * k); rgba[d + 1] = enc(g * k); rgba[d + 2] = enc(b * k);
            } else {
              const t = (sy * Pi + sx) * 3;
              rgba[d] = enc(r * tl[t]); rgba[d + 1] = enc(g * tl[t + 1]); rgba[d + 2] = enc(b * tl[t + 2]);
            }
            rgba[d + 3] = 255;
          }
        }
      }
  } else {
    // Below 3 screen pixels a glass pixel the structure is invisible: box-filter the light.
    const aw = L.aw, ah = L.ah;
    for (let j = 0; j < ah; j++)
      for (let i = 0; i < aw; i++) {
        const x0 = (i / aw) * W, x1 = ((i + 1) / aw) * W, y0 = (j / ah) * H, y1 = ((j + 1) / ah) * H;
        let r = 0, g = 0, b = 0, area = 0;
        for (let y = Math.floor(y0); y < Math.min(H, Math.ceil(y1)); y++)
          for (let x = Math.floor(x0); x < Math.min(W, Math.ceil(x1)); x++) {
            const a = (Math.min(x + 1, x1) - Math.max(x, x0)) * (Math.min(y + 1, y1) - Math.max(y, y0));
            const e = (y * W + x) * 3;
            r += E[e] * a; g += E[e + 1] * a; b += E[e + 2] * a; area += a;
          }
        const d = ((oy + j) * width + ox + i) * 4;
        rgba[d] = enc(r / area); rgba[d + 1] = enc(g / area); rgba[d + 2] = enc(b / area); rgba[d + 3] = 255;
      }
  }
  return { width, height, rgba };
}

/** The glass around the active area, and for 'body' the board under it. */
function drawSurround(mod, rgba, L, o) {
  const { s, width, height } = L;
  const fill = (x, y, w, h, [r, g, b]) => {
    const x0 = Math.max(0, Math.round(x * s)), y0 = Math.max(0, Math.round(y * s));
    const x1 = Math.min(width, Math.round((x + w) * s)), y1 = Math.min(height, Math.round((y + h) * s));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const d = (yy * width + xx) * 4;
      rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b; rgba[d + 3] = 255;
    }
  };
  const disc = (cx, cy, rad, [r, g, b]) => {
    for (let yy = Math.floor((cy - rad) * s); yy <= Math.ceil((cy + rad) * s); yy++)
      for (let xx = Math.floor((cx - rad) * s); xx <= Math.ceil((cx + rad) * s); xx++) {
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        if ((xx / s - cx) ** 2 + (yy / s - cy) ** 2 > rad * rad) continue;
        const d = (yy * width + xx) * 4;
        rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b; rgba[d + 3] = 255;
      }
  };
  const room = o.room === 'lit';
  const g = mod.glass;
  let gx = 0, gy = 0;
  if (L.crop === 'body') {
    const b = mod.pcb;
    fill(0, 0, b.w, b.h, room ? b.colourLit : b.colour);
    for (const h of b.holes ?? []) disc(h.x, h.y, h.r, [16, 16, 18]);
    for (const p of b.pins ?? []) { fill(p.x - 0.75, p.y - 0.75, 1.5, 1.5, [196, 160, 64]); disc(p.x, p.y, 0.45, [30, 30, 30]); }
    if (b.key) {
      // The 5-way key: a square body with a round cap.
      const k = b.key;
      fill(k.x - k.r, k.y - k.r, 2 * k.r, 2 * k.r, room ? [70, 70, 74] : [26, 26, 28]);
      disc(k.x, k.y, k.r * 0.62, room ? [120, 120, 126] : [44, 44, 48]);
    }
    gx = b.glassX; gy = b.glassY;
  }
  // The glass: a black mask round the active area, under the polariser.
  fill(gx, gy, g.w, g.h, room ? [44, 44, 48] : [12, 12, 14]);
  fill(gx + g.activeX - 0.1, gy + g.activeY - 0.1, mod.cols * mod.pitch + 0.2, mod.rows * mod.pitch + 0.2, room ? [30, 30, 33] : [6, 6, 7]);
}
