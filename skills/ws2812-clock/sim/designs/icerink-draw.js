// Raster primitives, skaters and the resurfacer for icerink. Everything
// draws into one linear-light RGB image (128 x 64) with coverage, so shapes
// sit between pixels and glide.
export const W = 128, H = 64;
export const img = new Float32Array(3 * W * H);
export const tmp = { x: 0, y: 0, h: 0, air: 0 };

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);

/** Add a soft dot (radius r px) of colour c * a. */
export function splat(x, y, r, c, a) {
  if (a <= 0) return;
  const x0 = Math.max(0, Math.ceil(x - r)), x1 = Math.min(W - 1, Math.floor(x + r));
  const y0 = Math.max(0, Math.ceil(y - r)), y1 = Math.min(H - 1, Math.floor(y + r));
  const ir2 = 1 / (r * r), c0 = c[0] * a, c1 = c[1] * a, c2 = c[2] * a;
  for (let py = y0; py <= y1; py++) {
    const dy = py - y, row = py * W;
    for (let px = x0; px <= x1; px++) {
      const dx = px - x, d2 = (dx * dx + dy * dy) * ir2;
      if (d2 >= 1) continue;
      const f = (1 - d2) * (1 - d2), p = 3 * (row + px);
      img[p] += c0 * f; img[p + 1] += c1 * f; img[p + 2] += c2 * f;
    }
  }
}

/** Paint a capsule a-b of radius rad over the image (opaque, by coverage). */
export function capsule(ax, ay, bx, by, rad, c, alpha = 1) {
  const reach = rad + 0.5;
  const x0 = Math.max(0, Math.ceil(Math.min(ax, bx) - reach)), x1 = Math.min(W - 1, Math.floor(Math.max(ax, bx) + reach));
  const y0 = Math.max(0, Math.ceil(Math.min(ay, by) - reach)), y1 = Math.min(H - 1, Math.floor(Math.max(ay, by) + reach));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, iL2 = L2 > 1e-9 ? 1 / L2 : 0;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      let t = ((px - ax) * dx + (py - ay) * dy) * iL2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - ax - t * dx, ey = py - ay - t * dy;
      const cov = reach - Math.sqrt(ex * ex + ey * ey);
      if (cov <= 0) continue;
      const k = (cov > 1 ? 1 : cov) * alpha, p = 3 * (py * W + px);
      img[p] += (c[0] - img[p]) * k; img[p + 1] += (c[1] - img[p + 1]) * k; img[p + 2] += (c[2] - img[p + 2]) * k;
    }
  }
}

/** Paint an axis-aligned rounded box [x0,x1] x [y0,y1] (px, edges between pixels). */
export function box(x0, y0, x1, y1, rr, c, alpha = 1) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = (x1 - x0) / 2, hy = (y1 - y0) / 2;
  const X0 = Math.max(0, Math.floor(x0)), X1 = Math.min(W - 1, Math.ceil(x1));
  const Y0 = Math.max(0, Math.floor(y0)), Y1 = Math.min(H - 1, Math.ceil(y1));
  for (let py = Y0; py <= Y1; py++) {
    for (let px = X0; px <= X1; px++) {
      const qx = Math.abs(px - cx) - hx + rr, qy = Math.abs(py - cy) - hy + rr;
      const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0;
      const sd = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - rr;
      const cov = 0.5 - sd;
      if (cov <= 0) continue;
      const k = (cov > 1 ? 1 : cov) * alpha, p = 3 * (py * W + px);
      img[p] += (c[0] - img[p]) * k; img[p + 1] += (c[1] - img[p + 1]) * k; img[p + 2] += (c[2] - img[p + 2]) * k;
    }
  }
}

/** Add a capsule of light (no occlusion): reflections in the mirror ice. */
export function capsuleAdd(ax, ay, bx, by, rad, c, gain, y0f = -1e9, fadeLen = 1e9) {
  const reach = rad + 0.5;
  const x0 = Math.max(0, Math.ceil(Math.min(ax, bx) - reach)), x1 = Math.min(W - 1, Math.floor(Math.max(ax, bx) + reach));
  const y0 = Math.max(0, Math.ceil(Math.min(ay, by) - reach)), y1 = Math.min(H - 1, Math.floor(Math.max(ay, by) + reach));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, iL2 = L2 > 1e-9 ? 1 / L2 : 0;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      let t = ((px - ax) * dx + (py - ay) * dy) * iL2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - ax - t * dx, ey = py - ay - t * dy;
      const cov = reach - Math.sqrt(ex * ex + ey * ey);
      if (cov <= 0) continue;
      const fd = 1 - (py - y0f) / fadeLen;
      if (fd <= 0) continue;
      const k = (cov > 1 ? 1 : cov) * gain * fd * fd, p = 3 * (py * W + px);
      const m = Math.max(img[p], img[p + 1], img[p + 2]);
      if (m > 0.25) continue;                         // a groove's own light wins
      img[p] += c[0] * k; img[p + 1] += c[1] * k; img[p + 2] += c[2] * k;
    }
  }
}

