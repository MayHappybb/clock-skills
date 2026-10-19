// Bubbler: the whole 128x192 portrait assembly is a 1946-style jukebox, chrome
// arch and lit dome on top, and the time is bent from its famous bubble
// tubes: glowing coloured liquid in glass, bubbles streaming through every
// numeral. Hours in the amber of the arch, minutes in the colour of the label
// of the record now playing.
//
// Always alive: bubbles flow through every tube and up the side pilasters,
// colour drifts round the arch, the 45 spins (its label turns, the sheen on
// the grooves stays put), the grille throbs with the beat, the arm rides.
// Minute: an unseen customer flips a coin into the slot; the arm lifts, the
// record rises and goes back into the carousel, the carousel turns one slot
// and the next record is laid on the platter. The changing tube drains (its
// level falls, the empty glass stays), and when the needle lands the new
// numeral fills from the bottom with the new record's colour; an unchanged
// minute tube takes the new dye as a front flowing along the glass.
// Hour: the hit record. The whole cabinet bounces to the beat, the arch
// chases, the carousel whirls, the tubes boil and notes fly out of the grille.
import * as kit from '../js/kit.js';
import { buildField } from './jukebox-art.js';

const W = 128, H = 192, N = W * H;
const clamp = kit.clamp, ease = kit.ease;
const img = new Float32Array(3 * N), bg = new Float32Array(3 * N), fin = new Float32Array(3 * N);

// ------------------------------------------------------------- palette
const AMBER = kit.hex('#ff9a12'), CHERRY = kit.hex('#ff1844'), TURQ = kit.hex('#10e0c0');
const LEMON = kit.hex('#ffd83a'), VIOLET = kit.hex('#9a5cff'), LIME = kit.hex('#8cff28');
const CHROME = kit.hex('#c8d2ff'), GOLD = kit.hex('#ffc848'), WARM = kit.hex('#ff8a3a');
const ARCHPAL = [AMBER, CHERRY, VIOLET, TURQ, LEMON];
const MCOL = [CHERRY, TURQ, LIME, VIOLET];             // record label / minute liquid colours
const mcol = (m) => MCOL[((m % 4) + 4) % 4];

/** Cyclic palette blend, u in turns. */
function archCol(u, out) {
  const n = ARCHPAL.length, x = kit.fract(u) * n, i = Math.floor(x), f = x - i;
  const a = ARCHPAL[i % n], b = ARCHPAL[(i + 1) % n], s = f * f * (3 - 2 * f);
  out[0] = a[0] + (b[0] - a[0]) * s; out[1] = a[1] + (b[1] - a[1]) * s; out[2] = a[2] + (b[2] - a[2]) * s;
  return out;
}

// ------------------------------------------------------------- geometry
const AX = 63.5, AY = 62;                // arch centre
const R_OUT = 62, R_IN = 50;             // arch band
const PIL = [7, 120.5];                  // pilaster tube centres x
const PIL_R = 2.6;
// a 1950s logo stagger: the hours ride high on the left, the minutes big and low on the right
const HSLOT = [{ cx: 29, cy: 90, w: 25, h: 39, r: 3.0, tilt: 0, slant: 0.12 }, { cx: 60, cy: 90, w: 25, h: 39, r: 3.0, tilt: 0, slant: 0.12 }];
const MSLOT = [{ cx: 53, cy: 152, w: 32, h: 56, r: 3.6, tilt: 0, slant: 0.12 }, { cx: 91, cy: 152, w: 32, h: 56, r: 3.6, tilt: 0, slant: 0.12 }];
const MAN_Y = [115, 115, 186, 186];        // the chrome manifold each slot's feed pipe drops into
const SLOTS = [HSLOT[0], HSLOT[1], MSLOT[0], MSLOT[1]];
const fields = new Map();
function field(slot, g) {
  const k = slot * 10 + g;
  let f = fields.get(k);
  if (!f) { f = buildField(g, SLOTS[slot], W, H, 4); fields.set(k, f); }
  return f;
}
for (let sl = 0; sl < 4; sl++) for (let g = 0; g < 10; g++) field(sl, g);   // build every tube up front: no first-use spike

// Arch per-pixel coordinates (static)
const archU = new Float32Array(N).fill(-1);   // 0..1 along the arch (left base to right base), -1 outside
const archV = new Float32Array(N);            // 0..1 across the band (inner to outer)
const domeM = new Float32Array(N);            // inside the dome window (coverage)
const grilleG = new Float32Array(N);          // grille lattice light
const pilM = new Float32Array(N);             // pilaster tube: signed x offset / r, or 9

