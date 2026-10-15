// Microcity: the static town. A 12 px street grid of blocks split into lots
// with heights, parks, a river with three bridges, a harbour basin with piers
// and moored ships, a stadium and a railway viaduct. Built once; the sun's
// shadows are re-cast once a minute (sunDay).
import * as kit from '../js/kit.js';

export const GW = 192, GH = 192, N = GW * GH;
export const T = { STREET: 0, LOT: 1, PARK: 2, WATER: 3, STADIUM: 4, RAIL: 5, QUAY: 6, BRIDGE: 7, ALLEY: 8 };
export const RAIL_Y = 104;
export const riverY = (x) => 92.5 + 3.6 * Math.sin(x * 0.034 + 0.4) + 1.2 * Math.sin(x * 0.091 + 2);
export const RIVER_HW = 5.4;
// a small rectangular arena (27 x 39 px, about half a numeral's height): no ring, no road-like outline
export const STAD = { cx: 162, cy: 42, hx: 13, hy: 19, px: 7, py: 11 };
export const BASIN = { cx: 26, cy: 160, rx: 36, ry: 27 };
const BRIDGE_X = [36, 108, 168];

const lin = (s) => kit.hex(s);
const mute = (c, k, s) => { const l = 0.3 * c[0] + 0.55 * c[1] + 0.15 * c[2]; return c.map((v) => k * (l + s * (v - l))); };
const ROOFS = ['#f2eee6', '#d9d3c7', '#c8725a', '#dfae58', '#7ea2bd', '#aaa49a', '#b88a6c', '#e8e0d0'].map(lin).map((c) => mute(c, 0.4, 0.6));
const TOWERS = ['#9fb3c4', '#c4c9cf', '#8aa0b4'].map(lin).map((c) => mute(c, 0.55, 0.8));

const inBasin = (x, y) => ((x - BASIN.cx) / BASIN.rx) ** 2 + ((y - BASIN.cy) / BASIN.ry) ** 2 < 1;
const inChannel = (x, y) => x >= 15 && x <= 25 && y > riverY(x) && y < 140;
const PIERS = [[0, 147, 30, 150], [0, 168, 22, 171], [44, 140, 62, 143]];  // x0, y0, x1, y1 land
export const SHIPS = [  // moored: x0, y0, x1, y1, hull, deck lights
  { x0: 3, y0: 143, x1: 27, y1: 146, hull: lin('#7c2a22') },
  { x0: 3, y0: 163, x1: 19, y1: 166, hull: lin('#22324a') },
  { x0: 3, y0: 151, x1: 21, y1: 154, hull: lin('#3a3a3a') },
];

export const type = new Uint8Array(N);
export const height = new Float32Array(N);
export const alb = new Float32Array(3 * N);     // daylight albedo, before shadows
export const emit = new Float32Array(3 * N);    // night light
export const thr = new Float32Array(N);         // darkness at which emit switches on
export const lots = [];                          // { x0, y0, x1, y1, h, tall }
export const water = [];                         // pixel indices of open water
export const riverPix = [];                      // river water: [p, mirror p] for reflections
export const minorLanes = [];                    // { x0, y0, x1, y1, len, horiz }
export const beacons = [];                       // rooftop aviation lights: [x, y, phase]

