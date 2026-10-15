// PCB: a macro view of a little clock module, and the time is its copper.
//
// The numerals are nets on the board, routed by a layout engineer (see
// pcb-glyphs.js): 4 px and 3 px traces at 0 / 45 / 90 degrees with mitred
// corners, plated through-hole pads at the free ends, vias at the joints,
// teardrops, and a clearance moat cut into the ground pour round every
// stroke. They are the only bare copper on the board, finished in ENIG
// gold; everything else (bus traces, the pour) lies under the soldermask.
//
// Always alive: the crystal Y1 ticks every second (a glint on its lid), the
// tick runs into U1 and round its pins, then the heartbeat LED blinks and
// a pulse of current (with a glow spilling into the moat) leaves every
// digit's first pad and runs along its whole net (about 0.8 px a frame, gliding by
// fractions of a pixel); data packets run along the bus traces from U1 to
// the header J1; a soft specular sheen slides across the glossy mask.
//
// Minute turn (each changing digit): the etchant arrives (58.4 s): the gold
// strips to raw copper, the copper fizzes, thins and dissolves from its
// edges in, and the ground pour flows back over the moat behind a wet lip;
// by 59.9 s the spot is plain pour. After :00 the autorouter places the new
// pads and vias, an airwire spans each net, and two router heads lay each
// path from both ends toward each other (so a half-routed digit is a broken
// version of the new one, never a different digit), the pour retreating
// round the copper; then an immersion-gold front sweeps down the raw copper
// and the current starts.
//
// Hour: the whole board flips over in 3D (edge-on at exactly :00) to its
// other side, a different soldermask colour, where the new time is already
// made; the board then powers up: a flood of current through every digit.
//
// Palette: the board's own materials. Soldermask (green, blue, red, purple
// by day, one colour per hour; matte black and navy at night) in two tones,
// dark where it lies on bare laminate (the moats) and light over copper
// (the pour): so every numeral sits in a dark keyline inside a lighter
// field. ENIG gold for the time, the one warm metal on the board; white
// silkscreen; tin, black epoxy and a steel crystal lid for the parts; red
// and amber LEDs as the only coloured light. Night: the dark masks with the
// gold and the LEDs carrying the face, backlight at 40 %.
//
// Hard pixels for the board, the parts and the silkscreen (it is a printed,
// static thing); anti-aliasing for the copper edges, the router head, the
// airwires, the packets and everything that moves.
//
// Cost: the board is baked once per mask colour (once an hour, a 160 x 80
// pass plus the parts' fills), and the digit tables once at start; a frame
// is a copy of the board, a table walk over the digits' copper and moats,
// the sheen band and a few dozen small fills.

import { Gfx, hex, mix, R, G, B, clamp, progress, ease, clockFields } from '../js/kit.js';
import { HOUR, MIN, buildGlyph, pathPoint } from './pcb-glyphs.js';
import { W, H, SLOTS, LEDS, XTAL, CHIP, TRACES, maskFor, bakeBoard, matCanvas } from './pcb-board.js';

// ------------------------------------------------------------ glyph tables, once
const GLY = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => ({ big: buildGlyph(d, HOUR), small: buildGlyph(d, MIN) }));

// ------------------------------------------------------------ colour tables
function shadeLut(dark, base, hi) {
  const r = new Int16Array(16), g = new Int16Array(16), b = new Int16Array(16);
  for (let i = 0; i < 16; i++) {
    const s = i / 7.5 - 1;
    const c = s < 0 ? mix(base, dark, -s) : mix(base, hi, s);
    r[i] = R(c); g[i] = G(c); b[i] = B(c);
  }
  return { r, g, b };
}
const LUT_GOLD = shadeLut(hex('7e5214'), hex('d9a23a'), hex('fff0c0'));
const LUT_CU = shadeLut(hex('8a3420'), hex('e07450'), hex('ffc8a8'));
const LUT_OX = shadeLut(hex('3a1c10'), hex('6e3a22'), hex('a0644a'));
const HOLE_R = 12, HOLE_G = 16, HOLE_B = 18;

// the current: a bright head and a tail, one pulse a second
const V = 46;                                       // px per second along the net
const PUL = new Float32Array(V * 8);
for (let i = 0; i < PUL.length; i++) {
  const ph = i / 8;
  PUL[i] = ph < 11 ? Math.pow(1 - ph / 11, 1.6) : ph > V - 1.6 ? (ph - (V - 1.6)) / 1.6 : 0;
}

