// Marbling: the numerals as stylus paths in the bath.
//
// Each digit is one or two centre lines (the path the marbler's stylus
// draws), in a unit box (x right, y down). Paint is laid along them as a
// row of drops and pulled into a chain of hearts, so the letterform is the
// path itself: a clean line with open counters, swelling to a round drop
// where an open line starts and drawn out to a tail where the stylus left
// the bath (the width table below). All ten are drawn as a set: oval bowls
// a little narrower at the top, a flagged 1 without a foot, a closed 4 with
// its apex on the stem (no peak, so never an 'A') and a low bar for a big
// counter, a 7 with a straight bar and an almost straight stem (no round
// drop at its start, so its dotted stage never reads '?'), an 8 of two loops
// that kiss at the waist.
//
// pathMap() turns a digit at a size into a per-pixel map of its box (plus a
// small margin), 5 bytes a pixel (see below). It is built the way the device
// builds it, by brushing each segment over its own neighbourhood (`visits`
// counts that work), into one buffer per slot, in place, in the half second
// between the old digit's last paint leaving and the new one's first drop.

const P = (x, y) => [x, y];

function arc(cx, cy, rx, ry, a0, a1, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    out.push(P(cx + rx * Math.cos(a), cy + ry * Math.sin(a)));
  }
  return out;
}

function bez(p0, p1, p2, p3, n = 10) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push(P(u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]));
  }
  return out;
}

function line(a, b, n = 3) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(P(a[0] + (b[0] - a[0]) * (i / n), a[1] + (b[1] - a[1]) * (i / n)));
  return out;
}

/** Join pieces into one polyline, dropping repeated joints. */
function join(...parts) {
  const out = [];
  for (const p of parts) for (const q of p) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 1e-6) out.push(q);
  }
  return out;
}

const SIX = join(
  bez(P(0.86, 0.03), P(0.42, -0.04), P(0.0, 0.2), P(0.0, 0.66)),
  arc(0.5, 0.68, 0.5, 0.32, 180, -180, 30),
);
const C2 = 35 * Math.PI / 180;

/** Each digit: a list of paths { pts, closed, swell, tail, order (drops land in stroke order) }. */
export const PATHS = {
  0: [{ pts: arc(0.5, 0.5, 0.5, 0.5, -90, -450, 36), closed: true }],
  1: [{ pts: join(bez(P(0.1, 0.24), P(0.3, 0.16), P(0.48, 0.08), P(0.6, 0.0)), line(P(0.6, 0.0), P(0.6, 1.0))), tail: 0.75 }],
  2: [{ pts: join(arc(0.5, 0.27, 0.49, 0.27, 175, 395, 20), bez(P(0.5 + 0.49 * Math.cos(C2), 0.27 + 0.27 * Math.sin(C2)), P(0.7, 0.62), P(0.25, 0.8), P(0.0, 1.0)), line(P(0.0, 1.0), P(1.0, 1.0))) }],
  3: [{ pts: join(arc(0.5, 0.25, 0.45, 0.25, 205, 465, 20), arc(0.5, 0.73, 0.5, 0.27, 255, 520, 22)) }],
  4: [{ pts: join(line(P(0.8, 1.0), P(0.8, 0.0)), bez(P(0.8, 0.0), P(0.5, 0.2), P(0.1, 0.5), P(-0.04, 0.7)), line(P(-0.04, 0.7), P(1.04, 0.7))) }],
  5: [{ pts: join(line(P(0.92, 0.0), P(0.14, 0.0)), line(P(0.14, 0.0), P(0.09, 0.45)), arc(0.48, 0.68, 0.5, 0.32, 226, 520, 24)) }],
  6: [{ pts: SIX, tail: 1 }],
  7: [{ pts: join(line(P(0.0, 0.0), P(1.0, 0.0)), bez(P(1.0, 0.0), P(0.8, 0.3), P(0.52, 0.66), P(0.4, 1.0))), swell: 1, order: true }],
  8: [{ pts: arc(0.5, 0.245, 0.42, 0.245, -90, 270, 28), closed: true }, { pts: arc(0.5, 0.72, 0.5, 0.28, -90, -450, 32), closed: true }],
  9: [{ pts: SIX.map(([x, y]) => P(1 - x, 1 - y)).reverse(), swell: 1 }],
};

export const MARGIN = 5;       // a map covers its slot's box and this much round it
const REACH = 10.5;            // a segment is brushed this far (the drops' ripples reach about this far)

/** The centre lines of digit ch in a w x h box (box pixels), as segments with arc lengths. */
function geometry(ch, w, h, inset) {
  const paths = PATHS[ch];
  const cw = w - 2 * inset, chh = h - 2 * inset;
  const segs = [], lens = [], starts = [];
  let total = 0;
  paths.forEach((p, pi) => {
    const pts = p.pts.map(([x, y]) => [inset + x * cw, inset + y * chh]);
    if (p.closed) pts.push(pts[0]);
    let acc = 0;
    starts.push(total);
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = Math.hypot(bx - ax, by - ay);
      if (L < 1e-6) continue;
      segs.push({ ax, ay, bx, by, L, s0: acc, gs0: total + acc, pi });
      acc += L;
    }
    lens.push(acc);
    total += acc;
  });
  return { paths, segs, lens, starts, total };
}

