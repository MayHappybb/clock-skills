// Doppler: the glass is a weather radar's base-reflectivity display, and the
// time is the weather. Each numeral is a squall line: a chain of convective
// cells strung along the digit's path, the hottest cores red to magenta (hail)
// in the middle of the stroke, flat bands of decreasing reflectivity round
// it, the honest NWS colour steps (light green, green, dark green, yellow,
// gold, orange, red, dark red, magenta). The 3's bowls are bow echoes, the 9's
// tail curls into a hook echo. Under it a dark flat basemap: county lines on
// the plains' survey grid, a river that is the state line, an interstate, a
// coast and shelf, range rings round the radar site between hours and minutes.
//
// Always alive: the sweep turns round the site every 4 s, a faint afterglow
// wedge trailing it; every pass refreshes the echo, so each core re-reads a
// little hotter or cooler as the beam crosses it; the echoes' ragged edges
// evolve as the storm texture drifts north-east; small showers bloom and die
// in the clear air (they only change when the beam sees them); lightning
// strike marks flash on the strongest cores.
//
// Minute: the old line rains itself out from :57.9: its bands step down the
// palette and the line breaks into its separate cells, then the cells
// collapse (nothing left by :59.75). After :00 the new digit initiates as a
// string of small cells along its whole path, evenly, which grow and merge
// into a line (whole by :02.4). Never a wrong digit: old and new never
// overlap, and both are removed and built evenly along the whole path.
//
// Hour: the radar switches product. A tornado warning polygon is drawn round
// the new hours, and the beam wipes the display to base velocity, one
// revolution: echoes moving away from the radar turn red, towards it green,
// the hours (west of the site) green, the minutes (east) red, the zero line
// grey; it holds one turn, then the next turn wipes back to reflectivity.
// The time reads all the way through, in either product.
//
// Palette: reflectivity and velocity are the National Weather Service's own
// convention, kept honest: every echo pixel is a dBZ value through a 5-dBZ
// lookup table (flat steps, no shading). The basemap is a deliberate deep
// slate-teal land and navy sea, so the echoes are the only saturated thing
// on the glass. Hard pixels everywhere (radar data is binned); AA only for
// the sweep line, which glides.
//
// Cost: one integer pass over the glass through the lookup tables (bearing
// table, glow table, dither, palette), plus an integer pass over each digit's
// tables (two byte lookups, two noise lookups and lerps, a max), all charged
// to g.cost.box. Nothing is redrawn outside the canvas. Flash: digit tables
// 10 x 3 x (HOUR + MIN boxes) bytes = 176 KB (FLASH_BYTES), basemap 12.8 KB,
// bearings 25.6 KB, noise 8 KB, colour tables ~3 KB: ~225 KB.

import { hash, clockFields, to565, R, G, B } from '../js/kit.js';
import { SLOTS, FLASH_BYTES } from './doppler-glyphs.js';
import { W, H, SITE, BASE, ANG, N_IDX, label, labelWidth } from './doppler-map.js';

const N = W * H;
const P = 4;                    // sweep period, s
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const mixc = (a, b, t) => ((Math.round(R(a) + (R(b) - R(a)) * t) << 16) | (Math.round(G(a) + (G(b) - G(a)) * t) << 8) | Math.round(B(a) + (B(b) - B(a)) * t));

