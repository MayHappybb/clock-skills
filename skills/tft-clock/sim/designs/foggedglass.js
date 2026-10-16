// Fogged Glass: a window misted up on a rainy night, and somebody has written
// the time on it with a fingertip. The numerals are the only clear glass:
// through each wiped stroke the street outside is sharp (out-of-focus city
// lights as bokeh discs, wet road reflections, rain running down the outside
// of the pane), while everywhere else the condensation turns the same lights
// into big soft glows. So the time is literally made of the city seen through
// it, framed by the bright ridge of water the finger pushed aside.
//
// The font (foggedglass-glyphs.js) is finger handwriting: one or two strokes
// per digit, a round 6 px fingertip, a press where it lands and a lift where
// it leaves, slanted, the line of writing rising to the right like a quick
// note on a window. Hours left, minutes right, the colon two fingertip dabs.
//
// At rest the time is never still. The street moves inside the numerals:
// headlights and tail lights slide through their lower halves, raindrops run
// down the outside of the glass across every stroke, the traffic light
// changes. On the beat (once a second): the neon sign seen through the colon
// dabs flicks on bottom to top (the colon blinks because the sign does, and
// the fog round it flushes with its colour), a glint of light runs along one
// numeral's water ridge the way the finger wrote it, and water gathered at
// the bottom of another numeral breaks loose and runs down the fog, cutting a
// clear trail that mists over again in ~10 s. Bigger moments: at :15 and :45
// a car turns at the corner and its headlight beam sweeps across the fog
// (every ridge lights up as it passes); around :30 lightning: the fog flashes
// and, for a moment, the skyline stands black against a white sky inside the
// strokes.
//
// Minute turn: the old numeral mists over (:58.4-:59.9): the condensation
// creeps in from its ragged edges and thickens, so it only ever thins, never
// changes shape; then an unseen fingertip presses on the glass and writes the
// new one stroke by stroke after :00 (a bright crescent of pushed water
// leading the fingertip, eased start and stop, a pause where it lifts for a
// second stroke), changing digits written left to right with a 0.16 s
// stagger; fingerprint streaks in the fresh wipe evaporate over 3 s.
// Hour: the last tram goes past: it slides in from the right at 1 px a frame,
// seen sharp through the numerals (lit windows, maroon body) and as a warm
// flood of light through the whole fog, pantograph sparks flashing the glass
// blue; behind it the street changes to the next part of the day (day,
// dusk, evening, late night) and the neon sign to its next colour.
//
// Palette: deliberately two worlds. Clear glass is the night street: deep
// indigo facades, sodium orange lamps, shop-sign neon (cyan, red, gold,
// green, pink), white headlights and red tail lights, all saturated. Fog is
// the same light scattered: a calm pale slate/lilac with soft pastel glows.
// The ridge round every stroke is the lightest thing on the glass and the
// stroke interior the darkest, so the time is the strongest contrast. By day
// the fog is a bright overcast grey; late at night (23-07) a dim sodium grey,
// fewer windows lit, and the backlight down to 45%.
//
// Cost (esp32c3 estimate): one pass over the glass composites fog over the
// street (fog from a 21 x 11 glow grid, bilinear in fixed point, grain,
// ridge, dither): ~50 integer ops a pixel, billed as such. Digit states are
// lookups into two byte fields per digit (43 KB flash). The static street is
// rendered once per palette into a cached 25.6 KB image (RAM) and billed in
// the frame that builds it (~1 ms). RAM: street cache x2 (51 KB, the second
// only while the hour crossfades) + fog and ridge masks (25.6 KB).

import { clockFields, previousMinute, rand, hash, sin, clamp, progress, ease } from '../js/kit.js';
import { GLYPHS, GLYPH_BYTES, FW, FH, OX, OY, R0 } from './foggedglass-glyphs.js';
import {
  PALS, palKey, NEON, HEAD, streetFor, addGlow, reflect, cars, tramX, TRAM_LEN,
  GX, GY, GCELL, ROOF, mixc, R8, G8, B8,
} from './foggedglass-city.js';

