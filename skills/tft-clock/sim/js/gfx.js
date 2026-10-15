// The canvas a design draws on: an RGB565 frame buffer the size of the glass,
// 160 x 80, two bytes a pixel (25,600 bytes), what whatever MCU drives the
// panel keeps in RAM and sends to the controller each frame (driver.js).
//
// Coordinates are pixels, x right, y down, (0, 0) top-left as the viewer sees
// the module upright. Shape coordinates are continuous: a pixel's centre is
// at (x + 0.5, y + 0.5). `pixel`, `line`, `hline`, `vline`, `rect` and
// `fillRect` take integer pixels.
//
// Colours are 0xRRGGBB (color.js). Every write rounds to RGB565.
//
// Options, accepted as the last argument by every filling call:
//   a        opacity 0..1 (default 1): blends with what is already there
//   aa       anti-alias the edge (default: the canvas's `aa`, false): edge
//            pixels get partial coverage, blended. Off, a pixel is in or out
//            by its centre, exactly the palette colours, crisp stair-steps.
//   dither   ordered-dither the rounding to RGB565 (default false; gradients
//            default true): more apparent colours, a fine stable pattern
//
// Every call is written so it maps onto one C function with plain integer
// and float arguments. The canvas also counts what each frame did (`cost`),
// which cost.js reports as the frame's workload.

import { to565, from565, dither565, R, G, B } from './color.js';
import { STATE } from './cost.js';

const clampUnit = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);

/** A point at clock angle `a` (radians, 0 = 12 o'clock, clockwise) and radius `r`. */
export function polar(cx, cy, r, a) {
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

/** Distance from (px, py) to the segment (ax, ay)-(bx, by). */
export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let u = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return Math.sqrt(ex * ex + ey * ey);
}

/** Signed distance to a rounded rectangle (negative inside). */
export function roundRectDist(px, py, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r), qy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Signed distance to a polygon `[[x, y], ...]`, even-odd rule (negative inside). */
export function polygonDist(px, py, pts) {
  let d = Infinity, inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    const e = segDist(px, py, xj, yj, xi, yi);
    if (e < d) d = e;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside ? -d : d;
}

