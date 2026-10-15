// A 1-bit canvas the size of the controller's display RAM.
//
// The controller has no font, no shapes and no grey: it holds one bit per
// pixel and shows it. Everything a face shows is drawn here first and then
// sent to the controller as GDDRAM bytes (see driver.js), the way the
// Adafruit_SSD1306 and U8g2 full-buffer drivers work.
//
// Coordinates are pixels, x right, y down, (0,0) top-left as the viewer sees
// the module mounted with its pins at the top. A pixel's centre is at
// (x + 0.5, y + 0.5) for the shape tests below.
//
// Colour arguments follow Adafruit GFX: 1 lights a pixel, 0 clears it, 2
// inverts it (XOR). Everything is clipped to the canvas and to `clip()`.

export const ON = 1, OFF = 0, XOR = 2;

/** 8x8 Bayer matrix, for ordered dithering: thresholds 0..63. */
const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];

/**
 * Whether a pixel is lit in an ordered dither of `level` (0 = none, 1 = all).
 * Neighbouring levels differ by whole pixels, so a ramp drawn with this does
 * not shimmer when it moves by a pixel.
 */
export function dither(x, y, level) {
  return level * 64 > BAYER8[((y & 7) << 3) | (x & 7)] + 0.5;
}

/** A point at clock angle `a` (radians, 0 = 12 o'clock, clockwise) and radius `r`. */
export function polar(cx, cy, r, a) {
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

/** Distance from (px,py) to the segment (ax,ay)-(bx,by). */
export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const u = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}