// ------------------------------------------------------------ the turn's timetable (seconds into the minute)
const E0 = 58.4, E1 = 59.3;          // etch: gold stripped, copper dissolved
const HL0 = 58.9, HL1 = 59.9;       // the pour heals over the moat; gone before :00
const P0 = 0.02;                      // new pads and vias placed
const RT0 = 0.15, RT1 = 1.45;         // the router lays the trace
const PL0 = 1.35, PL1 = 2.1;          // immersion gold sweeps down
const FL = 0.7;                       // hour: the flip's half-length (edge-on at :00)
const TICK = 0.25;                    // crystal tick -> U1 -> the digits: the current leaves this long after each second

// ------------------------------------------------------------ per-slot state (monomorphic, reused)
function mkState() {
  return { mode: 0, e: 0, heal: 0, q: 0, plateY: -99, amp: 0.6, flood: -1, s: 0, wire: 0, vis: new Float32Array(8), half: new Float32Array(4) };
}
const ST = [mkState(), mkState(), mkState(), mkState()];

/** Walk digit table gl at slot origin (ox, oy) into canvas c. */
function drawDigit(c, gl, ox, oy, st, lam, pulseT, clr) {
  const buf = c.buf, cost = c.cost, n = gl.n;
  const { ix, iy, sd, rk, pid, lp, sh, hole, node, nz } = gl;
  const half = st.half;
  const mode = st.mode, vis = st.vis;
  const moatThr = mode === 1 ? clr - st.heal * (clr + 5) : clr;
  const e = st.e;
  const tint = mode === 1 ? clamp(e / 2.2, 0, 1) : 0;
  cost.calls++;
  for (let j = 0; j < n; j++) {
    cost.box += 3;
    const x = ox + ix[j], y = oy + iy[j];
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const bi = y * W + x, d = sd[j];
    let show = 1;
    if (mode === 2) show = node[j] >= 0 ? vis[node[j]] : clamp(st.q * half[pid[j]] + 3 - rk[j], 0, 1);
    // ---- the moat: laminate showing through the pour's clearance
    let mc = clamp(moatThr - d + 0.5, 0, 1) * show;
    let v = buf[bi];
    if (mc > 0) {
      if (mc >= 1) { v = lam[bi]; cost.px++; } else v = blend565(v, lam[bi], mc, cost);
    }
    // ---- the current's light spilling into the moat
    if (st.amp > 0 && d > -0.5 && d < clr + 0.5) {
      let ph = (pulseT - lp[j]) % V; if (ph < 0) ph += V;
      const k = st.amp * PUL[(ph * 8) | 0] * 0.6 * (1 - (d > 0 ? d : 0) / (clr + 0.5));
      if (k > 0.02) {
        const r0 = (v >> 11) << 3, g0 = ((v >> 5) & 63) << 2, b0 = (v & 31) << 3;
        cost.blend++;
        v = pack(r0 + (255 - r0) * k, g0 + (214 - g0) * k, b0 + (120 - b0) * k);
      }
    }
    // ---- the healing pour's front: a wet, brighter lip as it flows back in
    if (mode === 1 && st.heal > 0 && st.heal < 1) {
      const z = d - moatThr;
      if (z > -0.5 && z < 1.5) {
        const k = 0.45 * (1 - Math.abs(z - 0.5)), r0 = (v >> 11) << 3, g0 = ((v >> 5) & 63) << 2, b0 = (v & 31) << 3;
        cost.blend++;
        v = pack(r0 + (255 - r0) * k * 0.6, g0 + (255 - g0) * k * 0.6, b0 + (255 - b0) * k * 0.6);
      }
    }
    // ---- the copper
    let cov = d < 0.5 ? (d > -0.5 ? 0.5 - d : 1) : 0;
    if (cov > 0 && mode === 2) cov *= node[j] >= 0 ? vis[node[j]] : clamp(st.q * half[pid[j]] - rk[j] + 0.5, 0, 1);
    if (cov > 0 && mode === 1) cov *= clamp(-d + 1.7 * nz[j] - e + 0.5, 0, 1);
    if (cov > 0) {
      const si = ((sh[j] + 1) * 7.5 + 0.5) | 0;
      let r, g, b;
      let glow = 0;
      if (mode === 1) {
        // gold strips to copper, copper darkens to oxide as it thins
        const a1 = tint < 0.5 ? tint * 2 : 1, a2 = tint < 0.5 ? 0 : (tint - 0.5) * 2;
        r = LUT_GOLD.r[si] + (LUT_CU.r[si] - LUT_GOLD.r[si]) * a1; g = LUT_GOLD.g[si] + (LUT_CU.g[si] - LUT_GOLD.g[si]) * a1; b = LUT_GOLD.b[si] + (LUT_CU.b[si] - LUT_GOLD.b[si]) * a1;
        r += (LUT_OX.r[si] - r) * a2; g += (LUT_OX.g[si] - g) * a2; b += (LUT_OX.b[si] - b) * a2;
        // fizz: specks of etchant bubbling on the copper
        const bub = (nz[j] * 13.7 + st.s * 2.3) % 1;
        if (nz[j] > 0.72 && bub < 0.16) glow = 0.9 * (1 - bub / 0.16) * (1 - a2 * 0.5);
      } else if (mode === 2 && iy[j] > st.plateY) {
        r = LUT_CU.r[si]; g = LUT_CU.g[si]; b = LUT_CU.b[si];
      } else {
        r = LUT_GOLD.r[si]; g = LUT_GOLD.g[si]; b = LUT_GOLD.b[si];
      }
      if (mode === 2) { const db = iy[j] - st.plateY; if (db > -4 && db < 1.5) glow += 0.7 * (db < 0 ? 1 + db / 4 : 1 - db / 1.5); }
      if (st.amp > 0) {
        let ph = (pulseT - lp[j]) % V; if (ph < 0) ph += V;
        glow += st.amp * PUL[(ph * 8) | 0];
      }
      if (st.flood >= 0 && lp[j] < st.flood) glow += 1.1 * Math.max(0, 1 - (st.flood - lp[j]) / 60);
      if (glow > 0) { if (glow > 1) glow = 1; r += (255 - r) * glow; g += (250 - g) * glow; b += (225 - b) * glow; }
      const hc = hole[j];
      if (hc > 0) { r += (HOLE_R - r) * hc; g += (HOLE_G - g) * hc; b += (HOLE_B - b) * hc; }
      if (cov >= 1) { v = pack(r, g, b); cost.px++; } else v = blendRGB(v, r, g, b, cov, cost);
    }
    buf[bi] = v;
  }
}