function build() {
  // land use
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const p = y * GW + x;
    const wet = Math.abs(y - riverY(x)) < RIVER_HW || inBasin(x, y) || inChannel(x, y);
    const street = x % 12 === 0 || y % 12 === 0;
    let t = street ? T.STREET : T.LOT;
    if (Math.abs(x - STAD.cx) <= STAD.hx && Math.abs(y - STAD.cy) <= STAD.hy) t = T.STADIUM;
    if (wet) {
      t = T.WATER;
      if (street && x % 12 === 0 && BRIDGE_X.includes(x) && !inBasin(x, y)) t = T.BRIDGE;
      if (street && y % 12 === 0 && inChannel(x, y) && !inBasin(x, y)) t = T.BRIDGE;
    }
    for (const [a, b, c, d] of PIERS) if (x >= a && x <= c && y >= b && y <= d) t = T.QUAY;
    if (y === RAIL_Y || y === RAIL_Y + 1) t = T.RAIL;
    type[p] = t;
  }
  // quays: the land ring round the basin
  for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
    const p = y * GW + x;
    if (type[p] !== T.LOT && type[p] !== T.STREET) continue;
    for (const q of [p - 1, p + 1, p - GW, p + GW]) if (type[q] === T.WATER && (inBasin(x, y + 2) || inBasin(x + 2, y) || inBasin(x - 2, y))) type[p] = T.QUAY;
  }
  // blocks into lots
  for (let by = 0; by < 16; by++) for (let bx = 0; bx < 16; bx++) {
    const hb = kit.hash(bx, by, 7), park = hb < 0.1;
    const rects = [[bx * 12 + 1, by * 12 + 1, bx * 12 + 11, by * 12 + 11]];
    if (!park) {
      // split up to two times with an alley
      for (let pass = 0; pass < 2; pass++) {
        for (let r = rects.length - 1; r >= 0; r--) {
          const [a, b, c, d] = rects[r], w = c - a, h = d - b, hh = kit.hash(a, b, pass + 11);
          if (hh < 0.25 || Math.max(w, h) < 7) continue;
          if (w >= h) { const m = a + Math.floor(w / 2 - 1 + 2 * kit.hash(a, b, 3)); rects.splice(r, 1, [a, b, m, d], [m + 1, b, c, d]); }
          else { const m = b + Math.floor(h / 2 - 1 + 2 * kit.hash(a, b, 4)); rects.splice(r, 1, [a, b, c, m], [a, m + 1, c, d]); }
        }
      }
    }
    const blockOn = kit.hash(bx, by, 9);
    for (const [a, b, c, d] of rects) {
      const hl = kit.hash(a, b, 5), dc = Math.hypot((a + c) / 2 - 96, (b + d) / 2 - 96) / 96;
      const tall = !park && hl > 0.86 - 0.25 * (1 - dc);
      const h = park ? 0 : tall ? 5 + 4 * kit.hash(a, b, 6) : 1 + 2.5 * kit.hash(a, b, 8);
      const roof = tall ? TOWERS[Math.floor(kit.hash(a, b, 2) * TOWERS.length)] : ROOFS[Math.floor(kit.hash(a, b, 2) * ROOFS.length)];
      const office = tall || kit.hash(a, b, 12) < 0.2;
      const on = 0.12 + 0.7 * (0.75 * blockOn + 0.25 * hl);
      let any = false;
      for (let y = b; y < d; y++) for (let x = a; x < c; x++) {
        if (x >= GW || y >= GH) continue;
        const p = y * GW + x;
        if (type[p] !== T.LOT) continue;
        any = true;
        if (park) {
          type[p] = T.PARK;
          const tree = kit.noise2(x * 0.55, y * 0.55) > 0.55;
          const g = tree ? 0.55 + 0.25 * kit.hash(x, y) : 0.85;
          const base = tree ? kit.scale(lin('#4d8a3a'), 0.55) : kit.scale(lin('#7fae5e'), 0.5);
          alb[3 * p] = base[0] * g; alb[3 * p + 1] = base[1] * g; alb[3 * p + 2] = base[2] * g;
          height[p] = tree ? 1.5 : 0;
          if (kit.hash(x, y, 31) < 0.025) { const c2 = kit.blackbody(2400); emit.set([c2[0] * 0.06, c2[1] * 0.06, c2[2] * 0.06], 3 * p); thr[p] = 0.4; }
          else thr[p] = 2;
          continue;
        }
        // a garden strip on the far side of low houses; roof with a bevel
        if (!tall && c - a >= 4 && d - b >= 4 && (x === c - 1 || y === d - 1)) continue;
        const edge = (x === a || y === b) ? 1.12 : (x === c - 2 || y === d - 2 || x === c - 1 || y === d - 1) ? 0.8 : 1;
        const vent = kit.hash(x, y, 17) < (tall ? 0.08 : 0.04) ? 1.25 : 1;
        const k = edge * vent * (0.92 + 0.12 * kit.hash(x, y, 19));
        alb[3 * p] = roof[0] * k; alb[3 * p + 1] = roof[1] * k; alb[3 * p + 2] = roof[2] * k;
        height[p] = h;
        // windows: lit pixels seen from above (light wells, rooftop glow)
        const dens = tall ? 0.36 : 0.2;
        if (kit.hash(x, y, 23) < dens) {
          const warm = office ? kit.blackbody(4800) : kit.blackbody(2700);
          const v = (tall ? 0.12 : 0.075) * (0.6 + 0.8 * kit.hash(x, y, 29));
          emit[3 * p] = warm[0] * v; emit[3 * p + 1] = warm[1] * v; emit[3 * p + 2] = warm[2] * v;
        } else {
          emit[3 * p] = 0.006; emit[3 * p + 1] = 0.004; emit[3 * p + 2] = 0.003;
        }
        thr[p] = on + 0.06 * kit.hash(x, y, 37);
      }
      if (any && !park) lots.push({ x0: a, y0: b, x1: c, y1: d, h, tall });
      if (any && tall && kit.hash(a, b, 41) < 0.6) beacons.push([Math.floor((a + c) / 2), Math.floor((b + d) / 2), kit.hash(a, b, 43)]);
    }
    // alleys between lots stay LOT type with no roof: mark as ALLEY
    for (let y = by * 12 + 1; y < by * 12 + 12; y++) for (let x = bx * 12 + 1; x < bx * 12 + 12; x++) {
      const p = y * GW + x;
      if (type[p] === T.LOT && height[p] === 0) { type[p] = T.ALLEY; thr[p] = 2; }
    }
  }
  // garden trees: canopies over alleys and low houses break up the blocks
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const p = y * GW + x, t = type[p];
    if (!(t === T.ALLEY || (t === T.LOT && height[p] < 2.2))) continue;
    const n = kit.noise2(x * 0.32 + 7, y * 0.32 + 3) + 0.25 * kit.noise2(x * 0.9, y * 0.9);
    if (n < 0.92) continue;
    const g = 0.75 + 0.4 * kit.noise2(x * 0.9 + 4, y * 0.9) , base = kit.scale(lin('#5a9446'), 0.5);
    alb[3 * p] = base[0] * g; alb[3 * p + 1] = base[1] * g; alb[3 * p + 2] = base[2] * g;
    height[p] = Math.max(height[p], 2.4); type[p] = T.PARK; emit[3 * p] = emit[3 * p + 1] = emit[3 * p + 2] = 0; thr[p] = 2;
  }
  // everything that is not a lot or park
  const SOD = kit.blackbody(2100);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const p = y * GW + x, t = type[p];
    let c = null, e = null, th = 0.35;
    if (t === T.STREET || t === T.ALLEY) {
      c = t === T.STREET ? kit.scale(lin('#8a857c'), 0.35) : kit.scale(lin('#8c8270'), 0.3);
      if (t === T.STREET) {
        const lamp = (x % 12 === 0 && y % 6 === 3) || (y % 12 === 0 && x % 6 === 3);
        e = kit.scale(SOD, lamp ? 0.14 : 0.025);
      } else th = 2;
    } else if (t === T.WATER) {
      c = kit.scale(lin('#5aa0cc'), 0.42); water.push(p); th = 2;
      const yc = riverY(x);
      if (Math.abs(y - yc) < RIVER_HW) {
        const bank = y < yc ? yc - RIVER_HW : yc + RIVER_HW, my = Math.round(2 * bank - y);
        if (my >= 0 && my < GH) riverPix.push(p, my * GW + x);
      }
    }
    else if (t === T.BRIDGE) { c = kit.scale(lin('#d6cfc0'), 0.5); e = kit.scale(SOD, x % 3 === 0 || y % 3 === 0 ? 0.05 : 0.02); }
    else if (t === T.QUAY) { c = kit.scale(lin('#c9c0ac'), 0.4); e = kit.scale(SOD, kit.hash(x, y, 51) < 0.08 ? 0.07 : 0.008); }
    else if (t === T.RAIL) { c = kit.scale(lin('#8c8478'), 0.5); e = [0.006, 0.005, 0.006]; }
    else if (t === T.STADIUM) {
      const ax = Math.abs(x - STAD.cx), ay = Math.abs(y - STAD.cy);
      const pitch = ax <= STAD.px && ay <= STAD.py;
      const m = Math.max(ax / STAD.hx, ay / STAD.hy);
      if (pitch) {   // mown stripes, thin dim touchlines
        const line = ax === STAD.px || ay === STAD.py || y === STAD.cy;
        const stripe = Math.floor((y - STAD.cy + 40) / 3) % 2 ? 1 : 0.8;
        c = line ? kit.scale(lin('#c8d0c0'), 0.55) : kit.scale(lin('#62b04a'), stripe * 0.7);
        e = line ? [0.012, 0.014, 0.012] : kit.scale(lin('#3f8a32'), 0.04);
      } else if (m > 0.93) {   // the roof edge: dark corrugated sheet, never lit
        c = kit.scale(lin('#5a5852'), (x + y) % 2 ? 0.55 : 0.4); e = [0.002, 0.002, 0.002];
      } else {   // stands: a speckled crowd, the home end in red
        const home = y > STAD.cy + STAD.py, fan = kit.hash(x, y, 71);
        const base = home && fan < 0.7 ? lin('#b8352c') : fan < 0.35 ? lin('#5d6c86') : fan < 0.7 ? lin('#8a8478') : lin('#c8b48a');
        c = kit.scale(base, 0.45 + 0.45 * kit.hash(x, y, 73));
        e = kit.hash(x, y, 75) < 0.12 ? [0.02, 0.018, 0.015] : [0.003, 0.002, 0.002];   // phone screens
      }
      height[p] = m > 0.93 ? 3 : pitch ? 0 : 2 * m;
    }
    if (c) { alb[3 * p] = c[0]; alb[3 * p + 1] = c[1]; alb[3 * p + 2] = c[2]; }
    if (e) { emit[3 * p] = e[0]; emit[3 * p + 1] = e[1]; emit[3 * p + 2] = e[2]; }
    if (c && t !== T.LOT && t !== T.PARK) thr[p] = th;
  }
  for (const s of SHIPS) for (let y = s.y0; y <= s.y1; y++) for (let x = s.x0; x <= s.x1; x++) {
    const bow = s.x1 - x, mid = (s.y0 + s.y1) / 2;
    if (bow < 3 && Math.abs(y - mid) > bow * 0.8 + 0.3) continue;
    const p = y * GW + x, deck = y > s.y0 && y < s.y1 && x > s.x0 + 1 && x < s.x1 - 3;
    const c = deck ? (kit.hash(x, y, 61) < 0.5 ? lin('#c0782e') : lin('#3c7aa0')) : s.hull;   // containers
    alb.set(c, 3 * p); height[p] = 2; type[p] = T.QUAY;
    const lit = (x - s.x0) % 4 === 1 && deck;
    emit.set(lit ? kit.scale(kit.blackbody(3500), 0.08) : [0.004, 0.003, 0.003], 3 * p); thr[p] = 0.3;
  }
  // minor-street lanes: straight runs of street/bridge pixels
  const drivable = (x, y) => { const t = type[y * GW + x]; return t === T.STREET || t === T.BRIDGE; };
  for (let k = 0; k < GW; k += 12) {
    for (const horiz of [true, false]) {
      let start = -1;
      for (let a = 0; a <= GW; a++) {
        const ok = a < GW && (horiz ? drivable(a, k) : drivable(k, a));
        if (ok && start < 0) start = a;
        if (!ok && start >= 0) {
          if (a - start > 14) minorLanes.push(horiz ? { x0: start, y0: k, x1: a - 1, y1: k, len: a - 1 - start, horiz } : { x0: k, y0: start, x1: k, y1: a - 1, len: a - 1 - start, horiz });
          start = -1;
        }
      }
    }
  }
}
build();

