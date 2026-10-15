// Ferrofluid: a lit glass cell of magnetic fluid on a lab bench (the idea of
// Zelf Koelman's Ferrolic and Sachiko Kodama's spiked sculptures). The black
// fluid lies in a pool along the bottom; hidden electromagnets behind the
// glass hold four pools of it up in the shapes of the time. Their field
// makes the Rosensweig instability: the outer edges and tops of every
// numeral bristle with sharp spikes, flat triangles as in a backlit photo.
//
// The time is alive: once a second the field pulses, every spike leaps up
// together and relaxes and the pools jump 2 px towards their magnets;
// peristaltic waves run along the strokes (the edge bulges travel, and the
// spikes rise on the bulges, like a crowd doing the wave); glints of the lit
// glass slide over the black; the numerals sway on their magnets; a seconds
// magnet drags a crest along the pool; drops swell on necks, pinch off and
// splash, or leap up out of the pool. Every 7.5 s a flourish: a field front
// sweeps the strip, a crest of tall spikes winds round each numeral, or the
// whole cell shivers.
// Minute turn: the changing numeral's magnet switches off: its spikes sink,
// the strokes thin evenly and slump, dripping into the reservoir, and the
// thinning thread breaks into beads (Rayleigh-Plateau) that shrink away
// before :00; then the new magnet pulls a jet of drops up out of the pool,
// the new numeral beads up along its whole centre line, the beads merge and
// thicken, and last its spikes stand up. The hour: the colon sinks, a spiral
// tower rises in the middle (a Kodama sculpture, its screw thread of spikes
// climbing as it spins) while all four numerals drain into the pool; alone,
// it swells and bristles; at :00 it spills, a wave runs out along the pool
// and the four new numerals bead up; then fronts run outward through them.
//
// Pair: ferrofluid black #0e1014 on the pale lab-cyan #c7e6ec of a lit glass
// dish: the fluid is opaque (a true 1-bit material: it is there or it is
// not), the glass is light; the backlight is the light box. Night only dims.
//
// Cost: the numerals are baked at load to signed-distance and stroke-phase
// byte maps (94 KB of flash, plus ~8 KB of spike anchors); a frame compares
// ~10k map bytes against a 32-entry threshold table, fills ~150 small
// triangles, and writes 12,800 px from a 1-bit mask (12.8 KB of RAM). No
// per-minute work.
import { to565, hash, clockFields, clamp, progress, ease, sin, cos } from '../js/kit.js';
import { bakeGlyph } from './ferrofluid-glyphs.js';

const W = 160, H = 80, TAU = Math.PI * 2;
const INK = to565(0x0e1014), GROUND = to565(0xc7e6ec);
const mask = new Uint8Array(W * H);

// ------------------------------------------------------------ the numerals (flash)

const R_BIG = 4.05, R_SMALL = 3.2;
const BIG = [], SMALL = [];
for (let d = 0; d < 10; d++) {
  BIG.push(bakeGlyph(d, 30, 48, R_BIG, { lmaxUp: 11, lmaxSide: 4, lmaxDown: 2.5, spacing: 4.4, lambda: 22 }));
  SMALL.push(bakeGlyph(d, 24, 38, R_SMALL, { lmaxUp: 8.5, lmaxSide: 3.5, lmaxDown: 2, spacing: 3.6, lambda: 18 }));
}
for (const set of [BIG, SMALL]) for (const g of set) {
  const cx = g.bw / 2, cy = g.bh / 2;
  for (const a of g.spikes) a.th = Math.atan2(a.y - cy, a.x - cx);
}
const SLOTS = [
  { x: 6, y: 7, set: BIG, r: R_BIG, hw: 2.3 },
  { x: 45, y: 7, set: BIG, r: R_BIG, hw: 2.3 },
  { x: 97, y: 17, set: SMALL, r: R_SMALL, hw: 1.8 },
  { x: 129, y: 17, set: SMALL, r: R_SMALL, hw: 1.8 },
];
const COLON_X = 86, POOL_Y = 70;