const BLACK = [0, 0, 0];
const S = (r, g, b) => [r, g, b];
const SKIN = S(0.5, 0.22, 0.12);
export const STYLE = {
  red:    { coat: S(0.6, 0.03, 0.02), back: S(0.32, 0.02, 0.01), s1: S(0.75, 0.55, 0.02), s2: S(0.6, 0.6, 0.55), hat: S(0.03, 0.14, 0.6), pom: S(0.7, 0.7, 0.7), legs: S(0.06, 0.08, 0.24), skin: SKIN },
  green:  { coat: S(0.03, 0.42, 0.08), back: S(0.02, 0.22, 0.04), s1: S(0.7, 0.04, 0.03), s2: S(0.65, 0.65, 0.6), hat: S(0.6, 0.05, 0.03), pom: S(0.75, 0.7, 0.6), legs: S(0.2, 0.12, 0.05), skin: SKIN },
  amber:  { coat: S(0.7, 0.3, 0.0), back: S(0.38, 0.15, 0.0), s1: S(0.05, 0.25, 0.7), s2: S(0.05, 0.5, 0.55), hat: S(0.35, 0.05, 0.5), pom: S(0.8, 0.7, 0.25), legs: S(0.06, 0.06, 0.2), skin: SKIN },
  rose:   { coat: S(0.7, 0.03, 0.26), back: S(0.4, 0.02, 0.14), hair: S(0.32, 0.1, 0.02), legs: S(0.55, 0.32, 0.26), skin: SKIN, glint: S(1, 0.7, 0.9) },
  teal:   { coat: S(0.0, 0.48, 0.42), back: S(0.0, 0.26, 0.22), hair: S(0.1, 0.06, 0.03), legs: S(0.05, 0.06, 0.16), skin: SKIN, glint: S(0.7, 1, 1) },
  gold:   { coat: S(0.7, 0.42, 0.02), back: S(0.4, 0.22, 0.0), hair: S(0.5, 0.33, 0.06), legs: S(0.55, 0.32, 0.26), skin: SKIN, glint: S(1, 0.9, 0.6) },
  violet: { coat: S(0.3, 0.05, 0.7), back: S(0.16, 0.02, 0.4), hair: S(0.07, 0.04, 0.03), legs: S(0.05, 0.05, 0.16), skin: SKIN, glint: S(0.85, 0.75, 1) },
};
const BLADE = S(0.45, 0.5, 0.55);

// parts of the current sprite: u (forward), v (height), radius, colour
const PU = new Float64Array(64 * 5), PC = new Array(64);
let np = 0;
const part = (u1, v1, u2, v2, r, c) => { const o = 5 * np; PU[o] = u1; PU[o + 1] = v1; PU[o + 2] = u2; PU[o + 3] = v2; PU[o + 4] = r; PC[np++] = c; };

/** Draw the collected parts at foot (x, y): reflection, keyline, then the figure. */
function flush(x, y, sx, k, lift, refl) {
  // mirror image in the black ice, flipped about the foot line
  if (refl > 0) {
    for (let i = 0; i < np; i++) {
      const o = 5 * i;
      capsuleAdd(x + sx * PU[o] * k, y + lift + PU[o + 1] * k, x + sx * PU[o + 2] * k, y + lift + PU[o + 3] * k, PU[o + 4] * k, PC[i], refl, y, 11 * k);
    }
  }
  for (let i = 0; i < np; i++) {
    const o = 5 * i;
    capsule(x + sx * PU[o] * k, y - lift - PU[o + 1] * k, x + sx * PU[o + 2] * k, y - lift - PU[o + 3] * k, PU[o + 4] * k + 0.8, BLACK, 0.85);
  }
  for (let i = 0; i < np; i++) {
    const o = 5 * i;
    capsule(x + sx * PU[o] * k, y - lift - PU[o + 1] * k, x + sx * PU[o + 2] * k, y - lift - PU[o + 3] * k, PU[o + 4] * k, PC[i]);
  }
  np = 0;
}

/**
 * A skater standing on the ice at foot point (x, y), drawn upright (the
 * floor is seen from above, people from the side, as in a top-down game).
 * h: heading on the ice; the figure faces left or right and foreshortens
 * as it turns. mode 0: public skater striding (ph = stride phase);
 * 1: figure skater in an arabesque on one edge; 2: upright spin / jump.
 * spin: extra turn angle (mode 2), lift: px in the air.
 */
