// Metro: the numerals as line routes, and their rasters.
//
// Each digit is one or more routes (polylines of a line) on a 17 x 38 grid
// of centre-line coordinates, with every segment at 0, 45 or 90 degrees and
// each bend filleted (R 3), as on a Beck diagram. A route can be a loop (0
// and 8 are Circle-line loops), can branch off another route (the middle of
// a 3), and ends in a terminus bar (which gives the numerals their serifs).
//
// At load every digit is rasterised once into a list of pixels near the
// line, each with its signed edge distance, its arc length along its route
// (so build, closure and trains are lookups) and its branch: flash tables.

const R_FILLET = 3;
export const HW = 2.5;          // half the line width: the lines are 5 px
export const REACH = 4.6;       // how far past the edge a pixel is kept (moat and glow)
const BAR_HALF = HW + 2;        // a terminus bar sticks out 2 px each side
const BAR_T = 1;                // and is 2 px thick
export const DW = 17, DH = 38;  // centre-line box

// routes: { pts, loop, ta, tb, on } ; ta / tb: a terminus bar at the start / end;
// on: [routeIndex, x, y]: the route starts on another route, its arc length continues from there.
const DIGITS = {
  0: [{ pts: [[8.5, 0], [11, 0], [17, 6], [17, 32], [11, 38], [6, 38], [0, 32], [0, 6], [6, 0]], loop: true }],
  1: [{ pts: [[3, 7], [10, 0], [10, 38]], tb: true, buttA: true }],
  2: [{ pts: [[0, 11], [0, 6], [6, 0], [11, 0], [17, 6], [17, 21], [0, 38], [17, 38]], ta: true, tb: true }],
  3: [
    { pts: [[0, 0], [11, 0], [17, 6], [17, 12], [12, 17], [5, 17]], ta: true, tb: true },
    { pts: [[12, 17], [17, 22], [17, 32], [11, 38], [0, 38]], tb: true, on: [0, 12, 17] },
  ],
  4: [{ pts: [[17, 26], [0, 26], [0, 12], [12, 0], [12, 38]], ta: true, tb: true }],
  5: [{ pts: [[17, 0], [0, 0], [0, 16], [11, 16], [17, 22], [17, 32], [11, 38], [0, 38]], ta: true, tb: true }],
  6: [{ pts: [[16, 0], [10, 0], [0, 10], [0, 32], [6, 38], [11, 38], [17, 32], [17, 23], [11, 17], [6, 17], [0, 23]], ta: true }],
  7: [{ pts: [[0, 0], [17, 0], [17, 5], [6, 16], [6, 38]], ta: true, tb: true }],
  8: [
    { pts: [[8.5, 17], [6, 17], [1, 12], [1, 5], [6, 0], [11, 0], [16, 5], [16, 12], [11, 17]], loop: true },
    { pts: [[8.5, 17], [11, 17], [17, 23], [17, 32], [11, 38], [6, 38], [0, 32], [0, 23], [6, 17]], loop: true, on: [0, 8.5, 17] },
  ],
  9: [{ pts: [[1, 38], [7, 38], [17, 28], [17, 6], [11, 0], [6, 0], [0, 6], [0, 15], [6, 21], [11, 21], [17, 15]], ta: true }],
};