function pack(r, g, b) {
  r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}
function blendRGB(v, r, g, b, a, cost) {
  cost.blend++;
  const r0 = (v >> 11) << 3, g0 = ((v >> 5) & 63) << 2, b0 = (v & 31) << 3;
  return pack(r0 + (r - r0) * a, g0 + (g - g0) * a, b0 + (b - b0) * a);
}
function blend565(v, w, a, cost) {
  return blendRGB(v, (w >> 11) << 3, ((w >> 5) & 63) << 2, (w & 31) << 3, a, cost);
}

// ------------------------------------------------------------ bus packets
const BUS = TRACES.slice(0, 3).map((pts) => {
  const segs = []; let L = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], len = Math.hypot(bx - ax, by - ay);
    segs.push([ax, ay, bx, by, L, len]); L += len;
  }
  return { segs, len: L };
});
function along(bus, L) {
  for (const s of bus.segs) if (L <= s[4] + s[5]) { const u = (L - s[4]) / s[5]; return [s[0] + (s[2] - s[0]) * u + 0.5, s[1] + (s[3] - s[1]) * u + 0.5]; }
  return null;
}

// ------------------------------------------------------------ sheen: a soft band of reflected light on the glossy mask
const SHEEN = new Float32Array(41);
for (let i = 0; i < 41; i++) { const u = 1 - Math.abs(i - 20) / 20; SHEEN[i] = u * u * 20; }
function sheen(c, xc) {
  const buf = c.buf, cost = c.cost;
  cost.calls++;
  for (let y = 0; y < H; y++) {
    const cx = Math.round(xc - 0.45 * y);
    const x0 = Math.max(0, cx - 20), x1 = Math.min(W - 1, cx + 20);
    for (let x = x0; x <= x1; x++) {
      const k = SHEEN[x - cx + 20], i = y * W + x, v = buf[i];
      cost.blend++;
      const r = ((v >> 11) << 3) + k, g = (((v >> 5) & 63) << 2) + k, b = ((v & 31) << 3) + k * 1.1;
      buf[i] = pack(r, g, b);
    }
  }
}