export class Gfx {
  /**
   * @param {number} width
   * @param {number} height
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    /** RGB565 values, row-major. */
    this.buf = new Uint16Array(width * height);
    /** Default for the `aa` option. */
    this.aa = false;
    this.clipStack = [];
    this.cx0 = 0; this.cy0 = 0; this.cx1 = width; this.cy1 = height;
    /** What this frame did, for the CPU estimate (cost.js). */
    this.cost = { calls: 0, px: 0, blend: 0, dither: 0, box: 0, edge: 0, shade: 0, ramp: 0, blit: 0 };
  }

  // ------------------------------------------------------------ pixels

  /**
   * The one write path. (x, y) integer, already inside the clip. `a` is the
   * coverage times the opacity, in (0, 1].
   */
  put(x, y, c, a = 1, dither = false) {
    const i = y * this.width + x;
    if (dither) this.cost.dither++;
    if (a >= 1) {
      this.cost.px++;
      this.buf[i] = dither ? dither565(R(c), G(c), B(c), x, y) : to565(c);
      return;
    }
    this.cost.blend++;
    const d = from565(this.buf[i]);
    const r = R(d) + (R(c) - R(d)) * a, g = G(d) + (G(c) - G(d)) * a, b = B(d) + (B(c) - B(d)) * a;
    this.buf[i] = dither ? dither565(r, g, b, x, y) : to565(((r + 0.5) << 16) | ((g + 0.5) << 8) | (b + 0.5));
  }

  inClip(x, y) { return x >= this.cx0 && y >= this.cy0 && x < this.cx1 && y < this.cy1; }

  /** Set one pixel. Non-integer coordinates are floored. */
  pixel(x, y, c, { a = 1, dither = false } = {}) {
    x = Math.floor(x); y = Math.floor(y);
    if (this.inClip(x, y) && a > 0) this.put(x, y, c, a, dither);
    return this;
  }

  /** The colour stored at a pixel, as 0xRRGGBB (after RGB565 rounding); 0 off the canvas. */
  get(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return from565(this.buf[y * this.width + x]);
  }

  /** Fill the whole canvas (ignores the clip). */
  clear(c = 0) {
    this.cost.calls++;
    this.cost.px += this.buf.length;
    this.buf.fill(to565(c));
    return this;
  }

  /** Restrict drawing to a rectangle until `unclip()`. Nests. */
  clip(x, y, w, h) {
    this.clipStack.push([this.cx0, this.cy0, this.cx1, this.cy1]);
    this.cx0 = Math.max(this.cx0, Math.floor(x)); this.cy0 = Math.max(this.cy0, Math.floor(y));
    this.cx1 = Math.max(this.cx0, Math.min(this.cx1, Math.floor(x + w)));
    this.cy1 = Math.max(this.cy0, Math.min(this.cy1, Math.floor(y + h)));
    return this;
  }

  unclip() {
    [this.cx0, this.cy0, this.cx1, this.cy1] = this.clipStack.pop() ?? [0, 0, this.width, this.height];
    return this;
  }

  /** Integer bounds of a box intersected with the clip: [x0, y0, x1, y1], or null if empty. */
  bounds(bx, by, bw, bh) {
    const x0 = Math.max(this.cx0, Math.floor(bx)), y0 = Math.max(this.cy0, Math.floor(by));
    const x1 = Math.min(this.cx1, Math.ceil(bx + bw)), y1 = Math.min(this.cy1, Math.ceil(by + bh));
    return x0 < x1 && y0 < y1 ? [x0, y0, x1, y1] : null;
  }

  // ------------------------------------------------------------ general fills

  /**
   * Fill a shape given by its signed distance (pixels, negative inside) at
   * each pixel centre, over a box: hard edges keep pixels whose centre is
   * inside; `aa` gives edge pixels coverage 0.5 - d. `dist` is your
   * function, run per pixel on the device (priced as a shader in cost.js).
   */
  fillSDF(dist, c, box, o = {}) {
    return this.shape((px, py) => {
      STATE.shader++; this.cost.shade++;
      const d = dist(px, py);
      STATE.shader--;
      return d;
    }, c, box, o);
  }

  /**
   * The base of every shape below, for the kit's own distance functions:
   * priced as an efficient C primitive (`box` per pixel scanned, `edge` per
   * anti-aliased edge pixel). Designs call fillSDF instead.
   */
  shape(dist, c, box, { a = 1, aa = this.aa, dither = false } = {}) {
    this.cost.calls++;
    const b = this.bounds(...box);
    if (!b || a <= 0) return this;
    const [x0, y0, x1, y1] = b;
    STATE.prim++;
    try {
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          this.cost.box++;
          const d = dist(x + 0.5, y + 0.5);
          if (aa) {
            const cov = 0.5 - d;
            if (cov <= 0) continue;
            if (cov < 1) { this.cost.edge++; this.put(x, y, c, cov * a, dither); } else this.put(x, y, c, a, dither);
          } else if (d <= 0) this.put(x, y, c, a, dither);
        }
    } finally { STATE.prim--; }
    return this;
  }

  /**
   * Fill every pixel whose centre passes `test(px, py, x, y)` inside the box.
   * `test` returns true/false, or a number: coverage 0..1, blended (so a
   * soft shape, a glow, a vignette). Any shape you can write as a test.
   */
  fillWhere(test, c, box = [0, 0, this.width, this.height], { a = 1, dither = false } = {}) {
    this.cost.calls++;
    const b = this.bounds(...box);
    if (!b) return this;
    const [x0, y0, x1, y1] = b;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        this.cost.shade++; STATE.shader++;
        const v = test(x + 0.5, y + 0.5, x, y);
        STATE.shader--;
        if (v === true) this.put(x, y, c, a, dither);
        else if (typeof v === 'number' && v > 0) this.put(x, y, c, clampUnit(v) * a, dither);
      }
    return this;
  }

  /**
   * A per-pixel shader: `fn(px, py, x, y)` returns the colour for that pixel
   * (0xRRGGBB), or -1 (or null) to leave it. The most general call and the
   * most expensive one: on the device it runs your function for every pixel
   * of the box, every frame.
   */
  paint(fn, box = [0, 0, this.width, this.height], { a = 1, dither = false } = {}) {
    this.cost.calls++;
    const b = this.bounds(...box);
    if (!b) return this;
    const [x0, y0, x1, y1] = b;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        this.cost.shade++; STATE.shader++;
        const v = fn(x + 0.5, y + 0.5, x, y);
        STATE.shader--;
        if (v !== null && v !== undefined && v >= 0) this.put(x, y, v, a, dither);
      }
    return this;
  }

  // ------------------------------------------------------------ lines

  hline(x, y, w, c, o = {}) { return this.fillRect(x, y, w, 1, c, o); }
  vline(x, y, h, c, o = {}) { return this.fillRect(x, y, 1, h, c, o); }

  /** One-pixel Bresenham line between pixel coordinates, both ends included. Hard, no AA. */
  line(x0, y0, x1, y1, c, { a = 1 } = {}) {
    this.cost.calls++;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 4096; n++) {
      if (this.inClip(x0, y0)) this.put(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  /**
   * A line `width` thick with round ends, between points in canvas
   * coordinates (centres at +0.5). With `aa`, a 1-wide line is a smooth hairline.
   */
  thickLine(x0, y0, x1, y1, width, c, o = {}) {
    const r = width / 2;
    return this.shape((px, py) => segDist(px, py, x0, y0, x1, y1) - r, c,
      [Math.min(x0, x1) - r - 1, Math.min(y0, y1) - r - 1, Math.abs(x1 - x0) + width + 2, Math.abs(y1 - y0) + width + 2], o);
  }

  /** A polyline `[[x, y], ...]` stroked `width` thick, as one shape (so a translucent stroke does not double up at joints). */
  stroke(points, width, c, o = {}) {
    if (points.length === 1) points = [points[0], points[0]];
    const r = width / 2;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    return this.shape((px, py) => {
      let d = Infinity;
      for (let i = 1; i < points.length; i++) {
        const e = segDist(px, py, points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
        if (e < d) d = e;
      }
      return d - r;
    }, c, [minX - r - 1, minY - r - 1, maxX - minX + width + 2, maxY - minY + width + 2], o);
  }

  // ------------------------------------------------------------ boxes

  /** Rectangle outline, integer pixels. */
  rect(x, y, w, h, c, o = {}) {
    if (w <= 0 || h <= 0) return this;
    this.fillRect(x, y, w, 1, c, o);
    if (h > 1) this.fillRect(x, y + h - 1, w, 1, c, o);
    if (h > 2) { this.fillRect(x, y + 1, 1, h - 2, c, o); if (w > 1) this.fillRect(x + w - 1, y + 1, 1, h - 2, c, o); }
    return this;
  }

  /** Filled rectangle, integer pixels. The cheapest fill there is. */
  fillRect(x, y, w, h, c, { a = 1, dither = false } = {}) {
    this.cost.calls++;
    const b = this.bounds(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    if (!b || a <= 0) return this;
    const [x0, y0, x1, y1] = b;
    if (a >= 1 && !dither) {
      const v = to565(c);
      for (let yy = y0; yy < y1; yy++) this.buf.fill(v, yy * this.width + x0, yy * this.width + x1);
      this.cost.px += (x1 - x0) * (y1 - y0);
      return this;
    }
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this.put(xx, yy, c, a, dither);
    return this;
  }

  /** Rounded rectangle outline `t` pixels thick (default 1), corner radius `r`. */
  roundRect(x, y, w, h, r, c, o = {}) {
    const t = o.t ?? 1;
    return this.shape((px, py) => Math.abs(roundRectDist(px, py, x + t / 2, y + t / 2, w - t, h - t, r - t / 2)) - t / 2,
      c, [x - 1, y - 1, w + 2, h + 2], o);
  }

  fillRoundRect(x, y, w, h, r, c, o = {}) {
    return this.shape((px, py) => roundRectDist(px, py, x, y, w, h, r), c, [x - 1, y - 1, w + 2, h + 2], o);
  }

  // ------------------------------------------------------------ round things

  /** Circle outline through pixel centres, midpoint algorithm: crisp 1-pixel ring at any size. Hard. */
  circle(cx, cy, r, c, { a = 1 } = {}) {
    this.cost.calls++;
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    let x = r, y = 0, err = 1 - r;
    const seen = new Set();
    const plot = (px, py) => {
      const k = px * 4096 + py;
      if (!seen.has(k) && this.inClip(px, py)) { seen.add(k); this.put(px, py, c, a); }
    };
    while (x >= y) {
      plot(cx + x, cy + y); plot(cx + y, cy + x); plot(cx - y, cy + x); plot(cx - x, cy + y);
      plot(cx - x, cy - y); plot(cx - y, cy - x); plot(cx + y, cy - x); plot(cx + x, cy - y);
      y++;
      if (err < 0) err += 2 * y + 1;
      else { x--; err += 2 * (y - x) + 1; }
    }
    return this;
  }

  /** Filled disc of radius `r` centred on (cx, cy), canvas coordinates. */
  fillCircle(cx, cy, r, c, o = {}) {
    return this.shape((px, py) => Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) - r, c, [cx - r - 1, cy - r - 1, 2 * r + 2, 2 * r + 2], o);
  }

  fillEllipse(cx, cy, rx, ry, c, o = {}) {
    const k = Math.min(rx, ry);
    return this.shape((px, py) => (Math.sqrt(((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2) - 1) * k, c,
      [cx - rx - 1, cy - ry - 1, 2 * rx + 2, 2 * ry + 2], o);
  }

  /** A ring between radii r0 and r1. */
  ring(cx, cy, r0, r1, c, o = {}) {
    const m = (r0 + r1) / 2, h = (r1 - r0) / 2;
    return this.shape((px, py) => Math.abs(Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) - m) - h, c,
      [cx - r1 - 1, cy - r1 - 1, 2 * r1 + 2, 2 * r1 + 2], o);
  }

  /**
   * Part of a ring, from clock angle a0 to a1 (radians, 0 = 12 o'clock,
   * clockwise), between radii r0 and r1, square ends. a1 - a0 >= 2π is the
   * whole ring.
   */
  arc(cx, cy, r0, r1, a0, a1, c, o = {}) {
    const span = a1 - a0, m = (r0 + r1) / 2, h = (r1 - r0) / 2;
    if (span >= 2 * Math.PI) return this.ring(cx, cy, r0, r1, c, o);
    if (span <= 0) return this;
    // The wedge is bounded by the lines of the two end rays. s0 and s1 are
    // signed distances to them, negative on the wedge's side. Up to half a
    // turn the wedge is where both are negative; beyond, where either is.
    const c0 = Math.cos(a0), n0 = Math.sin(a0), c1 = Math.cos(a1), n1 = Math.sin(a1);
    const wide = span > Math.PI;
    return this.shape((px, py) => {
      const dx = px - cx, dy = py - cy;
      const dRing = Math.abs(Math.sqrt(dx * dx + dy * dy) - m) - h;
      const s0 = -(dx * c0 + dy * n0), s1 = dx * c1 + dy * n1;
      return Math.max(dRing, wide ? Math.min(s0, s1) : Math.max(s0, s1));
    }, c, [cx - r1 - 1, cy - r1 - 1, 2 * r1 + 2, 2 * r1 + 2], o);
  }

  /** Filled polygon, even-odd rule, vertices in canvas coordinates. */
  fillPolygon(points, c, o = {}) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    return this.shape((px, py) => polygonDist(px, py, points), c, [minX - 1, minY - 1, maxX - minX + 2, maxY - minY + 2], o);
  }

  // ------------------------------------------------------------ gradients

  /**
   * Linear gradient over a box. `stops` is a list of colours spread evenly,
   * or of [position 0..1, colour] pairs. `angle` in degrees: 0 runs left to
   * right, 90 top to bottom. Dithered by default, which is what keeps a
   * gradient from banding in RGB565.
   */
  gradient(x, y, w, h, stops, { angle = 90, dither = true, a = 1 } = {}) {
    const st = normStops(stops);
    const rad = (angle * Math.PI) / 180, ux = Math.cos(rad), uy = Math.sin(rad);
    // Project the box's corners to find the span the ramp covers.
    const ps = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => px * ux + py * uy);
    const lo = Math.min(...ps), span = Math.max(...ps) - lo || 1;
    return this.ramp((px, py) => ((px * ux + py * uy) - lo) / span, st, [x, y, w, h], { dither, a });
  }

  /** Radial gradient from (cx, cy) out to radius r; beyond r the last stop. */
  radial(cx, cy, r, stops, { box = [0, 0, this.width, this.height], dither = true, a = 1 } = {}) {
    const st = normStops(stops);
    return this.ramp((px, py) => Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) / r, st, box, { dither, a });
  }

  /**
   * A per-pixel look at a fraction of the price: `fn(px, py)` returns a
   * colour (0xRRGGBB) and is called only on a grid every `cell` pixels;
   * pixels in between get the bilinear blend of the four corners, dithered.
   * Water, skies, plasma, fog: anything smooth. With cell 4 the device runs
   * your function about 1/16 as often as paint() would.
   */
  coarse(fn, { cell = 4, box = [0, 0, this.width, this.height], dither = true, a = 1 } = {}) {
    this.cost.calls++;
    const b = this.bounds(...box);
    if (!b) return this;
    const [x0, y0, x1, y1] = b;
    const nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y1 - y0) / cell) + 1;
    const grid = new Float32Array(nx * ny * 3);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        this.cost.shade++; STATE.shader++;
        const c = fn(x0 + i * cell, y0 + j * cell);
        STATE.shader--;
        const k = (j * nx + i) * 3;
        grid[k] = R(c); grid[k + 1] = G(c); grid[k + 2] = B(c);
      }
    STATE.prim++;
    try {
      for (let y = y0; y < y1; y++) {
        const fy = (y + 0.5 - y0) / cell, j = Math.min(ny - 2, Math.floor(fy)), v = fy - j;
        for (let x = x0; x < x1; x++) {
          this.cost.ramp++;
          const fx = (x + 0.5 - x0) / cell, i = Math.min(nx - 2, Math.floor(fx)), u = fx - i;
          const k00 = (j * nx + i) * 3, k10 = k00 + 3, k01 = k00 + nx * 3, k11 = k01 + 3;
          const ch = (o) => (grid[k00 + o] * (1 - u) + grid[k10 + o] * u) * (1 - v) + (grid[k01 + o] * (1 - u) + grid[k11 + o] * u) * v;
          const r = ch(0), g = ch(1), bl = ch(2);
          if (a >= 1) {
            if (dither) this.cost.dither++;
            this.buf[y * this.width + x] = dither ? dither565(r, g, bl, x, y) : to565(((r + 0.5) << 16) | ((g + 0.5) << 8) | (bl + 0.5));
          } else this.put(x, y, ((r + 0.5) << 16) | ((g + 0.5) << 8) | (bl + 0.5), a, dither);
        }
      }
    } finally { STATE.prim--; }
    return this;
  }

  /** A ramp: `u(px, py)` (0..1) looked up in normalised stops. */
  ramp(u, st, box, { dither = true, a = 1 } = {}) {
    this.cost.calls++;
    const b = this.bounds(...box);
    if (!b) return this;
    const [x0, y0, x1, y1] = b;
    STATE.prim++;
    try {
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          this.cost.ramp++;
          const [r, g, bl] = sampleStops(st, u(xx + 0.5, yy + 0.5));
          if (a >= 1) {
            if (dither) this.cost.dither++;
            this.buf[yy * this.width + xx] = dither ? dither565(r, g, bl, xx, yy) : to565(((r + 0.5) << 16) | ((g + 0.5) << 8) | (bl + 0.5));
          } else this.put(xx, yy, ((r + 0.5) << 16) | ((g + 0.5) << 8) | (bl + 0.5), a, dither);
        }
    } finally { STATE.prim--; }
    return this;
  }

  // ------------------------------------------------------------ bitmaps

  /**
   * Draw a sprite (sprite() below). Transparent sprite pixels are skipped.
   * `c` paints every opaque pixel one colour (a font glyph, a silhouette);
   * `flipX`/`flipY` mirror it; `scale` repeats each pixel.
   */
  blit(spr, x, y, { c, a = 1, flipX = false, flipY = false, scale = 1 } = {}) {
    this.cost.calls++;
    x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < spr.h; j++)
      for (let i = 0; i < spr.w; i++) {
        const v = spr.data[(flipY ? spr.h - 1 - j : j) * spr.w + (flipX ? spr.w - 1 - i : i)];
        if (v < 0) continue;
        const col = c ?? v;
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) {
            const px = x + i * scale + sx, py = y + j * scale + sy;
            if (this.inClip(px, py)) { this.cost.blit++; this.put(px, py, col, a); }
          }
      }
    return this;
  }

  /**
   * Draw another canvas onto this one at (x, y). `key` is a colour treated
   * as transparent. A second canvas costs 25.6 KB of RAM on the device.
   */
  draw(src, x, y, { key, a = 1 } = {}) {
    this.cost.calls++;
    x = Math.round(x); y = Math.round(y);
    const k = key === undefined ? -1 : to565(key);
    for (let j = 0; j < src.height; j++)
      for (let i = 0; i < src.width; i++) {
        const v = src.buf[j * src.width + i];
        const px = x + i, py = y + j;
        if (v === k || !this.inClip(px, py)) continue;
        if (a >= 1) { this.cost.blit++; this.buf[py * this.width + px] = v; } else this.put(px, py, from565(v), a);
      }
    return this;
  }

  // ------------------------------------------------------------ text

  /**
   * Draw `str` in a bitmap font (fonts.js) with its top-left at (x, y).
   * Returns the x just past the last glyph. `scale` repeats pixels;
   * `spacing` overrides the font's gap between glyphs.
   */
  text(str, x, y, { font, scale = 1, c = 0xffffff, a = 1, spacing } = {}) {
    if (!font) throw new Error('text() needs { font }: import one from fonts.js');
    const gap = spacing ?? font.spacing ?? 1;
    let cx = Math.round(x);
    for (const ch of String(str)) {
      const gl = font.glyph(ch);
      if (gl) this.blit(gl, cx, y, { c, a, scale });
      cx += ((gl?.w ?? font.width) + gap) * scale;
    }
    return cx - gap * scale;
  }

  // ------------------------------------------------------------ whole canvas

  /** Move everything by whole pixels (dx, dy), filling the exposed edge with `fill`. */
  shift(dx, dy, fill = 0) {
    this.cost.calls++;
    dx = Math.round(dx); dy = Math.round(dy);
    const src = this.buf.slice(), f = to565(fill), W = this.width, H = this.height;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const sx = x - dx, sy = y - dy;
        this.buf[y * W + x] = sx >= 0 && sy >= 0 && sx < W && sy < H ? src[sy * W + sx] : f;
      }
    this.cost.px += W * H;
    return this;
  }
}

