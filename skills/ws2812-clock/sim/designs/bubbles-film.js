// Soap film optics for the bubbles face.
//
// FILM: thin-film interference colour vs optical thickness (nm), integrated
// over the visible spectrum with analytic CIE 1931 matching functions
// (Wyman, Sloan & Shirley 2013) under an equal-energy light, converted to
// linear sRGB. 0 nm is black film; ~200 white/straw; ~270 gold; ~300 magenta;
// ~350 blue; ~450 green; then the paler higher orders.
//
// vnoise: fast periodic value noise from a table (no per-call hashing).

export const STEP = 2, NT = 800;              // LUT: 0 .. 1598 nm, 2 nm a step
export const FILM = new Float32Array(3 * NT);

const g = (l, mu, s1, s2) => { const s = l < mu ? s1 : s2, t = (l - mu) / s; return Math.exp(-0.5 * t * t); };
const xb = (l) => 1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2);
const yb = (l) => 0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1);
const zb = (l) => 1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8);
const toRGB = (X, Y, Z) => [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];

(function build() {
  const n = 1.33, r0 = (n - 1) / (n + 1), r2 = r0 * r0;
  // white point of the flat spectrum, per channel, so a fully reflecting film is white
  let WX = 0, WY = 0, WZ = 0;
  for (let l = 380; l <= 780; l += 4) { WX += xb(l); WY += yb(l); WZ += zb(l); }
  const W = toRGB(WX, WY, WZ);
  let peak = 0;
  for (let k = 0; k < NT; k++) {
    const t = k * STEP;
    let X = 0, Y = 0, Z = 0;
    for (let l = 380; l <= 780; l += 4) {
      const d = (4 * Math.PI * n * t) / l, c = Math.cos(d);
      const R = (2 * r2 * (1 - c)) / (1 + r2 * r2 - 2 * r2 * c); // Airy reflectance of a free film
      X += R * xb(l); Y += R * yb(l); Z += R * zb(l);
    }
    const c = toRGB(X, Y, Z);
    for (let j = 0; j < 3; j++) FILM[3 * k + j] = Math.max(0, c[j] / W[j]);
    peak = Math.max(peak, 0.2126 * FILM[3 * k] + 0.7152 * FILM[3 * k + 1] + 0.0722 * FILM[3 * k + 2]);
  }
  // normalise, then lift saturation a little: real bubble colour on black velvet
  for (let k = 0; k < NT; k++) {
    let r = FILM[3 * k] / peak, gg = FILM[3 * k + 1] / peak, b = FILM[3 * k + 2] / peak;
    const L = 0.2126 * r + 0.7152 * gg + 0.0722 * b, s = 1.75;
    r = Math.max(0, L + (r - L) * s); gg = Math.max(0, L + (gg - L) * s); b = Math.max(0, L + (b - L) * s);
    FILM[3 * k] = r; FILM[3 * k + 1] = gg; FILM[3 * k + 2] = b;
  }
})();

/** LUT index for a thickness in nm. */
export const filmIdx = (nm) => { const k = (nm / STEP) | 0; return k < 0 ? 0 : k >= NT ? NT - 1 : k; };

// ------------------------------------------------------------------ noise
const NP = 64, TAB = new Float32Array(NP * NP);
for (let i = 0; i < NP * NP; i++) { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); TAB[i] = ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
/** Smooth value noise, period 64, range 0..1. */
export function vnoise(x, y) {
  const xf0 = Math.floor(x), yf0 = Math.floor(y);
  const fx = x - xf0, fy = y - yf0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const x0 = xf0 & 63, y0 = yf0 & 63, x1 = (x0 + 1) & 63, y1 = (y0 + 1) & 63;
  const a = TAB[y0 * NP + x0], b = TAB[y0 * NP + x1], c = TAB[y1 * NP + x0], d = TAB[y1 * NP + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