// ------------------------------------------------------------ one side of the board
/**
 * Draw the board for hour h with the digits in `digits` (string of 4), the
 * slot states already set in ST, at time-of-day tod (s). Into canvas c.
 */
function drawBoard(c, h, digits, tod, s, night, extra) {
  const bd = bakeBoard(maskFor(h)), mk = bd.mask;
  c.draw(bd.bg, 0, 0);
  const pulseT = (tod - TICK) * V;
  for (let i = 0; i < 4; i++) {
    const S = SLOTS[i], st = ST[i];
    if (st.mode < 0) continue;
    const gl = S.big ? GLY[+digits[i]].big : GLY[+digits[i]].small;
    drawDigit(c, gl, S.x, S.y, st, bd.lam, pulseT, S.big ? HOUR.clr : MIN.clr);
    if (st.mode === 2) routerOverlay(c, gl, S, st);
  }
  // bus packets: a burst of three every few seconds per trace, under the mask (a lighter glint)
  const pk = mix(mk.cu, hex('ffffff'), 0.55);
  for (let k = 0; k < BUS.length; k++) {
    const bus = BUS[k], period = 2.6 + k * 0.7;
    const t = (tod + k * 1.3) % period, head = t * 70;
    for (let q = 0; q < 3; q++) {
      const L = head - q * 5;
      if (L < 0 || L > bus.len) continue;
      const p = along(bus, L);
      if (p) c.fillCircle(p[0], p[1], 1.0, pk, { aa: true, a: 0.85 });
    }
  }
  // the crystal's tick: a glint across the lid at each second
  const fr = s % 1;
  if (fr < 0.3) {
    const gx = XTAL.x - 3 + fr / 0.3 * (XTAL.w + 6);
    c.clip(XTAL.x + 1, XTAL.y + 1, XTAL.w - 2, XTAL.h - 2);
    c.thickLine(gx, XTAL.y, gx - 4, XTAL.y + XTAL.h, 2.2, hex('ffffff'), { aa: true, a: 0.75 * (1 - fr / 0.3 * 0.5) });
    c.unclip();
  }
  // the tick reaches U1 (a glint along the crystal trace), and runs round its pins
  if (fr < 0.12) c.fillCircle(77.5, 51.5 - fr / 0.12 * 6, 1.1, hex('fff4d0'), { aa: true, a: 0.8 });
  if (fr > 0.08 && fr < TICK + 0.1) {
    const u = (fr - 0.08) / (TICK + 0.02);
    for (let k = 0; k < 20; k++) {
      const a = clamp(1 - Math.abs(u * 20 - k) / 3, 0, 1);
      if (a <= 0) continue;
      const side = k / 5 | 0, o = 3 + (k % 5) * 3, X = CHIP.x, Y = CHIP.y, S2 = CHIP.s;
      // clockwise from the bottom edge (where the crystal comes in)
      const gx = side === 0 ? X + S2 - 0.5 - o : side === 1 ? X : side === 2 ? X + o + 0.5 : X + S2;
      const gy = side === 0 ? Y + S2 : side === 1 ? Y + S2 - 0.5 - o : side === 2 ? Y : Y + o + 0.5;
      c.fillCircle(gx, gy, 2.2, hex('ffe2a0'), { aa: true, a: 0.35 * a });
      if (side === 0) c.fillRect(X + S2 - 1 - o, Y + S2 - 1, 1, 2, hex('fff6d8'), { a });
      else if (side === 1) c.fillRect(X - 1, Y + S2 - 1 - o, 2, 1, hex('fff6d8'), { a });
      else if (side === 2) c.fillRect(X + o, Y - 1, 1, 2, hex('fff6d8'), { a });
      else c.fillRect(X + S2 - 1, Y + o, 2, 1, hex('fff6d8'), { a });
    }
  }
  // LEDs: power steady, heartbeat on each tick
  const fb = (fr - TICK + 1) % 1, beat = fb < 0.08 ? 1 : Math.max(0, 1 - (fb - 0.08) / 0.35);
  for (let k = 0; k < LEDS.length; k++) {
    const L = LEDS[k];
    let on = k === 0 ? 0.85 : beat;
    if (extra.boot >= 0) on = Math.max(on, clamp(1 - Math.abs(extra.boot - 0.25 - k * 0.2) / 0.5, 0, 1));
    if (on <= 0.02) continue;
    const cx = L.x + 3, cy = L.y + 1.5;
    c.fillCircle(cx, cy, 6, L.c, { aa: true, a: 0.12 * on });
    c.fillCircle(cx, cy, 3.5, L.c, { aa: true, a: 0.3 * on });
    c.fillRect(L.x + 1, L.y, 4, 3, mix(L.c, hex('ffffff'), 0.35), { a: on });
    c.fillRect(L.x + 2, L.y + 1, 2, 1, hex('fff6e0'), { a: on });
  }
  // sheen on the glossy mask, crossing every 16 s
  sheen(c, ((tod * 15) % 240) - 30);
}