const W = 160, H = 80, N = W * H;

// ------------------------------------------------------------ layout
const SLOT_X = [14, 42, 86, 114];             // centre-line origins: the line of writing rises to the right
const SLOT_Y = [19, 17, 15, 13];
const COLON_X = 58, COLON_Y = 9;              // the colon's field origin

// ------------------------------------------------------------ timing
const CREEP0 = 58.7, CREEP1 = 59.97, KMAX = 6.2;          // the old numeral mists over
const W0 = 0.05, STAGGER = 0.16;                          // the new one is written
const PRESS = 0.11, LIFTT = 0.12, VMAX = 126;             // fingertip press, lift; peak speed px/s (2.1 px a frame)
const TA = 0.16, TB = 0.24, VK = 1 / (1 - TA / 2 - TB / 2);
const FRESH = 3.0;
const GSAT = 0.72;                                       // how much of a glow's colour survives the mist

/** Trapezoidal velocity: accelerate over TA, cruise, settle over TB. */
function trap(u) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < TA) return (VK * u * u) / (2 * TA);
  if (u < 1 - TB) return VK * (TA / 2 + (u - TA));
  const v = 1 - u;
  return 1 - (VK * v * v) / (2 * TB);
}
const strokeDur = (len) => Math.max(0.1, (len * VK) / VMAX);

/** Where the fingertip is t s after it first touches: front arclength, per-stroke press, running? */
function writeState(gl, t) {
  const st = { sf: -9, p0: 0, p1: 0, run: false };
  let tt = t;
  for (let j = 0; j < gl.lens.length; j++) {
    if (tt < 0) break;
    const p = clamp(tt / PRESS, 0, 1), s0 = gl.starts[j], len = gl.lens[j];
    if (j === 0) st.p0 = ease.outQuad(p); else st.p1 = ease.outQuad(p);
    if (tt < PRESS) { st.sf = s0; break; }
    tt -= PRESS;
    const d = strokeDur(len);
    if (tt < d) { st.sf = s0 + len * trap(tt / d); st.run = true; break; }
    st.sf = s0 + len;
    tt -= d + LIFTT;
  }
  return st;
}

// ------------------------------------------------------------ static tables (flash)
// TEX: the condensation's grain and its bigger beads; NZ: smooth noise that
// makes the mist creep in patches; BEAD: which ridge pixels are fat drops.
const TEX = new Int8Array(N), NZ = new Int8Array(N), BEAD = new Uint8Array(N);
{
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let t = ((hash(x, y, 3) & 15) - 7.5) * 0.7;
      // beads of condensation, more of them low on the pane
      const h = hash(x >> 1, y >> 1, 8) & 1023;
      if (h < 14 + (y > 50 ? 20 : 0)) t += (x & 1) === 0 && (y & 1) === 0 ? 14 : -10;
      TEX[i] = Math.round(t);
      const fx = x / 6, fy = y / 6, ix = Math.floor(fx), iy = Math.floor(fy), ux = fx - ix, uy = fy - iy;
      const r = (a, b) => (hash(a, b, 21) & 255) / 255;
      const sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
      const a = r(ix, iy), b = r(ix + 1, iy), c = r(ix, iy + 1), d = r(ix + 1, iy + 1);
      NZ[i] = Math.round((a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy - 0.5) * 254);
      const bb = hash(x, y, 31) & 255;
      BEAD[i] = bb < 40 ? 255 : bb < 120 ? 150 : 90;
    }
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const FLASH_BYTES = GLYPH_BYTES + N * 3 + 160;

// ------------------------------------------------------------ working buffers (RAM)
const A = new Uint8Array(N);       // fog cover, 255 = misted
const E = new Uint8Array(N);       // water ridge brightness
const GRID = new Float32Array(GX * GY * 3);
const NODE = new Int32Array(GX * GY * 3);
const ROWV = new Int32Array(GX * 3);

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const posmod = (a, n) => ((a % n) + n) % n;