/** A route's centre line as dense samples with arc length: fillets as arcs. */
function sampleRoute(rt) {
  const P = rt.loop ? [...rt.pts, rt.pts[0]] : rt.pts;
  const n = P.length;
  // corner k (interior vertex) is cut back by its tangent length and replaced by an arc
  const out = [];
  const push = (x, y) => {
    if (out.length) {
      const q = out[out.length - 1];
      if (Math.hypot(x - q[0], y - q[1]) < 1e-6) return;
    }
    out.push([x, y]);
  };
  const corner = (k) => {
    // returns [inPoint, outPoint, arcPoints] for vertex k
    const a = P[(k - 1 + n) % n], b = P[k], c = P[(k + 1) % n];
    const ux = b[0] - a[0], uy = b[1] - a[1], ul = Math.hypot(ux, uy);
    const vx = c[0] - b[0], vy = c[1] - b[1], vl = Math.hypot(vx, vy);
    const dux = ux / ul, duy = uy / ul, dvx = vx / vl, dvy = vy / vl;
    const cosT = dux * dvx + duy * dvy;
    const th = Math.acos(Math.max(-1, Math.min(1, cosT)));
    if (th < 1e-4) return null;
    const tl = Math.min(R_FILLET * Math.tan(th / 2), ul / 2 - 0.01, vl / 2 - 0.01);
    const r = tl / Math.tan(th / 2);
    const p0 = [b[0] - dux * tl, b[1] - duy * tl], p1 = [b[0] + dvx * tl, b[1] + dvy * tl];
    // centre: from p0 along the inward normal
    const cross = dux * dvy - duy * dvx, sgn = cross > 0 ? 1 : -1;
    const cx = p0[0] - duy * r * sgn, cy = p0[1] + dux * r * sgn;
    const a0 = Math.atan2(p0[1] - cy, p0[0] - cx);
    let a1 = Math.atan2(p1[1] - cy, p1[0] - cx);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const arc = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (da * i) / steps;
      arc.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return arc;
  };
  const last = rt.loop ? n - 1 : n - 1;
  push(P[0][0], P[0][1]);
  for (let k = 1; k < last; k++) {
    const arc = corner(k);
    if (!arc) { push(P[k][0], P[k][1]); continue; }
    for (const q of arc) push(q[0], q[1]);
  }
  if (rt.loop) {
    // the loop closes on the start point, which is mid-edge (collinear): no fillet there
    push(P[n - 1][0], P[n - 1][1]);
  } else push(P[n - 1][0], P[n - 1][1]);
  const s = [0];
  for (let i = 1; i < out.length; i++) s.push(s[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  return { pts: out, s, len: s[s.length - 1] };
}

function nearestOn(sm, x, y) {
  let best = Infinity, bs = 0;
  for (let i = 1; i < sm.pts.length; i++) {
    const [ax, ay] = sm.pts[i - 1], [bx, by] = sm.pts[i];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let u = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const ex = x - ax - u * dx, ey = y - ay - u * dy, d = Math.hypot(ex, ey);
    if (d < best) { best = d; bs = sm.s[i - 1] + u * Math.sqrt(l2); }
  }
  return [best, bs];
}

/** Distance to a route with butt ends at the open ends (the terminus bar caps them). */
function routeDist(sm, rt, x, y) {
  let best = Infinity, bs = 0;
  const m = sm.pts.length;
  for (let i = 1; i < m; i++) {
    const [ax, ay] = sm.pts[i - 1], [bx, by] = sm.pts[i];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let u = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
    if (u < 0) { if (i === 1 && !rt.loop && (rt.ta || rt.buttA)) continue; u = 0; }
    if (u > 1) { if (i === m - 1 && !rt.loop && rt.tb) continue; u = 1; }
    const ex = x - ax - u * dx, ey = y - ay - u * dy, d = Math.hypot(ex, ey);
    if (d < best) { best = d; bs = sm.s[i - 1] + u * Math.sqrt(l2); }
  }
  return [best, bs];
}

function barDist(px, py, ex, ey, tx, ty) {
  // a rectangle centred on (ex, ey), long axis along the normal (-ty, tx)
  const dx = px - ex, dy = py - ey;
  const along = Math.abs(dx * tx + dy * ty) - BAR_T, across = Math.abs(-dx * ty + dy * tx) - BAR_HALF;
  const ox = Math.max(along, 0), oy = Math.max(across, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(along, across), 0);
}

const CX = 8.5, CY = 19;

function buildDigit(ch) {
  const routes = DIGITS[ch];
  const sms = routes.map(sampleRoute);
  // arc-length offsets for routes that start on another route
  const off = routes.map(() => 0);
  routes.forEach((rt, k) => {
    if (rt.on) {
      const [ri, x, y] = rt.on;
      off[k] = off[ri] + nearestOn(sms[ri], x, y)[1];
    }
  });
  const total = Math.max(...sms.map((sm, k) => off[k] + sm.len));
  // terminus bars
  const bars = [];
  routes.forEach((rt, k) => {
    const sm = sms[k], P = sm.pts;
    if (rt.ta) {
      const [ax, ay] = P[0], [bx, by] = P[1], l = Math.hypot(bx - ax, by - ay);
      bars.push({ x: ax, y: ay, tx: (bx - ax) / l, ty: (by - ay) / l, s: off[k], k });
    }
    if (rt.tb) {
      const m = P.length, [ax, ay] = P[m - 2], [bx, by] = P[m - 1], l = Math.hypot(bx - ax, by - ay);
      bars.push({ x: bx, y: by, tx: (bx - ax) / l, ty: (by - ay) / l, s: off[k] + sm.len, k });
    }
  });
  // raster: pixel centres at (i + 0.5) in a box from -X0
  const X0 = 10, Y0 = 10, BWd = DW + 2 * X0 + 1, BHd = DH + 2 * Y0 + 1;
  const list = [];
  for (let j = 0; j < BHd; j++)
    for (let i = 0; i < BWd; i++) {
      const x = i - X0, y = j - Y0;           // centre-line coordinates of this pixel's centre
      let e = Infinity, s = 0, br = 0;
      routes.forEach((rt, k) => {
        const [d, ss] = routeDist(sms[k], rt, x, y);
        if (d - HW < e) { e = d - HW; s = off[k] + ss; br = k; }
      });
      for (const b of bars) {
        const d = barDist(x, y, b.x, b.y, b.tx, b.ty);
        if (d < e) { e = d; s = b.s; br = 255; }
      }
      if (e < REACH) list.push([i - X0, j - Y0, e, s, br]);
    }
  const n = list.length;
  const px = new Int8Array(n), py = new Int8Array(n), E = new Float32Array(n), S = new Float32Array(n), BR = new Uint8Array(n);
  list.forEach((p, q) => { px[q] = p[0]; py[q] = p[1]; E[q] = p[2]; S[q] = p[3]; BR[q] = p[4]; });

  // stations: on straight runs, ticks on the side with room
  const solidAt = (x, y) => {
    for (let k = 0; k < routes.length; k++) if (routeDist(sms[k], routes[k], x, y)[0] < HW + 1.6) return true;
    return false;
  };
  const stations = [];
  routes.forEach((rt, k) => {
    const P = rt.loop ? [...rt.pts, rt.pts[0]] : rt.pts;
    for (let i = 1; i < P.length; i++) {
      const [ax, ay] = P[i - 1], [bx, by] = P[i], l = Math.hypot(bx - ax, by - ay);
      if (l < 9) continue;
      const nSt = l > 20 ? 2 : 1;
      for (let q = 0; q < nSt; q++) {
        const u = (q + 1) / (nSt + 1);
        const x = ax + (bx - ax) * u, y = ay + (by - ay) * u;
        const tx = (bx - ax) / l, ty = (by - ay) / l;
        let nx = -ty, ny = tx;
        if (nx * (x - CX) + ny * (y - CY) < 0) { nx = -nx; ny = -ny; }
        const far = HW + 3.2;
        let ok = !solidAt(x + nx * far, y + ny * far);
        if (!ok) { nx = -nx; ny = -ny; ok = !solidAt(x + nx * far, y + ny * far); }
        if (!ok) continue;
        const [, ss] = nearestOn(sms[k], x, y);
        // keep clear of the ends and of each other
        if (!rt.loop && (ss < 5 || ss > sms[k].len - 5)) continue;
        stations.push({ br: k, s: ss, gs: off[k] + ss, x, y, nx, ny });
      }
    }
  });
  stations.sort((a, b) => a.gs - b.gs);
  return {
    ch, n, px, py, E, S, BR, total, stations,
    routes: routes.map((rt, k) => ({ loop: !!rt.loop, len: sms[k].len, off: off[k], ta: !!rt.ta, tb: !!rt.tb })),
  };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => buildDigit(String(d)));