export class Gfx {
  /**
   * @param {number} width
   * @param {number} height
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    /** One byte per pixel, 0 or 1, row-major. */
    this.buf = new Uint8Array(width * height);
    this.clipRect = [0, 0, width, height];
    this.clipStack = [];
  }

  // ------------------------------------------------------------ pixels

  /** Set, clear or invert one pixel. Non-integer coordinates are floored. */
  pixel(x, y, c = ON) {
    x = Math.floor(x); y = Math.floor(y);
    const [cx, cy, cw, ch] = this.clipRect;
    if (x < cx || y < cy || x >= cx + cw || y >= cy + ch) return this;
    const i = y * this.width + x;
    this.buf[i] = c === XOR ? this.buf[i] ^ 1 : c ? 1 : 0;
    return this;
  }

  /** 1 if the pixel is lit, 0 if not or off the canvas. */
  get(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.buf[y * this.width + x];
  }

  clear(c = OFF) { this.buf.fill(c ? 1 : 0); return this; }

  /** Restrict drawing to a rectangle until `unclip()`. Nests. */
  clip(x, y, w, h) {
    this.clipStack.push(this.clipRect);
    const [px, py, pw, ph] = this.clipRect;
    const x0 = Math.max(px, Math.floor(x)), y0 = Math.max(py, Math.floor(y));
    const x1 = Math.min(px + pw, Math.floor(x + w)), y1 = Math.min(py + ph, Math.floor(y + h));
    this.clipRect = [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
    return this;
  }

  unclip() { this.clipRect = this.clipStack.pop() ?? [0, 0, this.width, this.height]; return this; }

  /**
   * Light every pixel whose centre passes `test(x + .5, y + .5)` inside the
   * box. The general tool: any shape you can write as an inequality.
   * If `test` returns a number, it is a dither level (0..1).
   */
  fillWhere(test, c = ON, box = [0, 0, this.width, this.height]) {
    const [bx, by, bw, bh] = box;
    const x0 = Math.max(0, Math.floor(bx)), y0 = Math.max(0, Math.floor(by));
    const x1 = Math.min(this.width, Math.ceil(bx + bw)), y1 = Math.min(this.height, Math.ceil(by + bh));
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const v = test(x + 0.5, y + 0.5, x, y);
        if (v === true || (typeof v === 'number' && dither(x, y, v))) this.pixel(x, y, c);
      }
    return this;
  }

  // ------------------------------------------------------------ lines

  hline(x, y, w, c = ON) {
    for (let i = 0; i < w; i++) this.pixel(x + i, y, c);
    return this;
  }

  vline(x, y, h, c = ON) {
    for (let i = 0; i < h; i++) this.pixel(x, y + i, c);
    return this;
  }

  /** One-pixel Bresenham line between pixel coordinates, both ends inclusive. */
  line(x0, y0, x1, y1, c = ON) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.pixel(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  /**
   * A line `width` pixels thick with round ends, between points in canvas
   * coordinates (pixel centres are at +0.5). Use for clock hands.
   */
  thickLine(x0, y0, x1, y1, width = 2, c = ON) {
    const r = width / 2;
    const box = [Math.min(x0, x1) - r - 1, Math.min(y0, y1) - r - 1, Math.abs(x1 - x0) + width + 2, Math.abs(y1 - y0) + width + 2];
    return this.fillWhere((px, py) => segDist(px, py, x0, y0, x1, y1) <= r, c, box);
  }

  /** A polyline `[[x,y], ...]` stroked `width` thick, as one shape (XOR-safe). */
  stroke(points, width = 2, c = ON) {
    if (points.length === 1) points = [points[0], points[0]];
    const r = width / 2;
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const box = [Math.min(...xs) - r - 1, Math.min(...ys) - r - 1,
      Math.max(...xs) - Math.min(...xs) + width + 2, Math.max(...ys) - Math.min(...ys) + width + 2];
    return this.fillWhere((px, py) => {
      for (let i = 1; i < points.length; i++)
        if (segDist(px, py, points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]) <= r) return true;
      return false;
    }, c, box);
  }

  // ------------------------------------------------------------ boxes

  rect(x, y, w, h, c = ON) {
    if (w <= 0 || h <= 0) return this;
    this.hline(x, y, w, c);
    if (h > 1) this.hline(x, y + h - 1, w, c);
    if (h > 2) { this.vline(x, y + 1, h - 2, c); if (w > 1) this.vline(x + w - 1, y + 1, h - 2, c); }
    return this;
  }

  fillRect(x, y, w, h, c = ON) {
    for (let j = 0; j < h; j++) this.hline(x, y + j, w, c);
    return this;
  }

  /** Invert a rectangle: shorthand for fillRect(..., XOR). */
  invert(x = 0, y = 0, w = this.width, h = this.height) { return this.fillRect(x, y, w, h, XOR); }

  /** Rounded rectangle outline, corner radius `r` pixels. */
  roundRect(x, y, w, h, r, c = ON) {
    const inside = roundRectTest(x, y, w, h, r);
    const inner = roundRectTest(x + 1, y + 1, w - 2, h - 2, Math.max(0, r - 1));
    return this.fillWhere((px, py) => inside(px, py) && !inner(px, py), c, [x, y, w, h]);
  }

  fillRoundRect(x, y, w, h, r, c = ON) {
    return this.fillWhere(roundRectTest(x, y, w, h, r), c, [x, y, w, h]);
  }

  // ------------------------------------------------------------ round things

  /** Circle outline through pixel centres, midpoint algorithm: crisp at any size. */
  circle(cx, cy, r, c = ON) {
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    let x = r, y = 0, err = 1 - r;
    const seen = new Set();
    const plot = (px, py) => {
      const k = px * 4096 + py;
      if (!seen.has(k)) { seen.add(k); this.pixel(px, py, c); }
    };
    while (x >= y) {
      for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) plot(cx + a, cy + b);
      y++;
      if (err < 0) err += 2 * y + 1;
      else { x--; err += 2 * (y - x) + 1; }
    }
    return this;
  }

  /** Filled disc of radius `r` centred on (cx, cy), canvas coordinates. */
  fillCircle(cx, cy, r, c = ON) {
    return this.fillWhere((px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r, c, [cx - r - 1, cy - r - 1, 2 * r + 2, 2 * r + 2]);
  }

  fillEllipse(cx, cy, rx, ry, c = ON) {
    return this.fillWhere((px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1, c, [cx - rx - 1, cy - ry - 1, 2 * rx + 2, 2 * ry + 2]);
  }

  /** A ring between radii r0 and r1 (inclusive). */
  ring(cx, cy, r0, r1, c = ON) {
    return this.fillWhere((px, py) => {
      const d = Math.hypot(px - cx, py - cy);
      return d >= r0 && d <= r1;
    }, c, [cx - r1 - 1, cy - r1 - 1, 2 * r1 + 2, 2 * r1 + 2]);
  }

  /**
   * Part of a ring, from clock angle a0 to a1 (radians, 0 = 12 o'clock,
   * clockwise), between radii r0 and r1. a1 - a0 >= 2π is the whole ring.
   */
  arc(cx, cy, r0, r1, a0, a1, c = ON) {
    const span = a1 - a0;
    return this.fillWhere((px, py) => {
      const d = Math.hypot(px - cx, py - cy);
      if (d < r0 || d > r1) return false;
      if (span >= Math.PI * 2) return true;
      let a = Math.atan2(px - cx, cy - py) - a0;
      a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return a <= span;
    }, c, [cx - r1 - 1, cy - r1 - 1, 2 * r1 + 2, 2 * r1 + 2]);
  }

  /** Filled polygon, even-odd rule, vertices in canvas coordinates. */
  fillPolygon(points, c = ON) {
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const box = [Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) - Math.min(...xs) + 2, Math.max(...ys) - Math.min(...ys) + 2];
    return this.fillWhere((px, py) => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i], [xj, yj] = points[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }, c, box);
  }

  // ------------------------------------------------------------ shading

  /** Fill a rectangle with an ordered dither of `level` (0..1). */
  shade(x, y, w, h, level, c = ON) {
    return this.fillWhere((_, __, ix, iy) => dither(ix, iy, level), c, [x, y, w, h]);
  }

  // ------------------------------------------------------------ bitmaps

  /**
   * Draw a sprite (from `sprite()` in kit.js). Lit sprite pixels are drawn in
   * colour `c`; unlit ones are left alone unless `opaque`, which clears them.
   * `flipX`/`flipY` mirror it; `scale` repeats each pixel.
   */
  blit(spr, x, y, { c = ON, opaque = false, flipX = false, flipY = false, scale = 1 } = {}) {
    x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < spr.h; j++)
      for (let i = 0; i < spr.w; i++) {
        const on = spr.data[(flipY ? spr.h - 1 - j : j) * spr.w + (flipX ? spr.w - 1 - i : i)];
        if (!on && !opaque) continue;
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++)
            this.pixel(x + i * scale + sx, y + j * scale + sy, on ? c : OFF);
      }
    return this;
  }

  // ------------------------------------------------------------ text

  /**
   * Draw `str` in a bitmap font (fonts.js) with its top-left at (x, y).
   * Returns the x just past the last glyph. `scale` repeats pixels;
   * `spacing` overrides the font's gap between glyphs.
   */
  text(str, x, y, { font, scale = 1, c = ON, spacing } = {}) {
    if (!font) throw new Error('text() needs { font } -- import one from fonts.js');
    const gap = spacing ?? font.spacing ?? 1;
    let cx = Math.round(x);
    for (const ch of String(str)) {
      const g = font.glyph(ch);
      if (g) this.blit(g, cx, y, { c, scale });
      cx += ((g?.w ?? font.width) + gap) * scale;
    }
    return cx - gap * scale;
  }

  // ------------------------------------------------------------ whole canvas

  /** Move everything by (dx, dy), filling the exposed edge with `fill`. */
  shift(dx, dy, fill = OFF) {
    const src = Uint8Array.from(this.buf);
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const sx = x - dx, sy = y - dy;
        this.buf[y * this.width + x] = sx >= 0 && sy >= 0 && sx < this.width && sy < this.height ? src[sy * this.width + sx] : fill;
      }
    return this;
  }

  /** Count of lit pixels, for power and burn-in reasoning. */
  litCount() {
    let n = 0;
    for (const v of this.buf) n += v;
    return n;
  }

  /**
   * The canvas as controller pages: `pages` x `cols` bytes, each byte eight
   * pixels stacked vertically with the least significant bit on top
   * (SSD1306 datasheet, GDDRAM). Page p covers rows 8p..8p+7.
   */
  toPages(pages = this.height >> 3, cols = this.width) {
    const out = new Uint8Array(pages * cols);
    for (let p = 0; p < pages; p++)
      for (let x = 0; x < cols; x++) {
        let b = 0;
        for (let k = 0; k < 8; k++) if (this.get(x, p * 8 + k)) b |= 1 << k;
        out[p * cols + x] = b;
      }
    return out;
  }
}