// ------------------------------------------------------------ 1-bit raster helpers

let ops = 0;
function tri(x0, y0, x1, y1, x2, y2) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
  const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
  if (area === 0) return;
  const sg = area > 0 ? 1 : -1;
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const e0 = ((x1 - x0) * (py - y0) - (y1 - y0) * (px - x0)) * sg;
      const e1 = ((x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)) * sg;
      const e2 = ((x0 - x2) * (py - y2) - (y0 - y2) * (px - x2)) * sg;
      if (e0 >= 0 && e1 >= 0 && e2 >= 0) mask[y * W + x] = 1;
    }
  }
  ops += (maxX - minX + 1) * (maxY - minY + 1) * 4;
}
function disc(cx, cy, r, v = 1) {
  const minX = Math.max(0, Math.floor(cx - r)), maxX = Math.min(W - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r)), maxY = Math.min(H - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy <= r2) mask[y * W + x] = v;
  }
  ops += (maxX - minX + 1) * (maxY - minY + 1);
}
/** A spike: base centred on (x, y) sunk 1.5 px into the body, tip h out along (nx, ny). */
function spike(x, y, nx, ny, h, hw) {
  if (h < 0.8) return;
  const bx = x - nx * 1.5, by = y - ny * 1.5;
  tri(bx - ny * hw, by + nx * hw, bx + ny * hw, by - nx * hw, x + nx * h, y + ny * h);
}
const bump = (u) => (u <= -1 || u >= 1 ? 0 : (1 - u * u) * (1 - u * u));

// ------------------------------------------------------------ rhythm

/** The once-a-second field pulse: a quick leap, a slow relax. */
function beatAt(sec) {
  const u = sec - Math.floor(sec);
  if (u < 0.1) { const v = u / 0.1; return v * v * (3 - 2 * v); }
  const v = 1 - (u - 0.1) / 0.9;
  return v * v;
}
const FLOURISH = ['sweep', 'spiral', 'shiver'];
const FL_DUR = 1.8;
function flourishAt(sec) {
  const k = Math.floor(sec / 7.5);
  const p = (sec - k * 7.5) / FL_DUR;
  if (k < 1 || k > 6 || p >= 1) return null;
  return { type: FLOURISH[(k - 1) % 3], p };
}

// ------------------------------------------------------------ the frame

const WV = new Float32Array(32);
const THR = new Int8Array(64);
const GL = new Uint8Array(32);     // glint dashes along the strokes, this frame
const SURF = new Float32Array(W);
const PK = new Float32Array(54);
const splashes = [];

// a thinning thread of fluid breaks into beads (Rayleigh-Plateau): three per wavelength
const BEAD = Float32Array.from({ length: 32 }, (_, b) => Math.cos((TAU * 3 * b) / 32));
function drawGlyph(gl, ox, oy, base, amp, glint, bead) {
  for (let b = 0; b < 32; b++) THR[b] = THR[b + 32] = clamp(Math.round((base + amp * WV[b] + bead * BEAD[b]) * 8), -127, 127);
  const { bw, bh, sdf, phase } = gl;
  const gHi = Math.round((base - 1.6) * 8), gLo = gHi - 9;          // the glint: a 1 px line 2 px inside the edge
  const x0 = Math.max(0, -ox), x1 = Math.min(bw, W - ox), y0 = Math.max(0, -oy), y1 = Math.min(bh, H - oy);
  for (let y = y0; y < y1; y++) {
    let i = y * bw + x0, o = (oy + y) * W + ox + x0;
    for (let x = x0; x < x1; x++, i++, o++) {
      const d = sdf[i], p = phase[i];
      if (d < THR[p]) mask[o] = glint && p & 32 && d < gHi && d >= gLo && GL[p & 31] ? 0 : 1;
    }
  }
  ops += (x1 - x0) * (y1 - y0) * 2;
}