// ------------------------------------------------------------ colour tables (flash)
const BASE_COL = [0x1a272c, 0x0a1526, 0x2e4246, 0x5b7073, 0x1e4c72, 0x4a7c98, 0x2a4b56, 0x45442e, 0x0f2034];
const DBZ_COL = [   // 5-dBZ bins from 20
  0x38e838, 0x14b814, 0x0a8a14, 0xf0e40c, 0xdcb000, 0xfa8a00, 0xf01818, 0xc80c0c, 0xa00a14, 0xf014f0, 0x9a50d0, 0xffffff,
];
export const LEGEND = DBZ_COL.slice(0, 10);
const VEL_COL = [0x9cff9c, 0x14f014, 0x0cc40c, 0x0a960a, 0x0c6e14, 0x3c5a3c, 0x686868, 0x6a3434, 0x8c1010, 0xb40c0c, 0xe00c0c, 0xff3434, 0xffa0ac];
const GLOW = 8;                 // afterglow levels
const SWEEP_TINT = 0xbdeeff;
const BASE_LUT = new Uint16Array(GLOW * 16), ECHO_LUT = new Uint16Array(GLOW * 96), VEL_LUT = new Uint16Array(GLOW * 16);
for (let gl = 0; gl < GLOW; gl++) {
  const tb = (gl / (GLOW - 1)) * 0.2, te = (gl / (GLOW - 1)) * 0.2;
  for (let i = 0; i < N_IDX; i++) BASE_LUT[gl * 16 + i] = to565(mixc(BASE_COL[i], SWEEP_TINT, tb));
  for (let d = 0; d < 96; d++) ECHO_LUT[gl * 96 + d] = to565(mixc(DBZ_COL[Math.min(11, Math.max(0, (d - 20) / 5 | 0))], 0xffffff, te));
  for (let v = 0; v < 13; v++) VEL_LUT[gl * 16 + v] = to565(mixc(VEL_COL[v], 0xffffff, te));
}
// afterglow behind the beam: by 1/64 of a turn since it passed, in 1/16 levels
const GLOWQ = new Uint8Array(1024);
for (let i = 0; i < 1024; i++) { const u = i / 190; GLOWQ[i] = u >= 1 ? 0 : Math.round((GLOW - 1) * 16 * (1 - u) * (1 - u) * (i < 3 ? 1 : 0.8)); }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// radial velocity: the storms move east; outbound red, inbound green
const COSB = new Int16Array(256);
for (let a = 0; a < 256; a++) COSB[a] = Math.round(64 * Math.cos((a / 256) * Math.PI * 2 - Math.PI / 2));
const VMAG = new Uint8Array(96);
for (let d = 0; d < 96; d++) VMAG[d] = Math.round(2 + Math.min(1, Math.max(0, (d - 20) / 42)) * 5);

// ------------------------------------------------------------ storm texture (flash): periodic value noise, 64 x 64
function noiseTable(seed, amp) {
  const t = new Int8Array(64 * 64), C = 8;
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      let v = 0, w = 0;
      for (const [cs, wt] of [[C, 1], [C / 2, 0.5]]) {
        const fx = x / cs, fy = y / cs, ix = Math.floor(fx), iy = Math.floor(fy), ux = smooth(fx - ix), uy = smooth(fy - iy);
        const per = 64 / cs, l = (i, j) => hash(((i % per) + per) % per, ((j % per) + per) % per, seed + cs) / 4294967296;
        const a = l(ix, iy), b = l(ix + 1, iy), c = l(ix, iy + 1), d = l(ix + 1, iy + 1);
        v += wt * (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy); w += wt;
      }
      t[y * 64 + x] = Math.round((v / w - 0.5) * 2 * amp * 1.6);
    }
  return t;
}
const NA = noiseTable(5, 5), NB = noiseTable(9, 4);

// ------------------------------------------------------------ keep-out for showers: distance to any digit, px (clamped 8)
const KEEP = new Uint8Array(N).fill(8);
{
  const any = new Uint8Array(N);
  for (const s of SLOTS) {
    const S = s.S;
    for (let y = 0; y < S.th; y++) for (let x = 0; x < S.tw; x++) {
      const gx = s.bx + x, gy = s.by + y;
      if (gx >= 0 && gy >= 0 && gx < W && gy < H && S.ANY[y * S.tw + x]) any[gy * W + gx] = 1;
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let d = 8;
    for (let j = -8; j <= 8; j++) for (let i = -8; i <= 8; i++) {
      const xx = x + i, yy = y + j;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || !any[yy * W + xx]) continue;
      const e = Math.max(Math.abs(i), Math.abs(j));
      if (e < d) d = e;
    }
    // the type at the top right is kept clear too
    if (x >= 76 && y <= 17) d = 0;
    KEEP[y * W + x] = d;
  }
}
const SQRT4 = new Uint8Array(1024);     // 4 * sqrt(n / 4): distance in quarter px from 4 * d^2
for (let i = 0; i < 1024; i++) SQRT4[i] = Math.min(255, Math.round(4 * Math.sqrt(i / 4)));

// ------------------------------------------------------------ per frame state
const DBZ = new Uint8Array(N);
const FL = new Int8Array(64);
const LIVE = [];                         // strong cores on the glass this frame, for lightning

const bearing16 = (x, y) => ANG[Math.min(H - 1, Math.max(0, y | 0)) * W + Math.min(W - 1, Math.max(0, x | 0))];
/** For a thing at bearing b16: seconds since the beam last crossed it, and the index of that pass. */
function lastPass(td, b16) {
  const tb = (b16 / 65536) * P;
  const k = Math.floor((td - tb) / P);
  return [td - (k * P + tb), k];
}