/** The autorouter's marks: two heads per path closing on each other, an airwire across the gap. */
function routerOverlay(c, gl, S, st) {
  if (st.q >= 1) return;
  const ox = S.x + 0.0, oy = S.y + 0.0, r = S.big ? HOUR.rT : MIN.rT;
  for (const pa of gl.paths) {
    const h = Math.max(0, st.q) * pa.len / 2;
    const [ax, ay] = pathPoint(pa, h), [bx, by] = pathPoint(pa, pa.len - h);
    if (Math.abs(ax - bx) + Math.abs(ay - by) > 1.5) c.thickLine(ox + ax, oy + ay, ox + bx, oy + by, 0.7, hex('f4f4e8'), { aa: true, a: 0.7 * st.wire });
    if (st.q <= 0) continue;
    for (const [hx, hy] of [[ax, ay], [bx, by]]) {
      c.fillCircle(ox + hx, oy + hy, r + 2.4, hex('fff0d0'), { aa: true, a: 0.22 });
      c.fillCircle(ox + hx, oy + hy, r * 0.75, hex('ffffff'), { aa: true, a: 0.9 });
    }
  }
}

// ------------------------------------------------------------ the flip
const OFF = new Gfx(W, H);
const TH = 3.2;                       // board thickness, px
const COL_U = new Float32Array(W), COL_S = new Float32Array(W), COL_IN = new Uint8Array(W);
function flipBlit(g, src, phi) {
  const buf = g.buf, sb = src.buf, mat = matCanvas().buf, cost = g.cost;
  const D = 240, cp = Math.cos(phi), sp = Math.sin(phi), sa = Math.abs(sp);
  const lit = 0.55 + 0.45 * Math.abs(cp);
  const k = 1 - 0.12 * sa;                    // the board lifts off the bench as it turns
  const shx = Math.round(5 * sa), shy = Math.round(4 * sa);
  cost.calls++;
  for (let X = 0; X < W; X++) {
    const xx = (X + 0.5 - 80) / k;
    const den = D * cp - xx * sp;
    const u = den > 1e-3 ? (xx * D) / den : 1e9;
    COL_IN[X] = u >= -80 && u < 80 ? 1 : 0;
    COL_U[X] = u;
    COL_S[X] = COL_IN[X] ? (D / (D + u * sp)) * k : 1;
  }
  for (let X = 0; X < W; X++) {
    const inside = COL_IN[X], s = COL_S[X], sx = Math.floor(COL_U[X] + 80);
    const Xs = X - shx, sIn = Xs >= 0 && COL_IN[Xs], ss = sIn ? COL_S[Xs] : 0;
    for (let Y = 0; Y < H; Y++) {
      const i = Y * W + X;
      cost.blit++;
      const v = inside ? 40 + (Y + 0.5 - 40) / s : -1;
      if (v < 0 || v >= H) {
        // the bench, and the board's shadow on it
        const m = mat[i];
        const dy = Y + 0.5 - 40 - shy;
        if (sIn && dy > -40 * ss && dy < 40 * ss) { cost.blend++; buf[i] = pack(((m >> 11) << 3) * 0.45, (((m >> 5) & 63) << 2) * 0.45, ((m & 31) << 3) * 0.45); }
        else buf[i] = m;
        continue;
      }
      const p = sb[(v | 0) * W + sx];
      cost.blend++;
      buf[i] = pack(((p >> 11) << 3) * lit, (((p >> 5) & 63) << 2) * lit, ((p & 31) << 3) * lit);
    }
  }
  // the board's edge: FR4 with a copper layer, on the side turned toward us
  const edgeU = sp > 0 ? -80 : 80;
  const s0 = (D / (D + edgeU * sp)) * k, X0 = 80 + ((edgeU * cp * D) / (D + edgeU * sp)) * k;
  const wpx = TH * sa * s0;
  if (wpx > 0.3) {
    const xa = sp > 0 ? X0 - wpx : X0, top = 40 - 40 * s0, bot = 40 + 40 * s0;
    g.fillPolygon([[xa, top], [xa + wpx, top], [xa + wpx, bot], [xa, bot]], hex('c8b680'), { aa: true });
    if (wpx > 1.5) g.fillPolygon([[xa + wpx * 0.45, top], [xa + wpx * 0.6, top], [xa + wpx * 0.6, bot], [xa + wpx * 0.45, bot]], hex('d07a40'), { aa: true, a: 0.8 });
  }
}

