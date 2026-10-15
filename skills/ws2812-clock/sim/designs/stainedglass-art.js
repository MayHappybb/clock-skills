// The window itself: a cross of leaded glass on a 192 x 192 raster.
//   left arm  : hours (numeral tiles laid in by stainedglass.js)
//   right arm : minutes
//   top arm   : the patron, St Frog of the Round Glasses, in a gold halo
//   bottom arm: a Tiffany pond, dragonfly over lily pads
//   centre    : the rose window (drawn per frame so it can turn)
// Everything else is Chartres-blue diamond quarries in a ruby/gold border.
// buildWindow() supersamples an id map at 3x, finds the lead between
// panes, and returns per-pixel glass colour, lead and rose coverage.
import * as kit from '../js/kit.js';

export const N = 192, CX = 96, CY = 96, ROSE_R = 30;
const STONE = 0, ROSE = 1;

const H = (s) => kit.hex(s);
export const PAL = {
  cobalt: [H('#1236c4'), H('#0e2894'), H('#1c48d8'), H('#2a30b4'), H('#1a3ab0')],
  purple: H('#5c1c9c'), sky: H('#1a78b8'), rubyDot: H('#b0141e'),
  ruby: [H('#ff1c34'), H('#ff4a3c'), H('#ee1a2c')],
  amber: [H('#ffa018'), H('#ffbc34'), H('#f08a10')],
  gold: H('#ffd658'), aura: H('#3c6ef0'), pale: H('#e6f2ff'), lens: H('#9ad8ff'),
  rainbow: [H('#ff2424'), H('#ff8a14'), H('#ffe030'), H('#3ad248'), H('#2c8cff'), H('#9a48ff')],
  water: [H('#1898b0'), H('#1468c0'), H('#20b4a0')],
  pad: [H('#2aa040'), H('#52c84c')], pink: H('#ff6aa8'),
  wing: [H('#b4ece0'), H('#dccaff')], emerald: H('#14b45a'),
};

// ------------------------------------------------------------- geometry
/** Signed distance inside the cross outline (px). */
function crossD(x, y) {
  const dV = Math.min(x - 64, 128 - x, y, N - y), dH = Math.min(x, N - x, y - 64, 128 - y);
  return Math.max(dV, dH);
}
const CORNERS = [[64, 0, 1, 1], [128, 0, -1, 1], [0, 64, 1, 1], [0, 128, 1, -1], [192, 64, -1, 1], [192, 128, -1, -1], [64, 192, 1, -1], [128, 192, -1, -1]];
const CR = 10;
/** Stone in the rounded outer corners of each arm. */
function inCorner(x, y) {
  for (const [cx, cy, sx, sy] of CORNERS) {
    const dx = (x - cx) * sx, dy = (y - cy) * sy;
    if (dx >= 0 && dy >= 0 && dx < CR && dy < CR && Math.hypot(CR - dx, CR - dy) > CR) return true;
  }
  return false;
}
const ell = (x, y, cx, cy, rx, ry, ang = 0) => {
  const c = Math.cos(ang), s = Math.sin(ang), dx = x - cx, dy = y - cy;
  const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
  return u * u + v * v;
};
function capsule(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, t = kit.clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy));
  return [Math.hypot(x - ax - t * dx, y - ay - t * dy), t];
}