export function skater(x, y, h, mode, k, ph, st, t, spin = 0, lift = 0, refl = 0.22) {
  let c = Math.cos(h + spin);
  const sx = c >= 0 ? Math.max(0.3, c) : Math.min(-0.3, c);
  np = 0;
  if (mode === 0) {
    const s = Math.sin(ph), pA = Math.max(0, s), pB = Math.max(0, -s);
    const w1 = Math.sin(t * 7 + x * 0.2), w2 = Math.sin(t * 7 - 1.3 + x * 0.2);
    part(1.9, 11.6, -1.0, 11.8 + 0.8 * w1, 0.75, st.s1);              // scarf tail, streaming
    part(-1.0, 11.8 + 0.8 * w1, -4.0, 11.2 + 1.5 * w2, 0.65, st.s2);
    for (const [p, col] of [[pB, st.back], [pA, st.legs]]) {
      const kn = [1.3 - 3.1 * p, 3.2 - 0.2 * p], ft = [0.6 - 5.4 * p, 0.4 + 1.2 * p];
      part(0, 6.2, kn[0], kn[1], 0.85, col === st.back ? st.legs : col);
      part(kn[0], kn[1], ft[0], ft[1], 0.8, col === st.back ? st.legs : col);
      part(ft[0] - 2.0, ft[1] - 0.5, ft[0] + 2.2, ft[1] - 0.5, 0.36, BLADE);
    }
    part(2.0, 10.3, 2.0 - 3.0 * s, 7.6, 0.75, st.back);               // far arm
    part(0, 6.2, 2.0, 10.8, 1.95, st.coat);                            // body, leaning in
    part(1.3, 11.6, 2.9, 11.9, 0.95, st.s1);                           // scarf wrap
    part(2.0, 10.3, 2.0 + 3.0 * s, 7.4 + 0.6 * Math.abs(s), 0.8, st.coat);
    part(2.9, 13.0, 2.9, 13.0, 1.75, st.skin);
    part(1.8, 14.2, 3.7, 14.2, 1.25, st.hat);
    part(2.4, 15.9, 2.4, 15.9, 0.8, st.pom);
  } else if (mode === 1) {
    const b = 0.4 * Math.sin(ph);
    part(0, 6.2, -3.2, 7.4 + b, 0.8, st.legs);                          // free leg, raised behind
    part(-3.2, 7.4 + b, -6.2, 8.8 + b, 0.7, st.legs);
    part(-7.4, 8.4 + b, -5.4, 9.6 + b, 0.35, BLADE);
    part(3.2, 8.8, -0.4, 11.0, 0.6, st.back);                           // far arm, back
    part(0, 6.2, 0.4, 3.2, 0.85, st.legs);                              // skating leg
    part(0.4, 3.2, 0.3, 0.4, 0.8, st.legs);
    part(-1.8, -0.1, 2.4, -0.1, 0.36, BLADE);
    part(-1.4, 6.6, 1.5, 5.6, 1.5, st.coat);                            // skirt
    part(0, 6.2, 3.4, 9.0, 1.7, st.coat);                               // body
    part(3.2, 8.8, 6.8, 10.2, 0.6, st.skin);                            // near arm, reaching
    part(4.6, 10.6, 4.6, 10.6, 1.6, st.skin);
    part(4.1, 11.7, 5.1, 11.9, 1.1, st.hair);
    part(3.6, 12.6, 3.6, 12.6, 0.95, st.hair);                          // bun
  } else {
    part(0, 6.2, 0.2, 0.4, 0.85, st.legs);
    part(0.2, 3.4, 1.4, 4.0, 0.7, st.legs);
    part(-1.8, -0.1, 2.0, -0.1, 0.36, BLADE);
    part(-2.0, 6.0, 2.0, 6.0, 1.4, st.coat);                            // skirt flares
    part(0, 6.4, 0, 11.0, 1.7, st.coat);
    part(0, 10.4, 1.7, 9.0, 0.6, st.skin);
    part(0, 10.4, -1.7, 9.0, 0.6, st.skin);
    part(0, 13.0, 0, 13.0, 1.6, st.skin);
    part(-0.6, 14.5, 0.6, 14.5, 1.0, st.hair);
  }
  flush(x, y, sx, k, lift, refl);
  // sequins catch the floods
  if (mode > 0) {
    const g = Math.sin(t * 23 + x) * Math.sin(t * 17 + y);
    if (g > 0.55) splat(x + sx * k * (g > 0.8 ? 1 : -1), y - lift - 7 * k, 1.1, st.glint, (g - 0.55) * 1.6);
  }
}