/**
 * The stroke's width along a path, per px of arc length: an open path starts
 * as a round drop (swell) and ends where the stylus left the bath in a
 * drawn-out tail, as a pulled drop does.
 */
function widths(p, L, hw) {
  const n = Math.ceil(L) + 2, wt = new Float32Array(n);
  const sw = p.closed ? 1 : p.swell ?? 1.2, tl = p.closed ? 1 : p.tail ?? 0.42;
  const tlen = Math.min(0.32 * L, 3.6 * hw);
  for (let k = 0; k < n; k++) {
    const a = k / (2.2 * hw), b = (L - k) / tlen;
    let f = 1 + (sw - 1) * (a < 1 ? 0.5 + 0.5 * Math.cos(Math.PI * a) : 0);
    if (b < 1) { const u = b < 0 ? 0 : b; f *= tl + (1 - tl) * u * u * (3 - 2 * u); }
    wt[k] = f;
  }
  return wt;
}

/** Brush one segment's distance into (d2, s) over its neighbourhood; returns pixels visited. */
function brush(g, mw, mh, ox, oy, d2, sOut, pOut, nOut, reach) {
  const x0 = Math.max(0, Math.floor(Math.min(g.ax, g.bx) - reach - ox)), x1 = Math.min(mw - 1, Math.ceil(Math.max(g.ax, g.bx) + reach - ox));
  const y0 = Math.max(0, Math.floor(Math.min(g.ay, g.by) - reach - oy)), y1 = Math.min(mh - 1, Math.ceil(Math.max(g.ay, g.by) + reach - oy));
  const dx = g.bx - g.ax, dy = g.by - g.ay, il2 = 1 / (g.L * g.L);
  let n = 0;
  for (let j = y0; j <= y1; j++)
    for (let i = x0; i <= x1; i++) {
      n++;
      const px = i + ox + 0.5, py = j + oy + 0.5;
      let u = ((px - g.ax) * dx + (py - g.ay) * dy) * il2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const qx = g.ax + u * dx, qy = g.ay + u * dy, e = (px - qx) * (px - qx) + (py - qy) * (py - qy);
      const k = j * mw + i;
      if (e < d2[k]) {
        d2[k] = e; sOut[k] = g.s0 + u * g.L; pOut[k] = g.pi;
        if (nOut) { nOut[2 * k] = qx; nOut[2 * k + 1] = qy; }
      }
    }
  return n;
}

/**
 * The map of digit ch in a w x h box: the box plus MARGIN on every side.
 * Per pixel: e, the distance to the centre line divided by the stroke's
 * width factor there (a byte, 1/8 px, 255 = far); s, the arc length along
 * the line (uint16, 1/32 px, the top bit the path); pu, how far the paint
 * has pushed the stones there (two int8, 1/16 px). 5 bytes a pixel.
 * pushFn(e) gives the push at rest distance e. `visits` counts the build.
 */
export function pathMap(ch, w, h, hw, inset, pushFn) {
  const G = geometry(ch, w, h, inset);
  const mw = w + 2 * MARGIN, mh = h + 2 * MARGIN, n = mw * mh;
  const d2 = new Float32Array(n).fill(1e9), sf = new Float32Array(n), pf = new Uint8Array(n), nq = new Float32Array(2 * n);
  let visits = 0;
  for (const g of G.segs) visits += brush(g, mw, mh, -MARGIN, -MARGIN, d2, sf, pf, nq, REACH);
  const width = G.paths.map((p, i) => widths(p, G.lens[i], hw));
  const e = new Uint8Array(n).fill(255), s = new Uint16Array(n), pu = new Int8Array(2 * n);
  for (let k = 0; k < n; k++) {
    if (d2[k] > 1e8) continue;
    const dd = Math.sqrt(d2[k]), wt = width[pf[k]], wf = wt[Math.min(wt.length - 1, sf[k] | 0)], er = dd / wf;
    e[k] = Math.min(254, Math.round(er * 8));
    s[k] = Math.min(32767, Math.round(sf[k] * 32)) | (pf[k] << 15);
    if (dd > 1e-4) {
      const px = (k % mw) - MARGIN + 0.5, py = ((k / mw) | 0) - MARGIN + 0.5, push = pushFn(er) * wf;
      pu[2 * k] = Math.max(-127, Math.min(127, Math.round(((px - nq[2 * k]) / dd) * push * 16)));
      pu[2 * k + 1] = Math.max(-127, Math.min(127, Math.round(((py - nq[2 * k + 1]) / dd) * push * 16)));
    }
  }
  return {
    w: mw, h: mh, e, s, pu, lens: G.lens, starts: G.starts, total: G.total, segs: G.segs, visits, width,
    closed: G.paths.map((p) => !!p.closed), order: G.paths.map((p) => !!p.order),
  };
}

/** The point at global arc length s along a map's centre lines (box pixels). */
export function pointAt(m, s) {
  for (const g of m.segs) {
    if (s <= g.gs0 + g.L) {
      const u = Math.max(0, Math.min(1, (s - g.gs0) / g.L));
      return [g.ax + (g.bx - g.ax) * u, g.ay + (g.by - g.ay) * u];
    }
  }
  const g = m.segs[m.segs.length - 1];
  return [g.bx, g.by];
}