/** The state of a slot this frame: which digit, and how far it has rained out. */
function slotState(k, cur, prev, next, s) {
  if (s >= 57.9 && next[k] !== cur[k]) {
    if (s >= 59.75) return null;
    const uL = smooth((s - 57.9) / 1.4), uc = clamp01((s - 58.35) / 1.4), uC = uc * uc * Math.sqrt(uc);
    return { d: +cur[k], offL: Math.round(52 * uL), offC: Math.round(78 * uC), nm: 16 + Math.round(26 * uC) };
  }
  if (s < 3 && prev[k] !== cur[k]) {
    const uC = smooth(s / 0.95), uL = smooth((s - 0.45) / 1.85);
    if (uC <= 0) return null;
    return { d: +cur[k], offL: Math.round(52 * (1 - uL)), offC: Math.round(64 * (1 - uC)), nm: 16 + Math.round(18 * (1 - uL)) };
  }
  return { d: +cur[k], offL: 0, offC: 0, nm: 16 };
}

// ------------------------------------------------------------ the hour show
const T_WARN = 2.4, T_V1 = 3.0, T_V2 = 3.0 + 2 * P, T_END = T_V2 + P + 0.6;
const POLY = [[1.5, 3.5], [71.5, 1.5], [74.5, 77.5], [0.5, 78.5]];
const POLY_LEN = POLY.reduce((a, p, i) => a + Math.hypot(POLY[(i + 1) % 4][0] - p[0], POLY[(i + 1) % 4][1] - p[1]), 0);
const WARN = 0xff2a2a;