// keys: 0 stone, 1 rose, 300+ frog, 500+ pond, 2000+ border, 100000+ quarry
function frog(lx, ly) {
  // glasses (over everything)
  for (const [ex, px] of [[21, 22.3], [43, 41.7]]) {
    const d = Math.hypot(lx - ex, ly - 20);
    if (d < 9.5) {
      if (Math.hypot(lx - px, ly - 21) < 3.1) return STONE;    // pupil
      return d < 7 ? 310 + (ex > 32 ? 1 : 0) : 312 + (ex > 32 ? 1 : 0);
    }
  }
  if (lx > 29.5 && lx < 34.5 && ly > 18.4 && ly < 21.4) return 314;   // bridge
  const head = ell(lx, ly, 32, 32, 21, 12) < 1, body = ell(lx, ly, 32, 53, 16.5, 13.5) < 1;
  if (head || body) {
    // smile: a lead line on the face
    const sd = Math.hypot(lx - 32, ly - 27.5) - 11.5, sa = Math.atan2(ly - 27.5, lx - 32);
    if (Math.abs(sd) < 0.85 && sa > 0.42 && sa < Math.PI - 0.42) return STONE;
    const band = kit.clamp(Math.floor((ly - 19.5) / 7.3), 0, 5);
    return 300 + band;
  }
  const hr = Math.hypot(lx - 32, ly - 27);
  if (hr < 22) return 320;                                         // aura
  if (hr < 26.5) return 330 + Math.floor(((Math.atan2(ly - 27, lx - 32) + Math.PI) / kit.TAU) * 12);  // halo
  return -1;
}
function pond(lx, ly) {
  // dragonfly: wings first, body over them
  const body = capsule(lx, ly, 41, 19.5, 11, 24);
  if (Math.hypot(lx - 50.5, ly - 18.6) < 3.6) return 600;            // head
  if (ell(lx, ly, 45, 19.2, 4, 3.2) < 1) return 601;                  // thorax
  if (body[0] < 2.3) return 610 + Math.floor(body[1] * 6);            // abdomen pieces
  const W = [[40, 10.5, 12.5, 4.2, -0.32], [40, 28.5, 12.5, 4.2, 0.36], [32, 11.5, 10.5, 3.6, -0.62], [32, 27.5, 10.5, 3.6, 0.66]];
  for (let k = 0; k < 4; k++) {
    const [cx, cy, rx, ry, a] = W[k];
    if (ell(lx, ly, cx, cy, rx, ry, a) < 1) {
      const side = (-(lx - cx) * Math.sin(a) + (ly - cy) * Math.cos(a)) > 0 ? 1 : 0;  // vein along the wing
      return 620 + k * 2 + side;
    }
  }
  // lotus on the first pad
  const lr = Math.hypot(lx - 17, ly - 38.5);
  if (lr < 4.8 && ly < 41.5) return 640 + Math.floor(((Math.atan2(ly - 38.5, lx - 17) + Math.PI) / kit.TAU) * 5);
  for (const [cx, cy, rx, ry, k] of [[17, 44, 13, 5.5, 0], [48, 49.5, 11, 4.5, 1]]) {
    if (ell(lx, ly, cx, cy, rx, ry) < 1) {
      const a = Math.atan2(ly - cy, lx - cx);
      if (Math.abs(a - (k ? 2.2 : 1.0)) < 0.22) break;                  // the notch
      return 650 + k * 2 + (lx < cx ? 0 : 1);
    }
  }
  if (ly > 41) {
    const w = ly - 41 + 1.6 * Math.sin(lx * 0.26 + Math.floor((ly - 41) / 5));
    return 500 + kit.clamp(Math.floor(w / 5), 0, 9);
  }
  return -1;
}
/** The pane key at pixel position (x, y), continuous coordinates. */
export function keyAt(x, y) {
  const d = crossD(x, y);
  if (d < 0) return -1;
  if (d < 1.7 || inCorner(x, y)) return STONE;
  if (d < 5) {
    // border band: short pieces along the nearest edge
    const horiz = Math.min(Math.abs(y - Math.round(y / 64) * 64), Math.abs(y - N)) < Math.min(Math.abs(x - Math.round(x / 64) * 64), Math.abs(x - N));
    const s = horiz ? x : y;
    return 2000 + (horiz ? 0 : 1000) + Math.floor(s / 7);
  }
  if (Math.hypot(x - CX, y - CY) < ROSE_R) return ROSE;
  if (y < 64) { const k = frog(x - 64, y); if (k >= 0) return k; }
  if (y >= 128) { const k = pond(x - 64, y - 128); if (k >= 0) return k; }
  const q = 12, u = Math.floor((x + y) / q), v = Math.floor((x - y + 400) / q);
  return 100000 + u * 1000 + v;
}