/**
 * A sprite from a picture: rows of '#' (lit) and '.' or ' ' (unlit), as one
 * newline-separated string or an array of rows. Leading indentation common to
 * every row is ignored, so pictures can be indented in source.
 * @returns {{w: number, h: number, data: Uint8Array}}
 */
export function sprite(picture) {
  let lines = Array.isArray(picture) ? picture : String(picture).split('\n');
  while (lines.length && !lines[0].trim()) lines = lines.slice(1);
  while (lines.length && !lines[lines.length - 1].trim()) lines = lines.slice(0, -1);
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  lines = lines.map((l) => l.slice(indent).replace(/\s+$/, ''));
  const w = Math.max(0, ...lines.map((l) => l.length)), h = lines.length;
  const data = new Uint8Array(w * h);
  lines.forEach((l, y) => { for (let x = 0; x < l.length; x++) data[y * w + x] = l[x] === '#' ? 1 : 0; });
  return { w, h, data };
}

/** Inside-test for a rounded rectangle (canvas coordinates). */
export function roundRectTest(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  return (px, py) => {
    if (px < x || py < y || px > x + w || py > y + h) return false;
    const qx = Math.max(x + r - px, 0, px - (x + w - r));
    const qy = Math.max(y + r - py, 0, py - (y + h - r));
    return qx * qx + qy * qy <= r * r;
  };
}