// Every canvas method is kit code: Math it calls itself is priced in its
// counts, not as the design's own maths. Your callbacks inside it still
// count (STATE.shader). The per-pixel hot paths are left unwrapped.
for (const name of Object.getOwnPropertyNames(Gfx.prototype)) {
  if (name === 'constructor' || name === 'put' || name === 'inClip') continue;
  const f = Gfx.prototype[name];
  Gfx.prototype[name] = function (...a) {
    STATE.prim++;
    try { return f.apply(this, a); } finally { STATE.prim--; }
  };
}

/** Normalise gradient stops to [[pos, r, g, b], ...] sorted by position. */
export function normStops(stops) {
  const n = stops.length;
  return stops.map((s, i) => {
    const [p, c] = Array.isArray(s) ? s : [n === 1 ? 0 : i / (n - 1), s];
    return [p, R(c), G(c), B(c)];
  }).sort((a, b) => a[0] - b[0]);
}

/** [r, g, b] (fractional) at u in normalised stops, clamped at the ends. */
export function sampleStops(st, u) {
  if (u <= st[0][0]) return [st[0][1], st[0][2], st[0][3]];
  const last = st[st.length - 1];
  if (u >= last[0]) return [last[1], last[2], last[3]];
  let k = 1;
  while (st[k][0] < u) k++;
  const a = st[k - 1], b = st[k], f = (u - a[0]) / (b[0] - a[0] || 1);
  return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
}