const colMemo = new Map();
export function colourOf(key) {
  if (colMemo.has(key)) return colMemo.get(key);
  let c;
  const h = kit.hash(key, 7);
  if (key >= 100000) {
    c = h < 0.04 ? PAL.purple : h < 0.07 ? PAL.sky : h < 0.085 ? PAL.rubyDot : PAL.cobalt[Math.floor(kit.hash(key, 3) * 5)];
  } else if (key >= 2000) c = (key % 3 === 0) ? PAL.gold : PAL.ruby[key % 2 ? 0 : 2];
  else if (key >= 650) c = PAL.pad[key % 2];
  else if (key >= 640) c = PAL.pink;
  else if (key >= 620) c = PAL.wing[key % 2];
  else if (key >= 610) c = key % 2 ? PAL.emerald : PAL.amber[0];
  else if (key === 600) c = PAL.emerald;
  else if (key === 601) c = PAL.amber[1];
  else if (key >= 500) c = PAL.water[key % 3];
  else if (key >= 330) c = key % 2 ? PAL.gold : PAL.amber[1];
  else if (key === 320) c = PAL.aura;
  else if (key >= 312) c = PAL.pale;
  else if (key >= 310) c = PAL.lens;
  else if (key >= 300) c = PAL.rainbow[key - 300];
  else c = [0, 0, 0];
  // uneven density per pane
  const dens = key >= 100000 ? 0.7 + 0.45 * kit.hash(key, 11) : 0.85 + 0.25 * kit.hash(key, 11);
  c = kit.scale(c, dens);
  colMemo.set(key, c);
  return c;
}

/** Streaky, bubbly glass texture at pixel (x, y). */
export function texture(x, y) {
  const a = 2.0 * kit.noise2(x * 0.03, y * 0.03);
  const u = x * Math.cos(a) + y * Math.sin(a), v = -x * Math.sin(a) + y * Math.cos(a);
  const streak = kit.noise2(u * 0.09, v * 0.9);
  const cloud = kit.noise2(x * 0.11 + 31, y * 0.11);
  const bubble = kit.hash(x | 0, y | 0, 5) < 0.012 ? 0.35 : 0;
  return 0.72 + 0.28 * streak + 0.18 * cloud + bubble;
}

const S = 3;
export function buildWindow() {
  const HW = N * S, ids = new Int32Array(HW * HW);
  for (let y = 0; y < HW; y++) for (let x = 0; x < HW; x++) ids[y * HW + x] = keyAt((x + 0.5) / S, (y + 0.5) / S);
  const R = 2, lead = new Uint8Array(HW * HW);
  for (let y = 0; y < HW; y++) {
    for (let x = 0; x < HW; x++) {
      const v = ids[y * HW + x];
      if (v <= ROSE) { lead[y * HW + x] = v === STONE ? 1 : 0; continue; }
      let e = 0;
      for (let oy = -R; oy <= R && !e; oy++) {
        for (let ox = -R; ox <= R; ox++) {
          if (ox * ox + oy * oy > R * R + 1) continue;
          const xx = x + ox, yy = y + oy;
          if (xx < 0 || yy < 0 || xx >= HW || yy >= HW) continue;
          const w = ids[yy * HW + xx];
          if (w !== v && w !== ROSE) { e = 1; break; }
        }
      }
      lead[y * HW + x] = e;
    }
  }
  const P = N * N, col = new Float32Array(3 * P), roseCov = new Float32Array(P), tex = new Float32Array(P), key = new Int32Array(P);
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const p = py * N + px, t = texture(px + 0.5, py + 0.5);
      tex[p] = t;
      let r = 0, g = 0, b = 0, rc = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const q = (py * S + sy) * HW + px * S + sx, v = ids[q];
          if (v === ROSE) { rc++; continue; }
          if (v < 0 || lead[q]) continue;
          const c = colourOf(v);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const k = 1 / (S * S);
      col[3 * p] = r * k * t; col[3 * p + 1] = g * k * t; col[3 * p + 2] = b * k * t;
      roseCov[p] = rc * k;
      key[p] = ids[(py * S + 1) * HW + px * S + 1];
    }
  }
  return { col, roseCov, tex, key };
}