function chromeAt(i, a) { bg[3 * i] += CHROME[0] * a; bg[3 * i + 1] += CHROME[1] * a; bg[3 * i + 2] += CHROME[2] * a; }
(function buildStatic() {
  pilM.fill(9);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, dx = x - AX, dy = y - AY, r = Math.hypot(dx, dy);
    if (y <= AY) {
      // arch band and its chrome rims
      if (r >= R_IN && r <= R_OUT + 0.5) {
        const ang = Math.atan2(dy, dx);                     // -PI (left) .. 0 (right) through -PI/2 (top)
        archU[p] = (ang + Math.PI) / Math.PI;
        archV[p] = (r - R_IN) / (R_OUT - R_IN);
      }
      const rimO = Math.exp(-(((r - R_OUT - 0.6) / 0.6) ** 2)), rimI = Math.exp(-(((r - R_IN + 0.8) / 0.55) ** 2));
      chromeAt(p, 0.10 * rimO + 0.07 * rimI);
      domeM[p] = clamp(R_IN - 2 - r) * clamp(AY - 1 - y);
      // glass reflection: a thin curved highlight inside the dome, upper left
      const rr = Math.hypot(dx + 6, dy + 4);
      if (r < R_IN - 3 && dx < -4 && dy < -18) chromeAt(p, 0.018 * Math.exp(-(((rr - 40) / 0.7) ** 2)));
    } else {
      // pilasters
      for (const cx of PIL) {
        const o = x - cx;
        if (Math.abs(o) < PIL_R + 2.5 && y < 186) {
          pilM[p] = o / PIL_R;
          chromeAt(p, 0.06 * Math.exp(-(((Math.abs(o) - PIL_R - 1.6) / 0.5) ** 2)));
        }
      }
    }
    // chrome sill under the arch, mid trim, base
    if (y >= 62 && y <= 65 && x > 11 && x < 116) chromeAt(p, y === 63 ? 0.14 : y === 62 ? 0.06 : 0.04);
    if (y >= 186) chromeAt(p, y === 187 ? 0.14 : 0.035);
    if (y >= 115 && y <= 117 && x >= 11 && x <= 80) chromeAt(p, y === 115 ? 0.12 : y === 116 ? 0.05 : 0.025);
    // grille: a diamond lattice between the pilasters behind the minutes
    if (y >= 127 && y <= 184 && x >= 14 && x <= 113) {
      const u = (x + y) % 8, v = (x - y + 400) % 8;
      const line = (u === 0 || v === 0) ? 1 : 0;
      grilleG[p] = line ? 0.35 : 1;                        // holes glow, bars are dim chrome
      if (line) chromeAt(p, 0.010);
    }
    // the coin slot plate on the sill
    if (y >= 104 && y <= 108 && x >= 96 && x <= 103) chromeAt(p, (y === 66 || y === 70 || x === 101 || x === 108) ? 0.05 : 0);
  }
})();

// ------------------------------------------------------------- drawing helpers
function addPx(x, y, c, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = 3 * (y * W + x);
  img[p] += c[0] * a; img[p + 1] += c[1] * a; img[p + 2] += c[2] * a;
}
function overPx(p, r, g, b, a) {
  p *= 3; img[p] += (r - img[p]) * a; img[p + 1] += (g - img[p + 1]) * a; img[p + 2] += (b - img[p + 2]) * a;
}
/** Sub-pixel dot (bilinear). */
function dot(x, y, c, a) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  addPx(xi, yi, c, a * (1 - fx) * (1 - fy)); addPx(xi + 1, yi, c, a * fx * (1 - fy));
  addPx(xi, yi + 1, c, a * (1 - fx) * fy); addPx(xi + 1, yi + 1, c, a * fx * fy);
}
/** Anti-aliased thick line, added. */
function line(x0, y0, x1, y1, w, c, a) {
  const bx0 = Math.max(0, Math.floor(Math.min(x0, x1) - w - 1)), bx1 = Math.min(W - 1, Math.ceil(Math.max(x0, x1) + w + 1));
  const by0 = Math.max(0, Math.floor(Math.min(y0, y1) - w - 1)), by1 = Math.min(H - 1, Math.ceil(Math.max(y0, y1) + w + 1));
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-6;
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    let t = ((x - x0) * dx + (y - y0) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - x0 - t * dx, ey = y - y0 - t * dy, d = Math.sqrt(ex * ex + ey * ey);
    const cov = clamp(w / 2 + 0.5 - d);
    if (cov > 0) { const p = 3 * (y * W + x); img[p] += c[0] * a * cov; img[p + 1] += c[1] * a * cov; img[p + 2] += c[2] * a * cov; }
  }
}