// ------------------------------------------------------------ the face
export default {
  name: 'PCB',
  blurb: 'The time is copper on a clock module: etched away and re-routed live each minute; the board flips over on the hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    const tod = f.h * 3600 + f.m * 60 + s;
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.6 * night);
    const nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const prv = clockFields(new Date(ctx.date.getTime() - 60000));
    const cur = f.hh + f.mm, nx = nxt.hh + nxt.mm, pv = prv.hh + prv.mm;
    const hourNext = nxt.h !== f.h, hourPrev = prv.h !== f.h;

    // ---- the slots' states for this instant
    for (let i = 0; i < 4; i++) {
      const st = ST[i];
      st.mode = 0; st.amp = 0.6; st.flood = -1; st.s = s; st.e = 0; st.heal = 0;
      if (!hourNext && cur[i] !== nx[i] && s >= E0) {
        if (s >= HL1) { st.mode = -1; continue; }
        st.mode = 1;
        st.e = 5.5 * ease.inQuad(progress(s, E0, E1));
        st.heal = ease.inOutQuad(progress(s, HL0, HL1));
        st.amp = 0.6 * (1 - progress(s, E0, E0 + 0.4));
      } else if (!hourPrev && cur[i] !== pv[i] && s < PL1) {
        const gl = SLOTS[i].big ? GLY[+cur[i]].big : GLY[+cur[i]].small;
        st.mode = 2;
        for (let k = 0; k < gl.nodes.length; k++) st.vis[k] = clamp((s - P0 - k * 0.05) / 0.12, 0, 1);
        for (let k = 0; k < gl.paths.length; k++) st.half[k] = gl.paths[k].len / 2;
        st.q = s < RT0 ? -0.2 : ease.inOutQuad(progress(s, RT0, RT1));
        st.wire = clamp((s - P0) / 0.2, 0, 1);
        st.plateY = -6 + (gl === GLY[+cur[i]].big ? HOUR.H : MIN.H) * 1.2 * progress(s, PL0, PL1) - 2;
        st.amp = 0;
      } else if (!hourPrev && cur[i] !== pv[i]) {
        st.amp = 0.6 * progress(s, PL1, PL1 + 0.8);
      }
    }
    // ---- the hour: flip, then power-up
    let T = 99;
    if (hourNext && s >= 60 - FL) T = s - 60;
    if (hourPrev && s < FL) T = s;
    const boot = hourPrev && s < 3 ? s - FL : -1;
    if (hourPrev && boot >= 0) for (let i = 0; i < 4; i++) ST[i].flood = boot * 80;
    const extra = { boot: boot >= 0 ? boot : -1 };

    if (T < 99) {
      const th = Math.PI * ease.inOutCubic((T + FL) / (2 * FL));
      const sideA = th < Math.PI / 2;
      for (let i = 0; i < 4; i++) { ST[i].mode = 0; ST[i].flood = -1; }
      OFF.cost = g.cost;
      drawBoard(OFF, sideA ? f.h : f.h, cur, tod, s, night, extra);
      flipBlit(g, OFF, sideA ? th : th - Math.PI);
    } else {
      drawBoard(g, f.h, cur, tod, s, night, extra);
    }
  },
};
