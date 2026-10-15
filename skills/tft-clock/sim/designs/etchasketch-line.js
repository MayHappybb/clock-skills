// Etch A Sketch: the line. Everything on the screen is a 4-connected pixel
// path (the stylus moves only by the two knobs: one pixel left/right or
// up/down per step, so a diagonal is a staircase and a curve is a careful
// run of stairs). Built once at load: these are the flash tables.

/** A path builder: points in skeleton pixels, arcs in degrees (0 = right, 90 = down). */
export class Route {
  constructor(x, y) { this.pts = [[x, y]]; }
  to(x, y) { this.pts.push([x, y]); return this; }
  /**
   * A knob-twiddled curve: the arc is walked in whole stair treads of `q`
   * pixels (turn one knob q clicks, then the other), the way a hand draws a
   * curve with two knobs. Each tread is an L, not a diagonal.
   */
  arc(cx, cy, rx, ry, a0, a1, q = Route.q) {
    const n = Math.max(3, Math.ceil(Math.abs(a1 - a0) / 360 * Math.PI * 2 * Math.max(rx, ry) / 0.5));
    let [lx, ly] = this.pts[this.pts.length - 1];
    lx = Math.round(lx); ly = Math.round(ly);
    for (let i = 1; i <= n; i++) {
      const a = (a0 + (a1 - a0) * (i / n)) * Math.PI / 180;
      const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
      const last = i === n;
      // move one axis only once it has drifted a full tread from the last corner
      const dx = Math.round(x) - lx, dy = Math.round(y) - ly;
      if (Math.abs(dx) >= q || (last && dx)) { lx += dx; this.pts.push([lx, ly]); }
      if (Math.abs(dy) >= q || (last && dy)) { ly += dy; this.pts.push([lx, ly]); }
    }
    return this;
  }
  /** Retrace the last `k` points backwards (the stylus going back over its own line). */
  back(k) {
    const n = this.pts.length;
    for (let i = n - 2; i >= n - 1 - k && i >= 0; i--) this.pts.push(this.pts[i].slice());
    return this;
  }
  mark() { return this.pts.length; }
  /** Retrace back to the point index returned by mark(). */
  backTo(m) { return this.back(this.pts.length - m); }
  /** The 4-connected pixel path through every point, as [x0, y0, x1, y1, ...]. */
  pixels() { return trace(this.pts); }
}

Route.q = 1;

/** 4-connected staircase through integer-rounded points. */
export function trace(points) {
  const out = [];
  let px = Math.round(points[0][0]), py = Math.round(points[0][1]);
  out.push(px, py);
  for (let i = 1; i < points.length; i++) {
    const tx = Math.round(points[i][0]), ty = Math.round(points[i][1]);
    const dx = Math.abs(tx - px), dy = Math.abs(ty - py);
    const sx = Math.sign(tx - px), sy = Math.sign(ty - py);
    let ix = 0, iy = 0;
    while (ix < dx || iy < dy) {
      // step whichever axis keeps the stair nearest the true line
      if (iy >= dy || (ix < dx && (2 * ix + 1) * dy < (2 * iy + 1) * dx)) { px += sx; ix++; }
      else { py += sy; iy++; }
      out.push(px, py);
    }
  }
  return Int16Array.from(out);
}

/** Pixels of a path dilated by a square pen of radius r (3x3 for r = 1), deduplicated. */
export function dilate(path, r = 1) {
  const seen = new Set(), out = [];
  for (let i = 0; i < path.length; i += 2)
    for (let oy = -r; oy <= r; oy++)
      for (let ox = -r; ox <= r; ox++) {
        const x = path[i] + ox, y = path[i + 1] + oy, k = (y + 64) * 512 + x + 64;
        if (!seen.has(k)) { seen.add(k); out.push(x, y); }
      }
  return Int16Array.from(out);
}