// digits of the clock at an epoch second (for the drops already running)
const digitsAt = (n) => { const f = clockFields(new Date(n * 1000)); return f.hh + f.mm; };

export default {
  name: 'Fogged Glass',
  blurb: 'A misted window on a rainy night: the time is finger-written in the condensation, the street\'s lights sharp through every stroke; drops run, the neon blinks through the colon, the last tram floods the glass at the hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, tg = ctx.date.getTime() / 1000;
    const prv = previousMinute(ctx.date), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nex = nxt.hh + nxt.mm;
    ctx.lcd.backlight(1 - 0.5 * ctx.night);
    const buf = g.buf;

    // ---- the hour: tram, sparks, and the street turning to the next part of the day
    let hu = null;                                     // seconds from the hour
    if (s >= 56 && nxt.h !== f.h) hu = s - 60;
    else if (s < 4 && prv.h !== f.h) hu = s;
    let keyOld = palKey(f.h), keyNew = keyOld, blend = 1;
    if (hu !== null) {
      keyOld = palKey(hu < 0 ? f.h : prv.h); keyNew = palKey(hu < 0 ? nxt.h : f.h);
      blend = keyOld === keyNew ? 1 : sm((hu + 1.2) / 2.6);
    }
    const PN = PALS[keyNew], PO = PALS[keyOld];
    const hourIdx = (hu !== null && hu < 0 ? nxt.h : f.h) % NEON.length;
    const neonOld = NEON[(hu !== null && hu < 0 ? f.h : (f.h + 23) % 24) % NEON.length];
    const neonCol = hu !== null ? mixc(neonOld, NEON[hourIdx], sm((hu + 0.6) / 1.6)) : NEON[f.h % NEON.length];

    // ---- the sharp street: cached static image, dissolved across palettes at the hour
    const stN = streetFor(keyNew), stO = keyOld !== keyNew ? streetFor(keyOld) : null;
    if (stN.cost.built !== true) { billBuild(g, stN.cost); stN.cost.built = true; }
    if (stO && stO.cost.built !== true) { billBuild(g, stO.cost); stO.cost.built = true; }
    if (!stO || blend >= 1) buf.set(stN.img.buf);
    else if (blend <= 0) buf.set(stO.img.buf);
    else {
      const bn = stN.img.buf, bo = stO.img.buf, th = (blend * 16) | 0;
      for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) buf[i] = BAYER[((y & 3) << 2) | (x & 3)] < th ? bn[i] : bo[i];
      g.cost.box += N * 2;
    }
    g.cost.px += N;
    // the glow grid: static part
    const gN = stN.glow, gO = stO ? stO.glow : gN;
    for (let k = 0; k < GRID.length; k++) GRID[k] = gO[k] + (gN[k] - gO[k]) * blend;
    g.cost.box += GRID.length * 2;
    const P = blend >= 1 || !stO ? PN : PO;     // discrete things follow whichever palette dominates
    const mixP = (k) => (stO ? mixc(PO[k], PN[k], blend) : PN[k]);
    const neonK = PO.neon + (PN.neon - PO.neon) * blend, glowK = PO.glow + (PN.glow - PO.glow) * blend;
    let gridOps = 0;

    // ---- the beat: the neon sign behind the colon flicks on bottom to top
    const beat = s - Math.floor(s);
    let neonSum = 0;
    for (let m = 0; m < 6; m++) {
      const yy = 14.5 + 7 * m, xx = 76.06 - 0.12 * (yy - 28.5);   // two of the tubes sit right behind the dabs
      const tOn = (5 - m) * 0.03;                                   // the chase climbs from the bottom
      const a = beat < tOn ? 0.25 : beat < tOn + 0.07 ? 0.25 + 0.75 * sm((beat - tOn) / 0.07) : beat < 0.55 ? 1 : 1 - 0.75 * sm((beat - 0.55) / 0.35);
      const k = a * neonK;
      neonSum += k;
      g.fillCircle(xx, yy, 3.0, neonCol, { aa: true, a: Math.min(1, 0.95 * k) });
    }
    neonSum = (neonSum / 6) * 7;
    gridOps += addGlow(GRID, 75.5, 32, 34, neonCol, 0.22 * (neonSum / 7) * glowK);
    reflect(g, 75, 3, neonCol, 0.3 * (neonSum / 7));

    // ---- the traffic light at the corner
    {
      const c = posmod(tg, 22);
      const gr = c < 9 ? 1 - sm((c - 8.85) / 0.15) : c > 21.85 ? sm((c - 21.85) / 0.15) : 0;
      const am = c >= 8.85 && c < 11.6 ? sm((c - 8.85) / 0.15) * (1 - sm((c - 11.45) / 0.15)) : 0;
      const rd = c >= 11.45 ? sm((c - 11.45) / 0.15) * (1 - sm((c - 21.85) / 0.15)) : 0;
      const lamps = [[0x30ff9a, gr], [0xffb020, am], [0xff2a20, rd]];
      for (const [col, k] of lamps) {
        if (k <= 0.01) continue;
        g.fillCircle(128.5, 31.5, 2.6, col, { aa: true, a: 0.9 * k });
        reflect(g, 128.5, 2.6, col, 0.35 * k);
        gridOps += addGlow(GRID, 128.5, 31.5, 18, col, 0.5 * k * glowK);
      }
    }

    // ---- traffic on the wet road
    const dense = keyNew === 'late' ? 0.45 : 0.8;
    for (const [x, y, col, r, gap, gk] of cars(tg, dense)) {
      for (const dx of [0, gap]) {
        if (x + dx < -6 || x + dx > 166) continue;
        g.fillCircle(x + dx, y, r, col, { aa: true, a: 0.9 });
        reflect(g, x + dx, r, col, 0.35);
      }
      gridOps += addGlow(GRID, x + gap / 2, y, 17, col, gk * glowK);
    }

    // ---- flourishes: a car turning at the corner sweeps its beam across the fog; lightning
    let sweepX = -999;
    for (const [t0, dir] of [[14.2, 1], [44.2, -1]]) {
      const u = (s - t0) / 3.6;
      if (u > 0 && u < 1) sweepX = dir > 0 ? -30 + 220 * ease.inOutQuad(u) : 190 - 220 * ease.inOutQuad(u);
    }
    if (sweepX > -60) {
      for (const dx of [-4, 4]) g.fillCircle(sweepX + dx, 50, 4.6, HEAD, { aa: true, a: 0.9 });
      reflect(g, sweepX, 6, HEAD, 0.5);
      gridOps += addGlow(GRID, sweepX, 44, 40, 0xfff2dc, 0.95 * Math.max(0.5, glowK));
    }
    let flash = 0;
    {
      const t0 = 28.6 + 3 * rand(f.minuteKey, 41), u = s - t0;
      if (u > 0 && u < 1.4) flash = 0.5 * pulse(u, 0.0, 0.08, 0.25) + 0.9 * pulse(u, 0.36, 0.08, 0.75);
      if (keyNew === 'day') flash *= 0.7;
    }

    // ---- the tram (the hour)
    let spark = 0;
    if (hu !== null) {
      const xf = tramX(hu);
      if (xf !== null) {
        g.fillRect(Math.round(xf), 32, TRAM_LEN, 4, 0x8c7a5c);
        g.fillRect(Math.round(xf), 36, TRAM_LEN, 19, 0x581a22);
        for (let m = 0; m < 10; m++) g.fillCircle(xf + 9 + 10.4 * m, 41, 3.2, 0xffd690, { aa: true, a: 0.92 });
        g.fillCircle(xf + 3, 50, 2.6, HEAD, { aa: true });
        g.fillCircle(xf + 5, 34.5, 1.8, 0xffb43c, { aa: true });
        g.thickLine(xf + 46, 32, xf + 52, 23, 1, 0x1a1a22, { aa: true });
        for (let m = 0; m < 10; m += 3) reflect(g, xf + 9 + 10.4 * m, 4, 0xffd690, 0.3);
        gridOps += addGlow(GRID, xf + TRAM_LEN / 2, 42, 58, 0xffc878, 1.05);
        gridOps += addGlow(GRID, xf, 50, 26, HEAD, 0.8);
        for (const ts of [-1.6, -0.7, 0.35, 1.1]) spark = Math.max(spark, 0.7 * pulse(hu, ts, 0.07, 0.22));
        if (spark > 0.02) {
          g.fillCircle(xf + 52, 23, 2 + 2 * spark, 0xd8ecff, { aa: true, a: Math.min(1, spark) });
          gridOps += addGlow(GRID, xf + 52, 23, 70, 0xb8d8ff, 0.9 * spark);
        }
      }
    }

    // ---- rain running down the outside of the pane (seen only through clear glass)
    for (let k = 0; k < 120; k++) {
      const x = (hash(k, 1, 51) % W), v = 10 + 26 * rand(k, 2, 51);
      const y = posmod(rand(k, 3, 51) * 90 + v * (tg % 1000) + 2.5 * sin(tg * 1.3 + k), 90) - 6;
      const col = [0xffdcaa, 0xffb0d8, 0xb8e8ff][k % 3];
      g.pixel(x, y, col, { a: 0.6 });
      g.pixel(x, y - 1, col, { a: 0.28 });
      g.pixel(x, y - 2, col, { a: 0.12 });
    }

    // ================================================== the condensation
    A.fill(255); E.fill(0);
    g.cost.px += N * 2;
    const rimGain = 1 + 0.5 * flash + 0.9 * spark;

    // per-column sweep light on the ridges
    const sweepK = sweepX > -60 ? 1 : 0;

    for (let k = 0; k < 4; k++) {
      const cd = +cur[k], od = +old[k], nd = +nex[k];
      const gl = GLYPHS[cd];
      let mode = 0, kc = 0, fade = 0, wst = null, fresh = 0, antic = 0;
      if (s >= CREEP0 && nd !== cd) {
        mode = 1; const e = ease.inOutQuad(progress(s, CREEP0, CREEP1)); kc = KMAX * e; fade = e;
      } else if (s < 4 && od !== cd) {
        let order = 0;
        for (let j = 0; j < k; j++) if (old[j] !== cur[j]) order++;
        const t = s - W0 - order * STAGGER;
        mode = 2; wst = writeState(gl, t); fresh = 1 - clamp(t / FRESH, 0, 1);
      } else if (s >= 57.2 && nd !== cd) antic = progress(s, 57.2, 58.4);
      // the beat's glint runs along this numeral the way it was written
      let gpos = -99;
      if (mode === 0) gpos = gl.L * trap((beat - 0.1 * k) / 0.8);
      stamp(gl, SLOT_X[k] - OX, SLOT_Y[k] - OY, mode, kc, fade, wst, fresh, gpos, rimGain * (1 + 0.6 * antic), sweepX * sweepK);
      g.cost.box += FW * FH * 6;
    }
    stamp(GLYPHS[10], COLON_X, COLON_Y, 0, 0, 0, null, 0, -99, rimGain, sweepX * sweepK);
    g.cost.box += FW * FH * 6;

    // ---- drops: water gathered under each numeral breaks loose on the beat and runs
    const beads = [];
    const nowN = Math.floor(tg);
    for (let n = nowN - 10; n <= nowN; n++) {
      const k = posmod(n, 4);
      const sn = posmod(n, 60);
      if (sn >= 57 || sn < 4) continue;
      const dg = GLYPHS[+digitsAt(n)[k]];
      const o = dg.drips[hash(n, 7) % dg.drips.length];
      const ox = SLOT_X[k] - OX + o[0], oy = SLOT_Y[k] - OY + o[1] - 1.5;
      const L = Math.min(9 + 19 * rand(n, 8), 78 - oy), dur = L / 34, age = tg - n;
      const u = clamp(age / dur, 0, 1);
      const yh = oy + L * dropEase(u);
      const clearK = 0.55 * (1 - sm((age - 0.8) / 7));
      trail(ox, oy, yh, n, clearK);
      g.cost.box += (yh - oy + 1) * 8;
      if (clearK > 0.05) beads.push([wob(ox, yh - oy, n), yh, 1.5 - 0.3 * u, clearK / 0.55]);
    }
    // the drop still gathering under each numeral
    for (let k = 0; k < 4; k++) {
      if ((s >= 57 || s < 4) && (nex[k] !== cur[k] || old[k] !== cur[k])) continue;
      const last = nowN - posmod(nowN - k, 4), nextN = last + 4;
      if (posmod(nextN, 60) >= 57 || posmod(nextN, 60) < 4) continue;
      const dg = GLYPHS[+cur[k]], o = dg.drips[hash(nextN, 7) % dg.drips.length];
      const ph = (tg - last) / 4;
      beads.push([SLOT_X[k] - OX + o[0], SLOT_Y[k] - OY + o[1] - 1.5, 0.5 + 1.0 * ph, Math.min(1, ph * 3)]);
    }

    // ================================================== composite: fog over street
    // fog colour at each grid node: the palette's mist by row + the glows
    const fogT = mixP('fog'), fT = [R8(fogT[0]), G8(fogT[0]), B8(fogT[0])], fB = [R8(fogT[1]), G8(fogT[1]), B8(fogT[1])];
    const fl = flash * (keyNew === 'late' ? 70 : 95), sp = spark * 40;
    // glows reach the fog softened: 60% of their colour, the rest as plain light
    for (let j = 0; j < GY; j++) {
      const v = clamp((j * GCELL - 20) / 60, 0, 1);
      for (let i = 0; i < GX; i++) {
        const o = (j * GX + i) * 3, gr = GRID[o], gg = GRID[o + 1], gb = GRID[o + 2], gl = (gr + gg + gb) * 0.1333;
        NODE[o] = knee(fT[0] + (fB[0] - fT[0]) * v + gl + gr * GSAT + fl + sp * 0.8);
        NODE[o + 1] = knee(fT[1] + (fB[1] - fT[1]) * v + gl + gg * GSAT + fl + sp * 0.9);
        NODE[o + 2] = knee(fT[2] + (fB[2] - fT[2]) * v + gl + gb * GSAT + fl * 1.15 + sp);
      }
    }
    g.cost.box += GX * GY * 8 + gridOps * 6;
    const rim = mixP('rim'), rr = R8(rim), rg = G8(rim), rb = B8(rim);
    const flR = (flash * 92) | 0, flG = (flash * 90) | 0, flB = (flash * 125) | 0;
    const ripOff = Math.floor((tg % 1000) * 34);
    for (let y = 0; y < H; y++) {
      const j = y >> 3, fy = y & 7;
      for (let i = 0; i < GX; i++) {
        const o0 = (j * GX + i) * 3, o1 = o0 + GX * 3;
        ROWV[i * 3] = NODE[o0] * (8 - fy) + NODE[o1] * fy;
        ROWV[i * 3 + 1] = NODE[o0 + 1] * (8 - fy) + NODE[o1 + 1] * fy;
        ROWV[i * 3 + 2] = NODE[o0 + 2] * (8 - fy) + NODE[o1 + 2] * fy;
      }
      const brow = (y & 3) << 2, ripRow = posmod(y - ripOff, H) * W;
      for (let x = 0, i = y * W; x < W; x++, i++) {
        const c0 = (x >> 3) * 3, fx = x & 7;
        let r = (ROWV[c0] * (8 - fx) + ROWV[c0 + 3] * fx) >> 9;
        let gg = (ROWV[c0 + 1] * (8 - fx) + ROWV[c0 + 4] * fx) >> 9;
        let b = (ROWV[c0 + 2] * (8 - fx) + ROWV[c0 + 5] * fx) >> 9;
        const t = TEX[i];
        r += t; gg += t; b += t;
        const e = E[i];
        if (e) { r += ((rr - r) * e) >> 8; gg += ((rg - gg) * e) >> 8; b += ((rb - b) * e) >> 8; }
        const a = A[i];
        if (a < 255) {
          const v = buf[i];
          let sr = (v >> 8) & 0xf8, sg = (v >> 3) & 0xfc, sb = (v << 3) & 0xf8;
          if (flash > 0 && y < ROOF[x]) { sr += flR; sg += flG; sb += flB; }
          // rain sheeting down the outside of the pane makes the lights behind shimmer
          const rp = NZ[ripRow + x] >> 3;
          sr += (sr * rp) >> 6; sg += (sg * rp) >> 6; sb += (sb * rp) >> 6;
          r = sr + (((r - sr) * a) >> 8); gg = sg + (((gg - sg) * a) >> 8); b = sb + (((b - sb) * a) >> 8);
        }
        const d = BAYER[brow | (x & 3)];
        r = (r + (d >> 1)) >> 3; gg = (gg + (d >> 2)) >> 2; b = (b + (d >> 1)) >> 3;
        buf[i] = ((r < 0 ? 0 : r > 31 ? 31 : r) << 11) | ((gg < 0 ? 0 : gg > 63 ? 63 : gg) << 5) | (b < 0 ? 0 : b > 31 ? 31 : b);
      }
    }
    g.cost.px += N; g.cost.box += N * 16 + GX * H * 3;

    // ---- water drops on the inside of the pane: a dark lens with a bright catch-light
    for (const [x, y, r, k] of beads) {
      if (k <= 0.02) continue;
      g.fillCircle(x, y, r, 0x141a26, { aa: true, a: 0.55 * k });
      g.pixel(x - 0.6, y - 0.8, rim, { a: 0.9 * k });
    }
  },
};