/**
 * A 45 rpm record as an ellipse (rx, ry) at (cx, cy), painted over.
 * rot: label rotation (turns). lift: 0 on the platter.
 */
function record(cx, cy, rx, ry, lab, rot, alpha, rimK = 1, labK = 0.8) {
  if (alpha <= 0) return;
  rx = Math.max(rx, 0.6); ry = Math.max(ry, 0.6);
  const bx0 = Math.max(0, Math.floor(cx - rx - 1)), bx1 = Math.min(W - 1, Math.ceil(cx + rx + 1));
  const by0 = Math.max(0, Math.floor(cy - ry - 1)), by1 = Math.min(H - 1, Math.ceil(cy + ry + 1));
  const mn = Math.min(rx, ry), ca = Math.cos(rot * kit.TAU), sa = Math.sin(rot * kit.TAU);
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const u = (x - cx) / rx, v = (y - cy) / ry, q = Math.sqrt(u * u + v * v);
    const cov = clamp((1 - q) * mn + 0.5) * alpha;
    if (cov <= 0) continue;
    let r = 0.016, g = 0.016, b = 0.022;                       // vinyl
    // groove rings and the fixed sheen wedges (light from upper left / lower right)
    const groove = 0.5 + 0.5 * Math.cos(q * 38);
    const wedge = Math.abs(u * 0.8 - v * 0.6) / (q + 1e-3);  // 0 along the sheen axis
    const sheen = q > 0.42 && q < 0.97 ? Math.max(0, 1 - wedge * 3.2) * (0.6 + 0.4 * groove) : 0;
    r += 0.22 * sheen; g += 0.24 * sheen; b += 0.30 * sheen;
    const rim = Math.exp(-(((q - 0.97) / 0.035) ** 2));
    r += 0.16 * rim * rimK; g += 0.16 * rim * rimK; b += 0.2 * rim * rimK;
    if (q < 0.4) {                                            // the label, with a turning white flash
      const ru = u * ca + v * sa, rv = -u * sa + v * ca;
      const flash = rv < 0 && Math.abs(ru) < 0.09 && q > 0.12 ? 1 : 0;
      const k = q < 0.1 && rimK > 0 ? 0 : labK;
      r = lab[0] * k + flash * 0.35; g = lab[1] * k + flash * 0.33; b = lab[2] * k + flash * 0.3;
    }
    overPx(y * W + x, r, g, b, cov);
  }
}

// small eighth-note sprite for the hour show
const NOTE = ['..##', '..#.#', '..#..', '..#..', '###..', '###..'];

// ------------------------------------------------------------- time
const pad = (n) => String(n).padStart(2, '0');
function digitsOf(min) { const d = new Date(min * 60000); return pad(d.getHours()) + pad(d.getMinutes()); }
const TMP = [0, 0, 0], TMP2 = [0, 0, 0], RB = [0, 0, 0];

/**
 * Draw one tube numeral.
 *  level: liquid surface y (liquid where y > level); colA / colB: dye behind / ahead of the front
 *  front: dye front along s (px); glass: empty glass visibility; boil: bubble speed factor
 */
