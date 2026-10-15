// Etch A Sketch numerals. Each digit is ONE stylus excursion that leaves the
// ground line at its foot, runs the whole figure as a single 1-px line (the
// thin pass, retracing itself where a stroke dead-ends), and comes back
// along the same route; the way back is the retrace that thickens it to the
// bold 3-px line. The letterforms use only what two knobs draw well: long
// straight runs, 45-degree staircases and quarter-round corners of one
// radius, so the set is squarish, like every careful Etch A Sketch numeral.
//
// Coordinates are skeleton pixels in a box X+1 wide, Y+1 tall; (ex, Y) is
// the foot, where the excursion leaves and rejoins the ground.

import { hash } from '../js/kit.js';
import { Route, dilate } from './etchasketch-line.js';

function digitRoute(d, X, Y, rc) {
  const cx = Math.round(X / 2);
  let r, m;
  switch (d) {
    case 0:
      r = new Route(cx, Y).to(rc, Y).arc(rc, Y - rc, rc, rc, 90, 180).to(0, rc).arc(rc, rc, rc, rc, 180, 270)
        .to(X - rc, 0).arc(X - rc, rc, rc, rc, 270, 360).to(X, Y - rc).arc(X - rc, Y - rc, rc, rc, 0, 90).to(cx, Y);
      return { r, ex: cx };
    case 1: {
      const x = Math.round(X * 0.56), k = Math.round(X * 0.3), f = Math.round(X * 0.34);
      r = new Route(x, Y).to(x - k, Y).to(x + k, Y).to(x, Y).to(x, 0).to(x - f, f);
      return { r, ex: x };
    }
    case 2: {
      const yd = Y - X;   // a true 45-degree stair from the base to the right side
      r = new Route(X, Y).to(0, Y).to(X, yd).to(X, rc).arc(X - rc, rc, rc, rc, 0, -90).to(rc, 0)
        .arc(rc, rc, rc, rc, -90, -180).to(0, rc + 3);
      return { r, ex: X };
    }
    case 3: {
      const ym = Math.round(Y * 0.47), ru = Math.min(rc, Math.floor(ym / 2));
      r = new Route(cx, Y).to(rc, Y).arc(rc, Y - rc, rc, rc, 90, 180).to(0, Y - rc - 2);
      r.back(r.pts.length - 1);
      r.to(X - rc, Y).arc(X - rc, Y - rc, rc, rc, 90, 0).to(X, ym + rc).arc(X - rc, ym + rc, rc, rc, 0, -90)
        .to(Math.round(X * 0.3), ym).to(X - ru, ym).arc(X - ru, ym - ru, ru, ru, 90, 0).to(X, ru)
        .arc(X - ru, ru, ru, ru, 0, -90).to(ru, 0).arc(ru, ru, ru, ru, -90, -180).to(0, ru + 2);
      return { r, ex: cx };
    }
    case 4: {
      const sx = Math.round(X * 0.7), by = Math.round(Y * 0.66);
      r = new Route(sx, Y).to(sx, Math.round(Y * 0.2)).to(sx, by).to(X, by).to(0, by).to(0, 0);
      return { r, ex: sx };
    }
    case 5: {
      const by = Math.round(Y * 0.42);
      r = new Route(cx, Y).to(rc, Y).arc(rc, Y - rc, rc, rc, 90, 180).to(0, Y - rc - 2);
      r.back(r.pts.length - 1);
      r.to(X - rc, Y).arc(X - rc, Y - rc, rc, rc, 90, 0).to(X, by + rc).arc(X - rc, by + rc, rc, rc, 0, -90)
        .to(0, by).to(0, 0).to(X, 0);
      return { r, ex: cx };
    }
    case 6: {
      const by = Math.round(Y * 0.46);
      r = new Route(cx, Y).to(rc, Y).arc(rc, Y - rc, rc, rc, 90, 180).to(0, by);
      m = r.mark();
      r.to(0, rc).arc(rc, rc, rc, rc, 180, 270).to(X - rc, 0).arc(X - rc, rc, rc, rc, 270, 320);
      r.backTo(m);
      r.to(X - rc, by).arc(X - rc, by + rc, rc, rc, -90, 0).to(X, Y - rc).arc(X - rc, Y - rc, rc, rc, 0, 90).to(cx, Y);
      return { r, ex: cx };
    }
    case 7: {
      const sx = Math.round(X * 0.28);
      r = new Route(sx, Y).to(sx, Math.round(Y * 0.72)).to(X, Math.round(X * 0.25)).to(X, 0).to(0, 0).to(0, 4);
      return { r, ex: sx };
    }
    case 8: {
      const ym = Math.round(Y * 0.44), i = 1, ru = Math.min(rc, Math.floor(ym / 2));
      r = new Route(cx, Y).to(X - rc, Y).arc(X - rc, Y - rc, rc, rc, 90, 0).to(X, ym + rc)
        .arc(X - rc, ym + rc, rc, rc, 0, -90).to(i + ru, ym).arc(i + ru, ym - ru, ru, ru, 90, 180).to(i, ru)
        .arc(i + ru, ru, ru, ru, 180, 270).to(X - i - ru, 0).arc(X - i - ru, ru, ru, ru, 270, 360).to(X - i, ym - ru)
        .arc(X - i - ru, ym - ru, ru, ru, 0, 90).to(rc, ym).arc(rc, ym + rc, rc, rc, -90, -180).to(0, Y - rc)
        .arc(rc, Y - rc, rc, rc, 180, 90).to(cx, Y);
      return { r, ex: cx };
    }
    case 9: {
      const by = Math.round(Y * 0.56);
      r = new Route(cx, Y).to(rc, Y).arc(rc, Y - rc, rc, rc, 90, 180).to(0, Y - rc - 2);
      r.back(r.pts.length - 1);
      r.to(X - rc, Y).arc(X - rc, Y - rc, rc, rc, 90, 0).to(X, rc).arc(X - rc, rc, rc, rc, 0, -90).to(rc, 0)
        .arc(rc, rc, rc, rc, -90, -180).to(0, by - rc).arc(rc, by - rc, rc, rc, 180, 90).to(X, by);
      return { r, ex: cx };
    }
  }
}

