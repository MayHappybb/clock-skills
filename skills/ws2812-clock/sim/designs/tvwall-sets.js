// The nine television sets: cabinets (static art) and, per pixel, which tube
// it belongs to and where it lands on that tube's picture after the barrel
// curve. Built once for the 192x192 raster.
import * as kit from '../js/kit.js';

const hex = kit.hex;
// tube: x0, y0, x1, y1 inside the 64x64 panel; ctl: where the knobs live
export const SETS = [
  { mat: 'walnut', tube: [4, 5, 47, 52], ctl: 'right', cast: [1.05, 0.95, 0.82] },
  { mat: 'cream', tube: [5, 4, 58, 46], ctl: 'bottom', cast: [0.8, 1.08, 0.82] },
  { mat: 'black', tube: [4, 4, 49, 53], ctl: 'right', cast: [0.95, 0.97, 1.08] },
  { mat: 'teak', tube: [6, 5, 57, 47], ctl: 'bottom', cast: [1.0, 0.92, 0.86] },
  { mat: 'silver', tube: [4, 4, 59, 50], ctl: 'bottom', cast: [1, 1, 1] },
  { mat: 'red', tube: [13, 4, 58, 52], ctl: 'left', cast: [1.06, 0.88, 1.0] },
  { mat: 'walnut', tube: [5, 6, 49, 54], ctl: 'right', cast: [1.0, 0.95, 0.9] },
  { mat: 'cream', tube: [6, 5, 57, 48], ctl: 'bottom', cast: [0.92, 0.98, 1.1] },
  { mat: 'black', tube: [5, 12, 50, 57], ctl: 'right', cast: [1, 1, 1], ears: true },
];
const MAT = {
  walnut: { c: hex('#5a3015'), grain: 0.45 },
  teak: { c: hex('#7a4a22'), grain: 0.35 },
  cream: { c: hex('#8a7f66'), grain: 0 },
  black: { c: hex('#26262a'), grain: 0 },
  silver: { c: hex('#55595f'), grain: 0 },
  red: { c: hex('#7a1c18'), grain: 0 },
};
const P = 4.2; // superellipse power of the tube face

let S = null;
export function build(G) {
  if (S && S.w === G.w) return S;
  const w = G.w, h = G.h, N = w * h;
  const tv = new Int8Array(N).fill(-1), U = new Float32Array(N), V = new Float32Array(N);
  const cov = new Float32Array(N), vig = new Float32Array(N), cab = new Float32Array(3 * N);
  const meta = [];
  for (let s = 0; s < 9; s++) {
    const d = SETS[s], ox = (s % 3) * 64, oy = Math.floor(s / 3) * 64;
    const [x0, y0, x1, y1] = d.tube;
    const cx = ox + (x0 + x1 + 1) / 2, cy = oy + (y0 + y1 + 1) / 2, hx = (x1 - x0 + 1) / 2, hy = (y1 - y0 + 1) / 2;
    meta.push({ cx, cy, hx, hy, ox, oy, rows: y1 - y0 + 1 });
    const m = MAT[d.mat];
    for (let y = oy; y < oy + 64; y++) for (let x = ox; x < ox + 64; x++) {
      const p = y * w + x, lx = x - ox, ly = y - oy;
      const sx = (x + 0.5 - cx) / hx, sy = (y + 0.5 - cy) / hy;
      const r = (Math.abs(sx) ** P + Math.abs(sy) ** P) ** (1 / P);
      const edgePx = (1 - r) * Math.min(hx, hy);          // px inside the tube edge
      // ---- cabinet
      let c = m.c, k = 1;
      if (m.grain) k = 1 - m.grain * 0.5 + m.grain * 0.5 * Math.sin(ly * 0.55 + 5 * kit.noise2(lx * 0.08 + s * 7, ly * 0.5));
      if (d.mat === 'silver') k = 0.7 + 0.5 * (1 - ly / 64);
      if (d.mat === 'cream' || d.mat === 'red') k = 0.85 + 0.25 * (1 - ly / 64);
      // chrome trim ring and dark mask just outside the glass
      let add = 0;
      if (edgePx < 0 && edgePx > -1.2) { k = 0.05; }
      else if (edgePx <= -1.2 && edgePx > -2.4) { c = hex('#9aa0a8'); k = 0.55; }
      // knobs
      const knob = (kx, ky, kr) => {
        const dd = Math.hypot(lx + 0.5 - kx, ly + 0.5 - ky);
        if (dd < kr + 0.5) {
          const inner = dd < kr - 0.8;
          c = inner ? hex('#3a3a3c') : hex('#b9b9b0'); k = inner ? 1 : 0.6;
          const hl = Math.hypot(lx + 0.5 - (kx - kr * 0.35), ly + 0.5 - (ky - kr * 0.35));
          if (hl < kr * 0.35) add = 0.25 * (1 - hl / (kr * 0.35));
        }
      };
      if (d.ctl === 'right') {
        const kx = (x1 + 64) / 2 + 0.5;
        knob(kx, y0 + 9, 4.2); knob(kx, y0 + 21, 3.2);
        if (ly > y0 + 29 && ly < y1 - 1 && Math.abs(lx + 0.5 - kx) < 4.5 && ly % 3 === 0) { c = hex('#111111'); k = 1; }
      } else if (d.ctl === 'left') {
        const kx = x0 / 2;
        knob(kx, y0 + 8, 3.6); knob(kx, y0 + 19, 2.8);
        if (ly > y0 + 27 && ly < y1 - 1 && Math.abs(lx + 0.5 - kx) < 3.5 && ly % 3 === 0) { c = hex('#111111'); k = 1; }
      } else {
        const ky = (y1 + 64) / 2 + 0.5;
        knob(x0 + 6, ky, 3.6); knob(x0 + 15, ky, 3.0);
        if (lx > x0 + 22 && lx < x1 - 2 && Math.abs(ly + 0.5 - ky) < 3.5 && lx % 3 === 0) { c = hex('#111111'); k = 1; }
      }
      if (d.ears && ly < 9) {   // rabbit-ear antenna on the portable
        c = [0, 0, 0]; k = 0;
        const e1 = kit.segDist(lx + 0.5, ly + 0.5, 28, 10, 14, -2), e2 = kit.segDist(lx + 0.5, ly + 0.5, 30, 10, 47, -2);
        const e = Math.min(e1, e2);
        if (e < 1.0) { c = hex('#b0b4ba'); k = 0.6 * (1 - e); }
        if (Math.hypot(lx + 0.5 - 29, ly + 0.5 - 9.5) < 3) { c = hex('#2a2a2a'); k = 1; }
      }
      // a dark seam where one cabinet sits on the next
      if (lx === 0 || ly === 0 || lx === 63 || ly === 63) k *= 0.15;
      for (let ch = 0; ch < 3; ch++) cab[3 * p + ch] = c[ch] * k + add;
      if (edgePx > -0.5) {
        tv[p] = s;
        cov[p] = Math.min(1, edgePx + 0.5);
        // barrel: the picture bulges toward the glass edge, a little overscan
        U[p] = 0.5 + 0.5 * sx * (1 + 0.07 * sy * sy) * 0.96;
        V[p] = 0.5 + 0.5 * sy * (1 + 0.07 * sx * sx) * 0.96;
        vig[p] = 1 - 0.45 * kit.smoothstep(0.55, 1.0, r);
      }
    }
  }
  S = { w, h, tv, U, V, cov, vig, cab, meta };
  return S;
}