/** Daylight albedo with cast shadows for the sun at hour h (cached per minute by the caller). */
export function sunDay(h, out) {
  const a = ((h - 6) / 12) * Math.PI;                  // 6 h east, 12 h south, 18 h west
  const elev = Math.max(0.12, Math.sin(Math.max(0.05, Math.min(Math.PI - 0.05, a))) * 0.75);
  const tanE = Math.tan(elev), sx = Math.cos(a), sy = Math.sin(a) * 0.8 + 0.2;  // never straight overhead in plan
  const sl = Math.hypot(sx, sy), ux = sx / sl, uy = sy / sl;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const p = y * GW + x, h0 = height[p];
    let sh = 0;
    for (let k = 1; k <= 7; k++) {
      const qx = Math.round(x + ux * k), qy = Math.round(y + uy * k);
      if (qx < 0 || qy < 0 || qx >= GW || qy >= GH) break;
      const over = height[qy * GW + qx] - h0 - k * tanE;
      if (over > 0) { sh = Math.max(sh, Math.min(1, over * 1.5)); if (sh >= 1) break; }
    }
    const f = 1 - 0.6 * sh;
    out[3 * p] = alb[3 * p] * f; out[3 * p + 1] = alb[3 * p + 1] * f; out[3 * p + 2] = alb[3 * p + 2] * f * (1 + 0.15 * sh);
  }
  return out;
}