/**
 * One digit at one size, as an Etch A Sketch block numeral. The thin pass F
 * is the skeleton route (1 px). The bold figure is that line plus a double
 * rim drawn round it at 2-3 px (Chebyshev) on the retrace: an inline block
 * letter, the way a careful Etch A Sketch hand thickens a line by going
 * round it. Box-relative pixel lists [x, y, ...]; the box is R wider than
 * the skeleton on every side, so the bold figure is (X + 1 + 2R) wide.
 *   ink[i]  the bold pixels, with
 *   idx[i]  the nearest skeleton index (the retrace reveals it as it passes)
 *   thr[i]  the dissolve order (powder re-coating it), 0..255
 */
export function makeGlyph(d, X, Y, rc, q = 1, R = 3) {
  Route.q = q;
  const { r, ex } = digitRoute(d, X, Y, rc);
  Route.q = 1;
  const F0 = r.pixels();
  const F = new Int16Array(F0.length);
  for (let i = 0; i < F0.length; i += 2) { F[i] = F0[i] + R; F[i + 1] = F0[i + 1] + R; }
  const n = F.length / 2, bw = X + 1 + 2 * R, bh = Y + 1 + 2 * R;
  const dist = new Uint8Array(bw * bh).fill(255), near = new Uint16Array(bw * bh);
  for (let j = 0; j < n; j++) {
    const fx = F[2 * j], fy = F[2 * j + 1];
    for (let y = fy - R; y <= fy + R; y++) for (let x = fx - R; x <= fx + R; x++) {
      const k = y * bw + x, dd = Math.max(Math.abs(x - fx), Math.abs(y - fy));
      if (dd < dist[k]) { dist[k] = dd; near[k] = j; }
    }
  }
  const ink = [], idx = [], thr = [];
  for (let k = 0; k < bw * bh; k++) {
    const dd = dist[k];
    if (dd === 1 || dd > R) continue;
    const x = k % bw, y = (k / bw) | 0;
    ink.push(x, y); idx.push(near[k]); thr.push(hash(x, y, d * 37 + X) & 255);
  }
  return { d, n, F, ex: ex + R, w: bw, h: bh, ink: Int16Array.from(ink), idx: Uint16Array.from(idx), thr: Uint8Array.from(thr) };
}