export default {
  name: 'Ferrofluid',
  blurb: 'Black magnetic fluid in a lit glass cell: magnets hold the time up as spiked pools that pulse, ripple and drip; each minute one drains and a new one is drawn out of the pool.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, t = ctx.date.getTime() / 1000;
    ctx.lcd.backlight(1 - 0.62 * ctx.night);
    ops = 0;
    mask.fill(0);
    splashes.length = 0;

    const prv = clockFields(new Date(ctx.date.getTime() - 60000));
    const nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, pd = prv.hh + prv.mm, nd = nxt.hh + nxt.mm;
    const hourOut = nxt.h !== f.h && s >= 57;
    const hourIn = prv.h !== f.h && s < 6;
    const beat = beatAt(s);
    const fl = hourOut || hourIn || s < 3 || s > 55 ? null : flourishAt(s);
    const tw = t % 600;                          // a wrapped time base for the waves
    const ph = tw * 1.15;                        // stroke waves: 1.15 cycles a second
    for (let b = 0; b < 32; b++) WV[b] = sin(TAU * (b / 32 - ph));
    for (let b = 0; b < 32; b++) GL[b] = sin(TAU * (2 * b / 32 - tw * 0.9)) > 0.15 ? 1 : 0;
    const shiver = fl && fl.type === 'shiver' ? bump(fl.p * 2 - 1) : 0;
    const frameNo = Math.floor(t * 60);

    // ---- each slot: its numeral, its magnet's state
    const states = SLOTS.map((sl, j) => {
      const gl = sl.set[+cur[j]];
      let base = -0.4 + 0.6 * beat, amp = 0.55 + 0.6 * shiver, spk = 1, dy = 0, show = true, bead = 0;
      let mound = 0;
      const removing = hourOut ? s >= 58.3 : s >= 57.5 && nd[j] !== cur[j];
      const building = hourIn ? s < 2.2 : s < 2.2 && pd[j] !== cur[j];
      if (removing) {
        const T0 = hourOut ? 58.3 : 57.5, E0 = T0 + 0.25, E1 = hourOut ? 59.55 : 59.65;
        spk = 1 - progress(s, T0, T0 + 0.4);
        const e = ease.inQuad(progress(s, E0, E1));
        amp = 0.6 * (1 - e);
        base = (-0.4 + 0.6 * beat) * (1 - progress(s, T0, E0)) * (1 - e) - (sl.r + 0.7) * e;
        dy = Math.round(4 * e);
        bead = 1.5 * Math.sin(Math.PI * e);
        show = s < E1;
        mound = 3 * progress(s, E0, E1);
      } else if (building) {
        const B0 = hourIn ? 0.08 : 0.12, B1 = hourIn ? 0.9 : 1.3;
        const gq = ease.outCubic(progress(s, B0, B1));
        base = -(sl.r - 0.8) * (1 - gq) + (-0.4 + 0.6 * beat) * progress(s, B1, B1 + 0.4);
        amp = 0.25 + 0.75 * gq;
        bead = 1.6 * (1 - gq);
        show = s >= B0;
        const sp = progress(s, B1 - 0.2, B1 + 0.6);
        spk = sp < 1 ? ease.outBack(sp) : 1;
        mound = s < 0.3 ? 3 + 3 * ease.outQuad(s / 0.3) : 6 * (1 - ease.inOutQuad(progress(s, 0.3, 1.6)));
      }
      return { sl, gl, base, amp, spk, dy, show, mound, removing, building, bead };
    });

    // ---- drops: hanging, falling, leaping (closed form from their start times)
    const drops = [];
    const GRAV = 420;
    const fallTime = (h) => Math.sqrt((2 * h) / GRAV);
    const addFall = (x, y0, t0, r, j) => {      // pinch at t0 from (x, y0), fall into the pool
      const T = fallTime(POOL_Y - y0);
      const tau = s - t0;
      if (tau < -0.45) return;
      if (tau < 0) {                              // the drop swells on a neck, still part of the numeral
        const k = (tau + 0.45) / 0.45;
        drops.push([x, y0 - 1 + r * 1.2 * k, r * (0.5 + 0.5 * k), 1]);
        return;
      }
      if (tau < T) { drops.push([x, y0 - 1 + r * 1.2 + 0.5 * GRAV * tau * tau, r, tau < 0.05 ? 2 : 0]); return; }
      splashes.push([x, tau - T, 1]);
    };
    const addLeap = (x0, x1, y1, t0, T, r) => {   // drawn up out of the pool into a numeral
      const tau = s - t0;
      if (tau < 0 || tau > T) return;
      const u = tau / T, k = 1 - (1 - u) * (1 - u);
      drops.push([x0 + (x1 - x0) * k, POOL_Y - 2 + (y1 - POOL_Y + 2) * k, r, 0]);
      if (u < 0.25) splashes.push([x0, 0.05, 0.5]);
    };
    states.forEach((st, j) => {
      const { sl, gl } = st, ox = sl.x - gl.pad, oy = sl.y - gl.pad;
      const dr = sl.set === BIG ? 2.6 : 2.1;
      if (st.removing) {
        const T0 = hourOut ? 58.3 : 57.5;
        const e = progress(s, T0 + 0.25, hourOut ? 59.55 : 59.65);
        gl.drips.forEach((p, k) => {
          for (let q = 0; q < 3; q++) addFall(ox + p.x, oy + p.y + 1 + Math.round(4 * e), T0 + 0.55 + k * 0.2 + q * 0.45 + (j & 1) * 0.1, dr * (q === 2 ? 0.75 : 1), j);
        });
      }
      if (st.building) {
        // the new magnet pulls a jet of drops up out of the crest into the numeral's foot
        const cx = ox + gl.bw / 2, B0 = hourIn ? 0.08 : 0.12;
        for (let q = 0; q < 4; q++) {
          const p = gl.drips[q % gl.drips.length];
          addLeap(cx + (p.x + ox - cx) * 0.3, ox + p.x, oy + p.y - 3, B0 - 0.32 + q * 0.06, 0.2, dr * (q & 1 ? 0.8 : 1));
        }
      }
      // the previous minute's falling drops still splashing just after :00
      if (s < 1.5 && pd[j] !== cur[j]) {
        const pg = sl.set[+pd[j]];
        pg.drips.forEach((p, k) => { for (let q = 0; q < 3; q++) addFall(ox + p.x, oy + p.y + 5, (prv.h !== f.h ? 58.3 : 57.5) + 0.55 + k * 0.2 + q * 0.45 + (j & 1) * 0.1 - 60, dr * (q === 2 ? 0.75 : 1), j); });
      }
    });
    // rest drops: one event every 6 s, a drip or a leap
    if (!hourOut && !hourIn) {
      for (let w = 1; w <= 8; w++) {
        const te = w * 6 + 3.2;
        if (s < te - 0.6 || s > te + 2) continue;
        const hsh = hash(f.minuteKey, w, 77), j = hsh % 4, st = states[j];
        if (st.removing || st.building) continue;
        const gl = st.gl, ox = st.sl.x - gl.pad, oy = st.sl.y - gl.pad, p = gl.drips[(hsh >>> 8) % gl.drips.length];
        const dr = st.sl.set === BIG ? 2.2 : 1.8;
        if (w & 1) addFall(ox + p.x, oy + p.y + 1, te, dr, j);
        else {
          addLeap(ox + p.x + ((hsh >>> 4) & 1 ? 9 : -9), ox + p.x, oy + p.y - 1, te, 0.42, dr);
          const tau = s - te;
          if (tau > 0.4 && tau < 0.75) st.spk *= 1 + 0.9 * bump((tau - 0.55) / 0.2);
        }
      }
    }

    // ---- the hour tower: timing (a closed-form spin from 57.6)
    let towerH = 0, spin = 0, gather = 0;
    const TW0 = 57.6;
    if (hourOut && s >= TW0) {
      const tau = s - TW0;
      towerH = 70 * ease.inOutCubic(progress(s, TW0, 59.7));
      spin = 0.8 * tau * tau;
      gather = progress(s, 58.4, 59.6);
    }
    if (hourIn && s < 0.8) {
      const tau = s + 60 - TW0;
      spin = 0.8 * tau * tau;
      towerH = 70 * (1 - ease.inOutQuad(progress(s, 0, 0.5)));
      gather = 1 - progress(s, 0.1, 0.6);
    }
    if (hourIn && s > 0.1) splashes.push([COLON_X, (s - 0.1) * 1.6, 2.4]);   // the tower spills: a big wave runs out

    // ---- flourish fields
    const sweepX = fl && fl.type === 'sweep' ? -24 + 210 * ease.inOutQuad(fl.p) : -999;
    const spiralA = fl && fl.type === 'spiral' ? TAU * 2.2 * ease.inOutQuad(fl.p) : 0;
    const spiralK = fl && fl.type === 'spiral' ? bump(fl.p * 2 - 1) : 0;
    let celeb = -999;     // hour: fronts running out from the middle
    if (hourIn && s > 1.0 && s < 4.0) celeb = 100 * ease.outQuad(progress(s, 1.0, 3.6));
    const secX = 6 + 148 * (s / 60);
    const secA = progress(s, 0, 1.5) * (1 - progress(s, 57, 59.5));

    // ---- the pool: surface per column
    for (let x = 0; x < W; x++) {
      let y = POOL_Y + 2.2 * sin(0.075 * x - 2.4 * tw) + 0.9 * sin(0.21 * x + 1.7 * tw) - 1.8 * beat * (0.6 + 0.4 * sin(0.05 * x - 1.1 * tw));
      y -= 2.4 * secA * bump((x - secX) / 9);
      y -= 1.6 * (bump((x + 4) / 7) + bump((x - 163) / 7));              // meniscus on the walls
      for (const st of states) if (st.mound > 0) y -= st.mound * bump((x - (st.sl.x + st.gl.w / 2)) / 13);
      for (const [sx, tau, a] of splashes) {
        if (tau > 1.4) continue;
        const A = 2.2 * a * (1 - tau / 1.4), d = 46 * tau;
        y -= A * (bump((x - sx - d) / 4) + bump((x - sx + d) / 4));
        if (tau < 0.3) y -= 3.5 * a * (1 - tau / 0.3) * bump((x - sx) / 2.5);
      }
      if (gather > 0) y += gather * (3 - 9 * bump((x - COLON_X) / 34));          // the fluid runs to the middle
      SURF[x] = towerH > 0 ? y : Math.max(61, y);
    }
    // pool spikes: a Rosensweig array seen from the side, concave cones in the
    // surface itself (a front row every 6 px, a lower back row between)
    for (let k = 0; k < 54; k++) {
      const x = 1 + 3 * k, back = k & 1, sx = clamp(Math.round(x), 0, W - 1);
      let fld = 0.2 + 0.5 * beat + 0.4 * (0.5 + 0.5 * sin(0.3 * x - 3.1 * tw));
      fld += 0.7 * secA * bump((x - secX) / 10);
      for (const st of states) if (st.mound > 0) fld += 0.15 * st.mound * bump((x - (st.sl.x + st.gl.w / 2)) / 14);
      for (const [spx, tau, a] of splashes) if (tau < 1.4) fld += 0.5 * a * (1 - tau / 1.4) * bump((Math.abs(x - spx) - 46 * tau) / 8);
      if (sweepX > -900) fld += 1.0 * bump((x - sweepX) / 24);
      if (celeb > -900) fld += 0.7 * bump((Math.abs(x - COLON_X) - celeb) / 16);
      if (shiver) fld *= 0.7 + 0.6 * shiver * ((hash(k, frameNo) & 255) / 255);
      PK[k] = Math.min((back ? 7 : 14) * clamp(fld, 0, 1.25), SURF[sx] - 60);
    }
    for (let x = 0; x < W; x++) {
      const k = Math.round((x + 0.5 - 1) / 3);
      let lift = 0;
      for (let q = k - 1; q <= k + 1; q++) {
        if (q < 0 || q > 53) continue;
        const u = Math.abs(x + 0.5 - (1 + 3 * q)) / ((q & 1) ? 2.4 : 3.2);
        if (u < 1) { const v = PK[q] * (1 - u); if (v > lift) lift = v; }
      }
      const y0 = Math.max(0, Math.round(SURF[x] - lift));
      for (let yy = y0; yy < H; yy++) mask[yy * W + x] = 1;
      // the lit glass reflected in the pool: a dashed glint under the surface, riding the swell
      if (sin(0.27 * x - 3.2 * tw) + 0.7 * sin(0.083 * x + 1.3 * tw) > 0.35) {
        const gy = Math.round(SURF[x]) + 3;
        if (gy < H - 1) mask[gy * W + x] = 0;
      }
    }
    ops += W * 30;

    // ---- the numerals
    for (const st of states) {
      if (!st.show) continue;
      const { sl, gl } = st, j = SLOTS.indexOf(sl);
      const ox = sl.x - gl.pad + Math.round(1.8 * st.spk * sin(TAU * (0.7 * tw - 0.1 * j)));   // a slow sway, passed along the row
      const oy = sl.y - gl.pad + st.dy - Math.round(2 * beat * st.spk);
      let base = st.base, amp = st.amp;
      const cx = ox + gl.bw / 2;
      if (sweepX > -900) base += 0.6 * bump((cx - sweepX) / 30);
      if (celeb > -900) base += 0.3 * bump((Math.abs(cx - COLON_X) - celeb) / 22);
      drawGlyph(gl, ox, oy, base, amp, st.spk > 0.5 && !st.removing, st.bead);
      if (st.spk <= 0.02) continue;
      for (let k = 0; k < gl.spikes.length; k++) {
        const a = gl.spikes[k];
        const wv = sin(TAU * (a.u - ph));
        let fh = 0.3 + 0.45 * beat + 0.35 * (0.5 + 0.5 * wv);
        if (sweepX > -900) fh += (a.open ? 1.2 : 0.5) * bump((ox + a.x - sweepX) / 22);
        if (spiralK) { const c = cos(a.th - spiralA); fh = fh * (1 - 0.85 * spiralK) + spiralK * (c > 0 ? (a.open ? 1.9 : 1) * c * c * c * c : 0); }
        if (celeb > -900) fh += 0.6 * bump((Math.abs(ox + a.x - COLON_X) - celeb) / 18);
        if (shiver) fh *= 0.6 + 0.8 * shiver * ((hash(k, frameNo, 3) & 255) / 255);
        const e = base + amp * wv;                 // the edge rides the stroke's bulge
        spike(ox + a.x + a.nx * e, oy + a.y + a.ny * e, a.nx, a.ny, a.L * st.spk * clamp(fh, 0, a.open ? 2 : 1.2), sl.hw);
      }
    }

    // ---- the colon: two drops on their own small magnets (they join the tower at the hour)
    const colonK = hourOut ? 1 - progress(s, 57.7, 58.3) : hourIn ? progress(s, 1.0, 1.8) : 1;
    if (colonK > 0) {
      for (const cy of [30, 44]) {
        const rr = (2.4 + 0.6 * beat) * colonK;
        disc(COLON_X, cy + (hourOut ? 20 * (1 - colonK) : 0), rr);
        for (let k = 0; k < 6; k++) {
          const a = TAU * (k / 6) + 0.5 * Math.PI / 3;
          const ca = cos(a), sa = sin(a);
          spike(COLON_X + ca * rr, cy + sa * rr, ca, sa, colonK * (1.2 + 2.2 * beat), 1.3);
        }
      }
    }

    // ---- the tower: a Kodama spiral, a cone with a screw thread of spikes
    if (towerH > 1) {
      // alone in the cell (59.5 to 00.1) it swells and bristles: the sculpture moment
      const alone = hourOut ? ease.inOutQuad(progress(s, 59.5, 59.8)) : 1 - ease.inOutQuad(progress(s, -0.05, 0.12));
      const top = POOL_Y - towerH, wb = 3 + 9 * Math.min(1, towerH / 45) + 7 * alone, QE = 2.4 - 0.6 * alone;
      let lastHx = -1;
      for (let y = Math.max(0, Math.floor(top)); y < POOL_Y + 2; y++) {
        const z = POOL_Y - (y + 0.5);
        const q = clamp(1 - z / towerH, 0, 1);
        const th = TAU * (z / 12 - spin), sn = sin(th), cs = cos(th);
        const qq = Math.pow(q, QE), hw = 1.2 + wb * qq + 2 * q * (sn > 0 ? sn * sn : 0);   // the thread swells the right edge
        const hwl = 1.2 + wb * qq + 2 * q * (sn < 0 ? sn * sn : 0);  // and the left, half a turn later
        const x0 = Math.max(0, Math.round(COLON_X - hwl)), x1 = Math.min(W, Math.round(COLON_X + hw));
        for (let x = x0; x < x1; x++) mask[y * W + x] = 1;
        // the thread's lit edge across the front, as a continuous line
        if (cs > 0.1 && hw > 3.5) {
          const hx = Math.round(COLON_X + (hw - 2) * sn);
          const a0 = lastHx < 0 ? hx : Math.min(hx, lastHx + 1), a1 = lastHx < 0 ? hx : Math.max(hx, lastHx - 1);
          for (let x = a0; x <= a1; x++) if (x > x0 && x < x1 - 1) mask[y * W + x] = 0;
          lastHx = hx;
        } else lastHx = -1;
      }
      ops += towerH * 34;
      // a spike on each crest of the thread, rising as it spins
      const c0 = spin - 0.25;
      for (let k = Math.ceil(c0 * 2); k < c0 * 2 + 14; k++) {
        const z = 12 * (k / 2 - c0);
        if (z < 1) continue;
        if (z > towerH - 4) break;
        const q = clamp(1 - z / towerH, 0, 1), side = k & 1 ? -1 : 1;
        const hw = 1.2 + wb * Math.pow(q, QE) + 2 * q;
        spike(COLON_X + side * (hw - 0.5), POOL_Y - z, side * 0.9, -0.44, (z < 12 ? 3 + 5 * Math.sqrt(q) : 2 + 2.6 * Math.sqrt(q)) + 5 * alone * Math.sqrt(q), 2 + alone);   // short where the numerals are
      }
      spike(COLON_X, top + 1.5, 0, -1, 6, 1.6);
    }

    // ---- drops
    for (const [x, y, r, neck] of drops) {
      disc(x, y, r);
      if (neck) { const x0 = Math.round(x - 0.5) - (neck === 1 ? 1 : 0); for (let yy = Math.max(0, Math.round(y - r - 3)); yy < y; yy++) { mask[yy * W + x0] = 1; if (neck === 1) mask[yy * W + x0 + 1] = 1; } }
    }

    // ---- out to the glass: two colours
    const buf = g.buf;
    for (let i = 0; i < W * H; i++) buf[i] = mask[i] ? INK : GROUND;
    g.cost.px += W * H; g.cost.box += W * H * 2 + ops * 3;
  },
};