/** Mist never burns out to white: a soft knee above 168, x8 fixed point. */
function knee(v) {
  if (v > 168) v = 168 + (v - 168) * 0.35;
  return (v > 230 ? 230 : v) * 8 | 0;
}

/** An attack/decay pulse: 0 before t0, up over `up` s, down over `down` s. */
function pulse(u, t0, up, down) {
  const v = u - t0;
  if (v <= 0) return 0;
  if (v < up) return sm(v / up);
  return Math.max(0, 1 - (v - up) / down) ** 2;
}

/** Stick-slip of a running drop: surges, never reverses. */
function dropEase(u) { return sm(u + 0.06 * sin(u * 12.566)); }
function wob(ox, dy, n) { return ox + 0.7 * sin(dy * 0.31 + n) + 0.45 * sin(dy * 0.13 + n * 2.1); }

/** A drop's clear trail through the fog, from its origin down to the head. */
function trail(ox, oy, yh, n, ck) {
  if (ck <= 0.01) return;
  const y0 = Math.max(0, Math.ceil(oy)), y1 = Math.min(H - 1, Math.floor(yh));
  for (let y = y0; y <= y1; y++) {
    const x = wob(ox, y - oy, n), xl = x - 1.1, xr = x + 1.1;
    // fresher (clearer) near the head, an older trail mists over from the top
    const kk = ck * (0.75 + 0.25 * clamp((y - oy) / 12, 0, 1));
    for (let px = Math.floor(xl); px <= Math.floor(xr); px++) {
      if (px < 0 || px >= W) continue;
      const cov = Math.min(px + 1, xr) - Math.max(px, xl);
      if (cov <= 0) continue;
      const i = y * W + px, a = 255 - ((255 * kk * cov) | 0);
      if (a < A[i]) A[i] = a;
      if (E[i] < 30) E[i] = 30;
    }
  }
}