function tube(F, level, colA, colB, front, glass, boil, t, seed, men, rainbow = 0) {
  const r = SLOTS[seed].r;
  for (let k = 0; k < F.n; k++) {
    const p = F.idx[k], d = F.d[k];
    const y = (p / W) | 0, p3 = 3 * p;
    // dark moat round the tube
    const moat = kit.smoothstep(r + 0.6, r + 3.2, d) * glass + (1 - glass);
    if (moat < 1) { img[p3] *= moat; img[p3 + 1] *= moat; img[p3 + 2] *= moat; }
    const cov = clamp(r + 0.5 - d);
    if (cov <= 0) continue;
    const wet = clamp(y - level + 0.5);
    const rad = clamp(1 - (d / r) * (d / r));
    // glass: a rim and a specular streak where the normal faces the upper-left light
    const lit = -(F.nx[k] * 0.6 + F.ny[k] * 0.8);
    const spec = lit > 0.5 ? Math.exp(-(((d - 0.55 * r) / 0.6) ** 2)) * (lit - 0.5) * 2 : 0;
    const rim = Math.exp(-(((d - r + 0.3) / 0.6) ** 2));
    let rr = 0, gg = 0, bb = 0;
    if (wet > 0) {
      const s = F.s[k];
      let c = s < front ? colA : colB;
      if (rainbow > 0) { archCol(s / 70 - t * 0.9 + seed * 0.13, RB); c = [c[0] + (RB[0] - c[0]) * rainbow, c[1] + (RB[1] - c[1]) * rainbow, c[2] + (RB[2] - c[2]) * rainbow]; }
      const sid = F.sid[k];
      // bubbles: an irregular train flowing along the tube; each is a dark
      // pocket in the dye with a bright rim and a glint (upper left)
      const ph = (s - t * 7 * boil) / 9, cell = Math.floor(ph), fr = ph - cell;
      const h1 = kit.hash(cell, sid, seed);
      let bub = 0, glint = 0;
      if (h1 > 0.25) {
        const cpos = 0.3 + 0.4 * kit.hash(cell, sid + 7, seed), br = r * (0.55 + 0.3 * kit.hash(cell, sid + 3, seed));
        const al = (fr - cpos) * 9, sd = (F.nx[k] * 0.6 + F.ny[k] * 0.8) >= 0 ? d : -d;
        const lat = sd - 0.6 * (r - br) * (2 * h1 - 1.25);
        const q = Math.sqrt(al * al + lat * lat) / br;
        bub = clamp((1 - q) * br);                                   // coverage of the gas pocket
        glint = Math.exp(-(((q - 0.8) / 0.25) ** 2)) * 0.6 + Math.exp(-(((al + 0.45 * br) ** 2 + (lat + 0.45 * br) ** 2) / 0.35));
      }
      const L = (0.22 + 0.7 * rad * rad) * wet * (1 - 0.8 * bub);
      rr = c[0] * L + (0.4 * glint) * wet; gg = c[1] * L + (0.38 * glint) * wet; bb = c[2] * L + (0.36 * glint) * wet;
      if (men > 0) { const m = Math.exp(-(((y - level) / 0.8) ** 2)) * men; rr += 0.5 * m; gg += 0.45 * m; bb += 0.4 * m; }
    }
    const gl = (0.05 * rim + 0.35 * spec) * glass;
    img[p3] = img[p3] * (1 - cov) + (rr + CHROME[0] * gl) * cov;
    img[p3 + 1] = img[p3 + 1] * (1 - cov) + (gg + CHROME[1] * gl) * cov;
    img[p3 + 2] = img[p3 + 2] * (1 - cov) + (bb + CHROME[2] * gl) * cov;
  }
  // the feed pipe from the inlet down into the chrome manifold, liquid inside
  const [ix, iy] = F.inlet, manY = MAN_Y[seed], pr = r * 0.7, c = colA;
  for (let y = Math.floor(iy); y < manY; y++) {
    const wet = clamp(y - level + 0.5);
    for (let x = Math.floor(ix - pr - 1); x <= Math.ceil(ix + pr + 1); x++) {
      const o = Math.abs(x - ix), cov = clamp(pr + 0.5 - o);
      if (cov <= 0 || y < iy + r * 0.6) continue;
      const p3 = 3 * (y * W + x), rad = 1 - (o / pr) * (o / pr);
      const L = (0.3 + 0.3 * clamp(rad)) * wet, gl = 0.05 * Math.exp(-(((o - pr + 0.3) / 0.5) ** 2)) * glass;
      img[p3] = img[p3] * (1 - cov) + (c[0] * L + CHROME[0] * gl) * cov;
      img[p3 + 1] = img[p3 + 1] * (1 - cov) + (c[1] * L + CHROME[1] * gl) * cov;
      img[p3 + 2] = img[p3 + 2] * (1 - cov) + (c[2] * L + CHROME[2] * gl) * cov;
    }
  }
  // chrome ferrules on the open tube ends
  for (const [e, q] of F.ends) {
    const dx = e[0] - q[0], dy = e[1] - q[1], dl = Math.hypot(dx, dy) || 1;
    const ux = dx / dl, uy = dy / dl;
    for (let k = -0.5; k <= 1.6; k += 0.7) {
      for (let j = -1; j <= 1; j++) dot(e[0] + ux * k - uy * j * r * 0.75 - 0.5, e[1] + uy * k + ux * j * r * 0.75 - 0.5, CHROME, (j === 0 ? 0.12 : 0.07) * glass);
    }
  }
}