const ZWHITE = S(0.26, 0.28, 0.31), ZBLUE = S(0.02, 0.08, 0.5), ZGLASS = S(0.012, 0.03, 0.06);
const ZDARK = S(0.03, 0.03, 0.035), ZSTEEL = S(0.22, 0.24, 0.27), AMBER = S(1, 0.42, 0.02);
const HEAD = S(1, 0.85, 0.55), TOQUE = S(0.6, 0.05, 0.03), NAVY = S(0.03, 0.05, 0.2);
// front view of the resurfacer, as boxes [u0, v0, u1, v1, round] in px from the front-bottom centre
const ZBOX = [
  [-11.5, 0, -8, 4, 1, ZDARK], [8, 0, 11.5, 4, 1, ZDARK],
  [-11.5, 2, 11.5, 15, 2, ZWHITE], [-11.5, 8, 11.5, 10.5, 0.5, ZBLUE], [-10.5, 1.5, 10.5, 3.5, 0.8, ZSTEEL], [-4.5, 4, 4.5, 7, 0.8, ZDARK],
  [-9, 14, 9, 25, 1.5, ZWHITE], [-7, 15.5, 7, 23.5, 1, ZGLASS], [-5.5, 15.5, 0.5, 18.2, 1, NAVY], [-5, 17.6, 1, 18.4, 0.3, ZSTEEL],
  [-10, 24.5, 10, 26.5, 1, ZWHITE],
];

/**
 * The resurfacer driving down the sheet toward us: front-bottom at
 * (cx, nose); its conditioner blade is hidden behind it at nose - 22.
 */
export function zamboni(cx, nose, beacon, lit = 1) {
  // its turning amber beacon sweeps the black ice around it
  const bx = cx + 5, by = nose - 12, ca = Math.cos(beacon), sa = Math.sin(beacon);
  const lamp = 0.3 + 0.7 * Math.max(0, Math.cos(beacon - 0.6)) ** 2;
  const R0 = 26;
  const X0 = Math.max(0, Math.ceil(bx - R0)), X1 = Math.min(W - 1, Math.floor(bx + R0));
  const Y0 = Math.max(0, Math.ceil(by - R0)), Y1 = Math.min(H - 1, Math.floor(by + R0));
  for (let py = Y0; py <= Y1; py++) {
    for (let px = X0; px <= X1; px++) {
      const dx = px - bx, dy = (py - by) * 1.6, d = Math.sqrt(dx * dx + dy * dy);
      if (d >= R0 || d < 1) continue;
      const c = (dx * ca + dy * sa) / d;
      if (c <= 0.55) continue;
      const q = (c - 0.55) / 0.45, f = q * q * (1 - d / R0) * (1 - d / R0) * 0.1 * lit, p = 3 * (py * W + px);
      img[p] += AMBER[0] * f; img[p + 1] += AMBER[1] * f; img[p + 2] += AMBER[2] * f;
    }
  }
  // headlight pools on the ice ahead
  for (let i = 0; i < 4; i++) {
    const d = 3 + i * 3;
    splat(cx - 8 - i * 0.6, nose + d, 2 + i * 0.6, HEAD, 0.018 * (1 - i / 4) * lit);
    splat(cx + 8 + i * 0.6, nose + d, 2 + i * 0.6, HEAD, 0.018 * (1 - i / 4) * lit);
  }
  // its reflection, then the machine
  for (const [u0, v0, u1, v1, rr, c] of ZBOX) {
    const k = 0.15, cc = [c[0] * k, c[1] * k, c[2] * k];
    for (let py = Math.max(0, Math.ceil(nose + v0)); py <= Math.min(H - 1, nose + v1); py++)
      for (let px = Math.max(0, Math.ceil(cx + u0)); px <= Math.min(W - 1, cx + u1); px++) {
        const p = 3 * (py * W + px);
        if (Math.max(img[p], img[p + 1], img[p + 2]) > 0.25) continue;
        img[p] += cc[0]; img[p + 1] += cc[1]; img[p + 2] += cc[2];
      }
  }
  box(cx - 12.5, nose - 28.5, cx + 12.5, nose + 0.8, 3, BLACK, 0.9);
  for (const [u0, v0, u1, v1, rr, c] of ZBOX) box(cx + u0, nose - v1, cx + u1, nose - v0, rr, c);
  capsule(cx - 2.5, nose - 19.6, cx - 2.5, nose - 19.6, 1.6, SKIN);           // the driver
  capsule(cx - 3.3, nose - 21.2, cx - 1.7, nose - 21.2, 1.3, TOQUE);
  capsule(cx - 2.5, nose - 23, cx - 2.5, nose - 23, 0.7, S(0.7, 0.7, 0.65));
  for (const u of [-8, 8]) { capsule(cx + u, nose - 5.5, cx + u, nose - 5.5, 1.3, HEAD); splat(cx + u, nose - 5.5, 2.2, HEAD, 0.12 * lit); }
  capsule(cx + 5, nose - 27.6, cx + 5, nose - 27.6, 1.3, S(0.25 * lamp + 0.1, 0.11 * lamp + 0.03, 0.01));
  splat(cx + 5, nose - 27.6, 3, AMBER, 0.6 * lamp);
}