/**
 * Stamp one numeral's state into the fog and ridge masks.
 * mode 0 shown, 1 misting over (kc creep px, fade 0..1), 2 being written (wst).
 */
function stamp(gl, x0, y0, mode, kc, fade, wst, fresh, gpos, rimGain, sweepX) {
  const Dt = gl.D, Tt = gl.T;
  const st0 = gl.starts[0], st1 = gl.starts.length > 1 ? gl.starts[1] : -1;
  for (let y = 0; y < FH; y++) {
    const gy = y0 + y;
    if (gy < 0 || gy >= H) continue;
    for (let x = 0; x < FW; x++) {
      const gx = x0 + x;
      if (gx < 0 || gx >= W) continue;
      const k = y * FW + x, D4 = Dt[k];
      if (D4 > 11) continue;                          // beyond the ridge: plain fog
      const i = gy * W + gx;
      let d = D4 * 0.25, c, rim;
      if (mode === 0) {
        c = clamp(0.5 - d, 0, 1);
        rim = ridge(d);
      } else if (mode === 1) {
        d += kc * (1 + NZ[i] * 0.0032);
        c = clamp(0.5 - d, 0, 1) * (1 - 0.6 * fade);
        rim = ridge(d) * (1 - fade);
      } else {
        const T = Tt[k];
        if (T === 255 || wst.sf < -1) continue;
        let cf, rv;
        if (T === st0 || T === st1) {
          const p = T === st0 ? wst.p0 : wst.p1;
          cf = clamp(p * (R0 + 0.9) - (d + R0) + 0.5, 0, 1);
          rv = p;
        } else {
          cf = clamp((wst.sf - T) / 1.5, 0, 1);
          rv = clamp((wst.sf - T - 0.5) / 2.5, 0, 1);
        }
        c = clamp(0.5 - d, 0, 1); if (cf < c) c = cf;
        rim = ridge(d) * rv;
        // the crescent of water pushed ahead of the fingertip
        if (wst.run && d < 0.6 && T > wst.sf && T - wst.sf < 3) { const cr = 1 - (T - wst.sf) / 3; if (cr > rim) rim = cr; }
        // fingerprint streaks in a fresh wipe, evaporating
        if (fresh > 0 && c > 0) c *= 1 - 0.42 * fresh * fresh * ((D4 >> 2) & 1 ? 1 : 0.35);
      }
      if (c > 0) { const a = 255 - ((c * 255) | 0); if (a < A[i]) A[i] = a; }
      if (rim > 0) {
        let e = rim * (BEAD[i] * 0.0026 + 0.2) * rimGain;
        // the beat's glint, and the turning car's beam, catch the ridge
        if (gpos > -50 && Tt[k] !== 255) { let dg = Tt[k] - gpos; if (dg < 0) dg = -dg; if (dg < 5) e += rim * (1 - dg / 5) * 0.9; }
        if (sweepX > -60) { let dx = gx - sweepX; if (dx < 0) dx = -dx; if (dx < 26) e += rim * (1 - dx / 26) * 0.5; }
        const v = e >= 1 ? 255 : (e * 255) | 0;
        if (v > E[i]) E[i] = v;
      }
    }
  }
}

/** The water ridge's profile across the wiped edge: peaks 0.9 px outside it. */
function ridge(d) { const v = d > 0.9 ? 1 - (d - 0.9) / 1.5 : 1 - (0.9 - d) / 1.5; return v < 0 ? 0 : v; }

/** Bill the once-per-palette street render to the frame that does it. */
function billBuild(g, c) {
  for (const k of ['calls', 'px', 'blend', 'box', 'edge', 'blit', 'dither', 'ramp']) g.cost[k] += c[k] ?? 0;
}

export const FOGGEDGLASS_FLASH = FLASH_BYTES;