export default {
  name: 'Doppler',
  blurb: 'A weather radar where every numeral is a squall line: the beam sweeps, storms rain out and re-form at each minute, the hour switches to velocity.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const td = f.h * 3600 + f.m * 60 + s;
    const cur = f.hh + f.mm;
    const pf = clockFields(new Date(ctx.date.getTime() - 60000)), nf = clockFields(new Date(ctx.date.getTime() + 60000));
    const prev = pf.hh + pf.mm, next = nf.hh + nf.mm;
    const hourShow = pf.h !== f.h && s < T_END;

    // ---- the echo field, dBZ per pixel
    DBZ.fill(0);
    g.cost.px += N >> 1;
    const oxa = td * 3.0, oya = td * 1.6;                  // the storm texture drifts north-east
    const oxi = Math.floor(oxa), fxa = ((oxa - oxi) * 256) | 0, oyi = Math.floor(oya), fya = ((oya - oyi) * 256) | 0;
    LIVE.length = 0;
    let work = 0;
    for (let k = 0; k < 4; k++) {
      const st = slotState(k, cur, prev, next, s);
      if (!st) continue;
      const S = SLOTS[k].S, gl = S.glyphs[st.d], bx = SLOTS[k].bx, by = SLOTS[k].by;
      // each core re-read on every pass of the beam, cross-faded over 0.35 s
      for (let c = 0; c < gl.n; c++) {
        const cx = bx + gl.cells[c][0], cy = by + gl.cells[c][1];
        const [age, pass] = lastPass(td, bearing16(cx, cy));
        const a = (hash(k * 16 + st.d, c, pass) % 11) - 5, b = (hash(k * 16 + st.d, c, pass - 1) % 11) - 5;
        const u = smooth(age / 0.35);
        FL[c] = Math.round(b + (a - b) * u);
        if (st.offC === 0) LIVE.push(cx, cy, k);
      }
      const { LINE, CELL, CID } = gl, offL = st.offL, offC = st.offC, nm = st.nm, tw = S.tw;
      for (let y = 0; y < S.th; y++) {
        const gy = by + y;
        if (gy < 0 || gy >= H) continue;
        const rowA = (gy & 63) << 6, ry0 = ((gy + oyi) & 63) << 6, ry1 = ((gy + oyi + 1) & 63) << 6;
        for (let x = 0; x < tw; x++) {
          const t = y * tw + x, ln = LINE[t], ce = CELL[t];
          if ((ln | ce) === 0) continue;
          const gx = bx + x;
          if (gx < 0 || gx >= W) continue;
          let v = ln - offL;
          const vc = ce + FL[CID[t]] - offC;
          if (vc > v) v = vc;
          if (v < 2) continue;
          const xa = (gx + oxi) & 63, na = (NA[rowA | xa] * (256 - fxa) + NA[rowA | ((xa + 1) & 63)] * fxa) >> 8;
          const nb = (NB[ry0 | (gx & 63)] * (256 - fya) + NB[ry1 | (gx & 63)] * fya) >> 8;
          v += ((na + nb) * nm) >> 4;
          const i = gy * W + gx;
          if (v > DBZ[i]) DBZ[i] = v > 95 ? 95 : v;
          work++;
        }
      }
      g.cost.box += S.tw * S.th;
    }
    g.cost.box += work * 6;

    // ---- showers in the clear air: bloom and die, seen only when the beam passes
    for (let j = 0; j < 5; j++) {
      const T = 10 + 2.7 * j, ph = td + 41 * j, c = Math.floor(ph / T), u0 = ph / T - c;
      let x0 = -1, y0 = -1;
      for (let tr = 0; tr < 12; tr++) {
        const h = hash(c, j, tr), xx = 2 + (h % 156), yy = 2 + ((h >>> 8) % 76);
        if (KEEP[yy * W + xx] >= 6) { x0 = xx; y0 = yy; break; }
      }
      if (x0 < 0) continue;
      const cx = x0 + 0.5 + 0.7 * u0 * T, cy = y0 + 0.5 - 0.35 * u0 * T;
      const [age] = lastPass(td, bearing16(cx, cy));
      const amp = (uu) => (uu <= 0 || uu >= 1 ? 0 : 20 + (hash(c, j, 99) % 22) * Math.sin(Math.PI * uu));
      const uNow = amp(u0 - age / T), uOld = amp(u0 - (age + P) / T);
      const A = uOld + (uNow - uOld) * smooth(age / 0.35);
      if (A < 21) continue;
      const Ai = Math.round(A);
      const xb = Math.floor(cx - 6), yb = Math.floor(cy - 6);
      for (let y = yb; y < yb + 13; y++) {
        if (y < 0 || y >= H) continue;
        const dy = y + 0.5 - cy;
        for (let x = xb; x < xb + 13; x++) {
          if (x < 0 || x >= W) continue;
          const dx = x + 0.5 - cx, q = (4 * (dx * dx + dy * dy)) | 0;
          if (q >= 1024) continue;
          const i = y * W + x, keep = KEEP[i];
          let v = Ai - ((SQRT4[q] * 5) >> 2) - (keep < 6 ? (6 - keep) * 6 : 0) + NA[((y & 63) << 6) | ((x + oxi) & 63)];
          if (v > DBZ[i]) DBZ[i] = v < 0 ? 0 : v;
        }
      }
      g.cost.box += 169 * 6;
    }

    // ---- the beam
    const S16 = Math.floor(((td % P) / P) * 65536) & 0xffff;
    // product wipe at the hour: which pixels the beam has turned to velocity
    let vA = 0, vW = 0, bA = 0, bW = -1;
    if (hourShow && s >= T_V1) {
      vA = Math.floor((((td - (s - T_V1)) % P) / P) * 65536) & 0xffff;
      vW = Math.min(65536, Math.floor(((s - T_V1) / P) * 65536));
      if (s >= T_V2) { bA = Math.floor((((td - (s - T_V2)) % P) / P) * 65536) & 0xffff; bW = Math.min(65536, Math.floor(((s - T_V2) / P) * 65536)); }
    }
    const velOn = vW > 0;

    // ---- the frame pass: every pixel through the tables
    const buf = g.buf;
    for (let y = 0, i = 0; y < H; y++) {
      const br = (y & 3) << 2;
      for (let x = 0; x < W; x++, i++) {
        const an = ANG[i];
        const gq = GLOWQ[((S16 - an) & 0xffff) >> 6];
        const gl = (gq + BAYER[br | (x & 3)]) >> 4;
        const d = DBZ[i];
        if (d < 20) buf[i] = BASE_LUT[(gl << 4) | BASE[i]];
        else if (velOn && ((an - vA) & 0xffff) < vW && !(bW >= 0 && ((an - bA) & 0xffff) < bW)) {
          let v = (COSB[an >> 8] * VMAG[d]) >> 6;
          v = v < -6 ? -6 : v > 6 ? 6 : v;
          buf[i] = VEL_LUT[(gl << 4) | (6 + v)];
        } else buf[i] = ECHO_LUT[gl * 96 + d];
      }
    }
    g.cost.px += N; g.cost.box += N * 5;

    // the beam itself: a pale line that glides
    const ba = (S16 / 65536) * Math.PI * 2;
    g.thickLine(SITE[0], SITE[1], SITE[0] + 110 * Math.sin(ba), SITE[1] - 110 * Math.cos(ba), 1, SWEEP_TINT, { aa: true, a: 0.5 });

    // ---- lightning: strike marks on the strongest cores
    const LT = 0.55;
    const nL = Math.floor(td / LT);
    for (let n = nL - 3; n <= nL; n++) {
      const h = hash(n, 77, 3);
      if (!LIVE.length || h % (hourShow ? 2 : 5) !== 0) continue;
      const age = td - n * LT - ((h >>> 8) % 100) / 400;
      if (age < 0 || age > 1.4) continue;
      const m = ((h >>> 12) % (LIVE.length / 3)) * 3;
      const lx = Math.round(LIVE[m] - 0.5 + (((h >>> 20) & 3) - 1.5)), ly = Math.round(LIVE[m + 1] - 0.5 + (((h >>> 24) & 3) - 1.5));
      // the strike: a white flash, then a yellow '+' that fades, keylined so it reads on a core
      const fresh = age < 0.12;
      const col = fresh ? 0xffffff : 0xffee40, a = fresh ? 1 : 1 - smooth((age - 0.12) / 1.28);
      g.fillRect(lx - 3, ly - 1, 7, 3, 0x101418, { a: 0.75 * a });
      g.fillRect(lx - 1, ly - 3, 3, 7, 0x101418, { a: 0.75 * a });
      g.fillRect(lx - 2, ly, 5, 1, col, { a });
      g.fillRect(lx, ly - 2, 1, 5, col, { a });
    }

    // ---- the site
    g.fillRect(Math.floor(SITE[0]) - 1, Math.floor(SITE[1]) - 1, 3, 3, 0x0a1012);
    g.fillRect(Math.floor(SITE[0]), Math.floor(SITE[1]) - 1, 1, 3, 0xe8f4f4);
    g.fillRect(Math.floor(SITE[0]) - 1, Math.floor(SITE[1]), 3, 1, 0xe8f4f4);

    // ---- the overlay: station, product, legend
    const legBearing = bearing16(118, 9);
    const legVel = velOn && ((legBearing - vA) & 0xffff) < vW && !(bW >= 0 && ((legBearing - bA) & 0xffff) < bW);
    const TXT = 0x9fb4b8, DIM = 0x63787c;
    let tx = label(g, 'KDOP', 79, 1, TXT) + 4;
    tx = label(g, legVel ? 'BV' : 'BR', tx, 1, 0xd8e4e4) + 3;
    label(g, '0.5°', tx, 1, DIM);
    const date = `${f.dd} ${f.month}`;
    label(g, date, 159 - labelWidth(date), 1, TXT);
    const LX = 79, LW = 6;
    if (legVel) {
      for (let v = 0; v < 13; v++) g.fillRect(LX + Math.round(v * 4.6), 8, 5, 3, VEL_COL[v]);
      label(g, 'IN', LX, 12, DIM); label(g, 'OUT', LX + 60 - labelWidth('OUT'), 12, DIM);
      label(g, 'KT', 159 - labelWidth('KT'), 8, DIM);
    } else {
      for (let b = 0; b < 10; b++) g.fillRect(LX + b * LW, 8, LW, 3, LEGEND[b]);
      label(g, '20', LX, 12, DIM); label(g, '45', LX + 5 * LW - 3, 12, DIM); label(g, '65', LX + 9 * LW - 1, 12, DIM);
      label(g, 'DBZ', 159 - labelWidth('DBZ'), 8, DIM);
    }

    // ---- the hour: tornado warning polygon round the new hours
    if (hourShow && s >= T_WARN) {
      const grow = smooth((s - T_WARN) / 1.2), fade = 1 - smooth((s - (T_END - 1.2)) / 1.2);
      const blink = s < T_WARN + 1.2 ? 1 : 0.7 + 0.3 * Math.round(0.5 + 0.5 * Math.sin(s * 7));
      let left = POLY_LEN * grow;
      for (let e = 0; e < 4 && left > 0; e++) {
        const [ax, ay] = POLY[e], [bx2, by2] = POLY[(e + 1) % 4], L = Math.hypot(bx2 - ax, by2 - ay), u = Math.min(1, left / L);
        g.thickLine(ax, ay, ax + (bx2 - ax) * u, ay + (by2 - ay) * u, 1.6, WARN, { aa: true, a: fade * blink });
        left -= L;
      }
      label(g, 'TOR', 4, 74, WARN, fade * blink);
    }
  },
};

export const FLASH = FLASH_BYTES;