/**
 * A sprite from a picture: rows of characters, one per pixel, as one
 * newline-separated string or an array of rows. `palette` maps characters to
 * colours (0xRRGGBB); '.' and ' ' are transparent; with no palette '#' is
 * white. Leading indentation common to every row is ignored, so pictures can
 * be indented in source.
 *
 *   sprite(`
 *     .rr.
 *     rwwr
 *     .rr.`, { r: 0xd04040, w: 0xffffff })
 *
 * @returns {{w: number, h: number, data: Int32Array}}  colour, or -1 for transparent
 */
export function sprite(picture, palette = { '#': 0xffffff }) {
  let lines = Array.isArray(picture) ? [...picture] : String(picture).split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  lines = lines.map((l) => l.slice(indent).replace(/\s+$/, ''));
  const w = Math.max(0, ...lines.map((l) => l.length)), h = lines.length;
  const data = new Int32Array(w * h).fill(-1);
  lines.forEach((l, y) => {
    for (let x = 0; x < l.length; x++) {
      const ch = l[x];
      if (ch === '.' || ch === ' ') continue;
      if (!(ch in palette)) throw new Error(`sprite: no colour for '${ch}' (row ${y + 1})`);
      data[y * w + x] = palette[ch];
    }
  });
  return { w, h, data };
}