export default {
  name: 'Bubbler',
  blurb: '1940s jukebox: the time bent from its bubble tubes; each minute a new 45 drops and the new numeral fills with its colour',
  layouts: ['hub-2x3'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx);
    const now = ctx.date.getTime() / 1000, t = now;
    const mAbs = Math.floor(now / 60), age = now - mAbs * 60;
    const up = age >= 30;                                   // turn coming at the end of this minute
    const oldM = up ? mAbs : mAbs - 1, newM = oldM + 1;
    const p = up ? age - 60 : age;                          // seconds from the turn (-30..30)
    const playing = p < 0 ? oldM : newM;
    const oldD = digitsOf(oldM), newD = digitsOf(newM);
    const hourTurn = newD.slice(2) === '00';
    const show = hourTurn && p >= 0 && p < 7 ? p : -1;        // hour show clock
    const dim = 1 - 0.6 * ctx.night;

    img.set(bg);

    // ---------------- mechanism timeline
    const seg = (a, b) => ease.inOut(clamp((p - a) / (b - a)));
    const armOut = p < 0 ? seg(-3.2, -2.6) : 1 - seg(0.0, 0.45);    // 0 on the record, 1 parked
    const armUp = p < 0 ? seg(-3.35, -3.1) : 1 - seg(0.4, 0.6);
    const recUp = p < 0 ? seg(-2.7, -2.0) : 0;                        // old record lifts and stands up
    const recBack = p < 0 ? seg(-2.0, -1.5) : 0;                      // into the carousel
    const carT = seg(-1.5, -0.9);                                     // carousel steps one slot
    const newOut = p < 0 ? seg(-0.9, -0.45) : 1;                      // new record comes out
    const newDown = p < 0 ? seg(-0.45, -0.05) : 1;                    // and lies down
    const spin = p < 0 ? 1 - seg(-3.0, -2.75) : seg(0.0, 0.5);
    const isSwap = p > -3.4 && p < 0.7;
    const whirl = show >= 0 ? ease.inOut(clamp(show / 5.5)) * 3 : 0; // hour: carousel whirls 3 slots... (cosmetic)

    // beat from the record (stops while the arm is up)
    const playingNow = armUp < 0.05 && armOut < 0.05;
    const bpm = show >= 0 ? 2.4 : 2;
    const bph = t * bpm, beat = playingNow ? Math.exp(-kit.fract(bph) * 5) : 0;

    // ---------------- arch colour
    const wild = show >= 0 ? Math.sin(Math.PI * clamp(show / 6.5)) : 0;
    const archDrift = t * (0.025 + 0.5 * wild);
    for (let q = 0; q < N; q++) {
      const u = archU[q];
      if (u < 0) continue;
      const v = archV[q];
      // two coloured channels split by a chrome rib, light rolling round the arch
      const rib = Math.exp(-(((v - 0.5) / 0.06) ** 2));
      const ch = v < 0.5 ? 0 : 0.18;
      archCol(u * 0.55 + ch - archDrift, TMP);
      const roll = 0.55 + 0.45 * Math.sin(u * 9 - t * (0.7 + 6 * wild)) ;
      const edge = kit.smoothstep(0, 0.12, v) * kit.smoothstep(1, 0.88, v);
      const a = (0.16 + 0.16 * roll + 0.3 * wild * beat) * edge * (1 - rib);
      const q3 = 3 * q;
      img[q3] += TMP[0] * a + CHROME[0] * 0.05 * rib; img[q3 + 1] += TMP[1] * a + CHROME[1] * 0.05 * rib; img[q3 + 2] += TMP[2] * a + CHROME[2] * 0.05 * rib;
    }

    // ---------------- pilaster bubble tubes (continuing the arch's ends)
    for (let side = 0; side < 2; side++) {
      archCol(side ? 0.55 - archDrift : 0.0 - archDrift, TMP2);
      const cx = PIL[side];
      for (let y = 63; y < 186; y++) {
        for (let x = Math.floor(cx - PIL_R - 1); x <= Math.ceil(cx + PIL_R + 1); x++) {
          const q = y * W + x, o = (x - cx) / PIL_R;
          const cov = clamp((1 - Math.abs(o)) * PIL_R + 0.5);
          if (cov <= 0) continue;
          const ph = (y + t * (12 + 30 * wild)) / 7 + side * 0.37, cell = Math.floor(ph), fr = ph - cell;
          const h1 = kit.hash(cell, side, 99);
          let bub = 0;
          if (h1 > 0.3) { const al = (fr - 0.5) * 7, lat = (o - (h1 - 0.65)) * PIL_R; bub = clamp(1 - Math.sqrt(al * al + lat * lat) / (0.8 + h1)); }
          const L = 0.22 * (0.6 + 0.4 * (1 - o * o)) * (1 + 0.6 * wild);
          const q3 = 3 * q;
          img[q3] += (TMP2[0] * L + 0.12 * bub) * cov; img[q3 + 1] += (TMP2[1] * L + 0.11 * bub) * cov; img[q3 + 2] += (TMP2[2] * L + 0.10 * bub) * cov;
        }
      }
    }

    // ---------------- grille glow with the beat
    const gl = 0.016 + 0.04 * beat * (1 + 1.5 * wild);
    for (let q = 0; q < N; q++) {
      const g = grilleG[q];
      if (g === 0) continue;
      const y = (q / W) | 0, fall = 0.6 + 0.4 * (y - 127) / 57;
      const q3 = 3 * q, a = gl * g * fall;
      img[q3] += WARM[0] * a; img[q3 + 1] += WARM[1] * a; img[q3 + 2] += WARM[2] * a;
    }

    // ---------------- dome: warm inner light, carousel, platter, record, arm
    for (let q = 0; q < 62 * W; q++) {
      const m = domeM[q];
      if (m <= 0) continue;
      const x = q % W, y = (q / W) | 0, d2 = ((x - AX) / 46) ** 2 + ((y - 46) / 22) ** 2;
      const a = m * (0.06 * Math.exp(-d2 * 1.2) + 0.014) * (1 + 2.5 * wild * beat);
      const q3 = 3 * q;
      img[q3] += WARM[0] * a; img[q3 + 1] += WARM[1] * a; img[q3 + 2] += WARM[2] * a;
    }
    // carousel: a ring of records standing on edge behind the platter
    const RING_X = 42, RING_CY = 27, RREC = 12, STEP = 0.2618;   // 15 degrees
    const rot = (p < 0 ? oldM : newM - 1) + carT + whirl;         // slot index at the pickup
    const visible = [];
    for (let k = Math.floor(rot) - 6; k <= Math.floor(rot) + 7; k++) {
      const th = (k - rot) * STEP;
      if (Math.abs(th) > 1.45) continue;
      visible.push([Math.abs(th), k, th]);
    }
    visible.sort((a, b) => a[0] - b[0]);                           // back centre first, sides on top
    for (const [, k, th] of visible) {
      // the playing record's slot is empty (it is on the platter, or travelling)
      if (k === playing && !(p < 0 && recBack >= 1 && k === oldM)) continue;
      if (p < 0 && k === newM && newOut > 0) continue;
      const sx = AX + RING_X * Math.sin(th), sy = RING_CY - 4 * Math.cos(th);
      const near = 1 - Math.cos(th);
      record(sx, sy, 5 + (RREC - 5) * Math.abs(Math.sin(th)), RREC * 0.8, mcol(k), 0, 0.7 + 0.3 * near, 0.5, 0.45);
    }
    // platter
    const PCX = AX, PCY = 47, PRX = 33, PRY = 11;
    record(PCX, PCY + 1.6, PRX + 1.5, PRY + 1.4, [0.02, 0.02, 0.02], 0, 1);
    line(PCX - PRX - 1, PCY + 2.5, PCX + PRX + 1, PCY + 2.5, 1, CHROME, 0.05);
    // the record that is travelling or playing
    const rotLab = t * 0.75 * (show >= 0 ? 1.3 : 1);
    const spinRot = rotLab * spin;
    if (p < 0 && recUp > 0) {
      // old record: rises, stands up, slides back to the pickup slot
      const ry = PRY + (RREC * 0.8 - PRY) * recUp;
      const rx = PRX + (5 - PRX) * recUp;
      const by = kit.lerp(PCY - 14 * recUp, RING_CY - 4, recBack);
      if (recBack < 1) record(PCX, by, rx, ry, mcol(oldM), spinRot, 1);
    } else if (p < 0 && newOut <= 0) {
      record(PCX, PCY, PRX, PRY, mcol(oldM), spinRot, 1);
    }
    if (p < 0 && newOut > 0) {
      // new record: out of the pickup slot, comes forward, lies down on the platter
      const by = kit.lerp(RING_CY - 4, PCY - 14, newOut);
      const yy = kit.lerp(by, PCY, newDown);
      const rx = kit.lerp(5, PRX, newDown), ry = kit.lerp(RREC * 0.8, PRY, newDown);
      record(PCX, yy, rx, ry, mcol(newM), 0, 1);
    } else if (p >= 0) {
      record(PCX, PCY, PRX, PRY, mcol(newM), spinRot, 1);
    }
    // gripper rod: comes down to the record while it is moving
    if (isSwap && (recUp > 0 && recBack < 1 || newOut > 0 && newDown < 1)) {
      const ry = p < 0 && newOut > 0 ? kit.lerp(kit.lerp(RING_CY - 4, PCY - 14, newOut), PCY, newDown) : kit.lerp(PCY - 14 * recUp, RING_CY - 4, recBack);
      line(PCX, 12, PCX, ry - 8, 1.4, CHROME, 0.22); line(PCX - 3, ry - 8, PCX + 3, ry - 8, 1.2, CHROME, 0.3);
    }
    // spindle
    dot(PCX - 0.5, PCY - 1.6, CHROME, 0.35);
    // tone arm: pivot right, stylus on the outer grooves
    const PVX = 104, PVY = 40;
    const angRest = 2.62, angPlay = 3.2;                             // radians (pointing left-down)
    const ride = playingNow ? 0.012 * Math.sin(t * 4.7) + (spinRot % 1) * 0 : 0;
    const ang = kit.lerp(angPlay, angRest, armOut) + ride;
    const lift = 3 * armUp;
    const AL = 30, hx = PVX + AL * Math.cos(ang), hy = PVY - lift + AL * Math.sin(ang) * 0.45;
    line(PVX, PVY, hx, hy, 1.8, CHROME, 0.45);
    line(hx, hy, hx - 3 * Math.cos(ang - 0.6), hy + 2.2, 2.4, CHROME, 0.55);
    dot(PVX - 0.5, PVY - 0.5, CHROME, 0.6);
    record(PVX, PVY + 1, 3.5, 2, [0.08, 0.08, 0.1], 0, 1);
    dot(PVX - 0.5, PVY - 0.5, CHROME, 0.4);
    if (playingNow) dot(hx - 3 * Math.cos(ang - 0.6) - 0.5, hy + 2.5, AMBER, 0.12 + 0.2 * beat);

    // ---------------- the selector: title strips, the playing one lit
    {
      const sel = p < 0 ? 0 : ease.inOut(clamp((p - 0.1) / 0.6));        // lamp glides to the next card
      const selF = 2 + sel;                                               // card index of the lamp (0..5)
      for (let j = 0; j < 6; j++) {
        const cxj = 85 + (j % 2) * 18, cyj = 71 + Math.floor(j / 2) * 10;
        const rec = (p < 0 ? oldM : newM - 1) - 2 + j;
        const on = Math.max(0, 1 - Math.abs(j - selF));
        const lab = mcol(rec), base = 0.06 + 0.2 * on * (0.85 + 0.15 * beat);
        for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < 15; xx++) {
          const edge = yy === 0 || yy === 6 || xx === 0 || xx === 14;
          const q3 = 3 * ((cyj + yy) * W + cxj + xx);
          if (edge) { img[q3] += CHROME[0] * 0.03; img[q3 + 1] += CHROME[1] * 0.03; img[q3 + 2] += CHROME[2] * 0.03; continue; }
          // a cream card with two printed title lines in the record's colour
          const ink = (yy === 2 || yy === 4) && xx > 1 && xx < 13 - ((rec * 3 + yy) % 4) && kit.hash(xx, yy, rec) > 0.15;
          const c = ink ? lab : WARM, a = ink ? base * 2.2 : base * 0.6;
          img[q3] += c[0] * a; img[q3 + 1] += c[1] * a; img[q3 + 2] += c[2] * a;
        }
      }
    }
    // ---------------- the coin, tossed in from the right
    if (p > -4.6 && p < -3.4) {
      const u = clamp((p + 4.6) / 0.95);
      if (u < 1) {
        const cx = kit.lerp(134, 99.5, u), cy = kit.lerp(150, 105, u) - 34 * 4 * u * (1 - u) * 0.7;
        const sp = Math.abs(Math.cos(u * 14));
        for (let j = -3; j <= 3; j++) for (let k2 = -3; k2 <= 3; k2++) {
          const xx = Math.floor(cx) + j, yy = Math.floor(cy) + k2;
          const dx = (xx - cx) / (2.6 * sp + 0.5), dy = (yy - cy) / 2.6;
          const c = clamp((1 - Math.sqrt(dx * dx + dy * dy)) * 2.2);
          if (c > 0 && xx >= 0 && xx < W && yy >= 0) addPx(xx, yy, GOLD, c * (0.35 + 0.3 * sp));
        }
      }
    }
    const slotGlow = Math.exp(-(((p + 3.5) / 0.35) ** 2));
    for (let x = 98; x <= 101; x++) addPx(x, 106, slotGlow > 0.01 ? GOLD : CHROME, slotGlow > 0.01 ? 0.6 * slotGlow + 0.04 : 0.04);

    // ---------------- the bubble-tube numerals
    const boilBase = show >= 0 ? 1 + 2.5 * wild : 1;
    const rbK = show >= 0 ? kit.smoothstep(2.0, 2.8, show) * kit.smoothstep(7, 5.8, show) : 0;
    for (let s = 0; s < 4; s++) {
      const isH = s < 2;
      const a = oldD[s], b = newD[s], changed = a !== b;
      const cOld = isH ? AMBER : mcol(oldM), cNew = isH ? AMBER : mcol(newM);
      const Fo = field(s, +a), Fn = field(s, +b);
      const top = Fn.y0 - SLOTS[s].r - 1, bot = Fn.y1 + SLOTS[s].r + 1;
      const boil = boilBase * (p > -1.2 && p < 2.2 ? 2.2 : 1);
      if (changed) {
        if (p < 0) {
          // drain: the level falls from the top, the empty glass stays
          const dr = ease.inOut(clamp((p + 0.95) / 0.95));
          const lvl = kit.lerp(Fo.y0 - SLOTS[s].r - 1, MAN_Y[s], dr);
          const glass = 1;
          tube(Fo, lvl, cOld, cOld, 1e9, glass, boil, t, s, dr > 0 && dr < 1 ? 0.6 : 0);
        } else {
          const f = ease.inOut(clamp(p / 1.35));
          const lvl = kit.lerp(MAN_Y[s], top, f);
          const glass = 1;
          tube(Fn, lvl, cNew, cNew, 1e9, glass, boil, t, s, f > 0 && f < 1 ? 0.6 : 0, rbK);
        }
      } else {
        // same numeral: on a minute turn the new dye flows in along the glass
        let front = 1e9;
        if (!isH && p >= 0 && p < 3) front = ease.inOut(clamp((p - 0.5) / 1.8)) * (Math.max(...Fn.len) + 2);
        tube(Fn, -1e3, p >= 0 && !isH ? cNew : cOld, cOld, front, 1, boil, t, s, 0, rbK);
      }
    }

    // ---------------- hour show: notes fly out of the grille, cabinet bounces
    let out = img;
    if (show >= 0) {
      for (let k = 0; k < 14; k++) {
        const t0 = 0.3 + k * 0.42, age2 = show - t0;
        if (age2 < 0 || age2 > 2.4) continue;
        const left = k % 2 === 0, nx0 = left ? 12 + 8 * kit.hash(k, 1) : 104 + 8 * kit.hash(k, 2);
        const nx = nx0 + (left ? -1 : 1) * 6 * age2 + 3 * Math.sin(age2 * 5 + k);
        const ny = 165 - 52 * age2 + 4 * age2 * age2;
        const fade = clamp(age2 / 0.2) * clamp((2.4 - age2) / 0.6);
        const col = [CHERRY, LEMON, TURQ, VIOLET][k % 4];
        for (let j = 0; j < NOTE.length; j++) for (let i = 0; i < NOTE[j].length; i++) if (NOTE[j][i] === '#') for (let a2 = 0; a2 < 2; a2++) for (let b2 = 0; b2 < 2; b2++) dot(nx + 2 * i + a2, ny + 2 * j + b2, col, 0.6 * fade);
      }
      // bounce: hop on every beat, squash on landing, anchored at the base
      const env = clamp(show / 0.3) * clamp((6.5 - show) / 0.6);
      const ph = kit.fract(show * bpm);
      const hop = 4 * Math.sin(Math.PI * ph) * env;
      const squash = 1 - 0.035 * Math.exp(-ph * 9) * env;
      const stretch = 1 + 0.025 * Math.exp(-ph * 9) * env;
      fin.fill(0);
      for (let y = 0; y < H; y++) {
        const sy = (y - (H - 1) + hop) / squash + (H - 1);
        if (sy < 0 || sy > H - 1) continue;
        const y0 = Math.floor(sy), fy = sy - y0, y1 = Math.min(H - 1, y0 + 1);
        for (let x = 0; x < W; x++) {
          const sx = (x - AX) / stretch + AX;
          if (sx < 0 || sx > W - 1) continue;
          const x0 = Math.floor(sx), fx = sx - x0, x1 = Math.min(W - 1, x0 + 1);
          const a00 = 3 * (y0 * W + x0), a10 = 3 * (y0 * W + x1), a01 = 3 * (y1 * W + x0), a11 = 3 * (y1 * W + x1), o = 3 * (y * W + x);
          for (let c = 0; c < 3; c++) {
            fin[o + c] = (img[a00 + c] * (1 - fx) + img[a10 + c] * fx) * (1 - fy) + (img[a01 + c] * (1 - fx) + img[a11 + c] * fx) * fy;
          }
        }
      }
      out = fin;
    }
    kit.blitGrid(ctx, out, dim);
  },
};
