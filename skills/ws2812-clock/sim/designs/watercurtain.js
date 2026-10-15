// Water Curtain: a graphical waterfall, 128 x 192 portrait. A manifold of
// valves along the top prints the time in falling water and a strobe lamp
// catches the print mid-air, so it hangs there as a word of fat, glistening
// drops (the time-fountain trick). Water keeps running DOWN every stroke of
// the hanging numerals, drop after drop, and drips off their lowest points
// into the black pool. Hours hang upper left, minutes lower right, so every
// digit has its own clear fall path above and below it.
// Minute: the strobe lets the old digit go; it peels off bottom-first,
// stretches under gravity and splashes into the pool. Then the valves print
// the new one, bottom row first, so every drop arrives at once; it falls in
// squashed, stretches into shape and is caught with a glint.
// Hour: the valves weave a double helix of water in the next hour's colour
// that pours the full height behind the hanging time and crashes into the
// pool before the new time is printed.
import * as kit from '../js/kit.js';
import { runs } from './watercurtain-type.js';

const W = 128, H = 192, N = W * H;
const VALVE_Y = 5, SURF = 163;             // nozzle line, pool surface (pixel rows)
const G = 105;                             // apparent gravity, px/s^2
const R = 2.05, SP = 5.3, FLOW = 2.4;      // drop radius, drop pitch, flow speed along strokes (px/s)
const DW = 26, DH = 54;                    // digit cell
const SLOTS = [
  { x: 4, y: 20 }, { x: 35, y: 20 },       // hours, upper left
  { x: 68, y: 90 }, { x: 99, y: 90 },      // minutes, lower right
];
const LEAD = [1.5, 1.5, 1.25, 1.25];     // the old digit is let go this long before the minute
const CATCH_K = 0.86;                      // the print's flight time, times a free fall
const HELIX0 = 56.2, HELIXLEN = 3.4;       // hour overture: rolling waves from :56.2 for 3.4 s
const HOUR_HOLD = 0.95;                    // on the hour, the small hour digits are printed after the giant

// the light, by hour of day (sRGB picks): blue night, cyan day, amber dusk, violet evening
const HOUR_HEX = [
  '#5c7cff', '#6672ff', '#7268ff', '#7a68ff', '#6a80ff', '#3a86ff', '#2cb0ff', '#1cc8ff',
  '#14d6ec', '#18e0cc', '#20d4f4', '#30c8ff', '#46d0ff', '#22dcd8', '#1ccaff', '#2c9eff',
  '#4a86ff', '#ff9440', '#ff6a48', '#ff4c86', '#c068ff', '#9a6cff', '#7a70ff', '#6478ff',
];
const HOUR_COL = HOUR_HEX.map(kit.hex);

// ------------------------------------------------------------- type cache
const RUNS = [];                           // RUNS[slot][digit] = [{ pts, total, n, step }]
const DRIPS = [];                          // DRIPS[slot][digit] = [[x, y]] lowest ends that drip
for (let s = 0; s < 4; s++) {
  RUNS.push([]); DRIPS.push([]);
  for (let d = 0; d < 10; d++) {
    const rs = runs(d, SLOTS[s].x, SLOTS[s].y, DW, DH);
    for (const r of rs) r.beads = Math.max(1, Math.round(r.total / SP));
    RUNS[s].push(rs);
    // a run's lower end drips if nothing of the digit lies just below it
    const ends = [];
    for (const r of rs) {
      const x = r.pts[2 * r.n], y = r.pts[2 * r.n + 1];
      let clear = true;
      for (const q of rs) for (let k = 0; k <= q.n; k += 2) {
        if (q.pts[2 * k + 1] > y + 1.5 && Math.abs(q.pts[2 * k] - x) < 3) { clear = false; break; }
      }
      if (clear && !ends.some(([ex, ey]) => Math.hypot(ex - x, ey - y) < 3)) ends.push([x, y]);
    }
    DRIPS[s].push(ends);
  }
}

// --------------------------------------------------------------- buffers
const bg = new Float32Array(3 * N);        // background light (adds)
const show = new Float32Array(3 * N);      // the hour show's light, held back behind the time
let img = bg;                              // where background drawing goes
// the hour show passes behind the time: it is dimmed inside each digit's cell
const BOX = new Float32Array(N).fill(1);
for (const sl of SLOTS) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = Math.max(sl.x - 1 - x, x - (sl.x + DW + 1), 0), dy = Math.max(sl.y - 1 - y, y - (sl.y + DH + 1), 0);
  const e = kit.smoothstep(0, 4, Math.hypot(dx, dy));
  BOX[y * W + x] = Math.min(BOX[y * W + x], 0.22 + 0.78 * e);
}
const dig = new Float32Array(3 * N);       // the time's drops (max: drops don't add up)
const BEAD = new Float32Array(3 * 256);    // scratch: x, y, id
const moat = new Float32Array(N);          // 0..1: how much background to hold back round the time
const MOAT = 2.2;
const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (sec) => { const d = new Date(sec * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };
const hourAt = (sec) => new Date(sec * 1000).getHours();

/** Bead positions of digit d in slot s at time t, into BEAD; returns the count. */
function place(s, d, t) {
  const rs = RUNS[s][d];
  let c = 0;
  for (let ri = 0; ri < rs.length; ri++) {
    const r = rs[ri], n = r.beads, sp = r.total / n;
    const u = t * FLOW / sp + kit.hash(s, d, ri), cyc = Math.floor(u), ph = u - cyc;
    // the two fixed ends (where the stream meets the next stroke or drips)
    BEAD[3 * c] = r.pts[0]; BEAD[3 * c + 1] = r.pts[1]; BEAD[3 * c + 2] = ri * 1000 + 999; c++;
    BEAD[3 * c] = r.pts[2 * r.n]; BEAD[3 * c + 1] = r.pts[2 * r.n + 1]; BEAD[3 * c + 2] = ri * 1000 + 998; c++;
    for (let k = 0; k < n; k++) {
      const sArc = (k + ph) * sp;
      // interpolate between resample points for sub-pixel glide
      const f = sArc / r.step - Math.floor(sArc / r.step), j0 = Math.min(r.n, Math.floor(sArc / r.step)), j1 = Math.min(r.n, j0 + 1);
      BEAD[3 * c] = r.pts[2 * j0] + (r.pts[2 * j1] - r.pts[2 * j0]) * f;
      BEAD[3 * c + 1] = r.pts[2 * j0 + 1] + (r.pts[2 * j1 + 1] - r.pts[2 * j0 + 1]) * f;
      BEAD[3 * c + 2] = ri * 1000 + ((k - cyc) % 997 + 997) % 997; c++;
    }
  }
  return c;
}

// ---------------------------------------------------------------- drawing
/**
 * A drop at (x, y): radius r, a motion streak of length tail above it, body
 * colour col at intensity a, glint g (0..1, a white sparkle). toDig: draw it
 * into the time layer (max) rather than the background (add).
 */
function drop(x, y, r, tail, col, a, g, toDig) {
  const m = toDig ? MOAT + 1 : 1;
  const x0 = Math.max(0, Math.floor(x - r - m)), x1 = Math.min(W - 1, Math.ceil(x + r + m));
  const y0 = Math.max(0, Math.floor(y - r - tail - m)), y1 = Math.min(H - 1, Math.ceil(y + r + m));
  const cr = col[0], cg = col[1], cb = col[2];
  const hx = x - 0.45 * r, hy = y - 0.45 * r, hr = 0.55 * r + 0.3;
  const buf = toDig ? dig : img;
  for (let py = y0; py <= y1; py++) {
    const dyTop = y - tail - py, dyBot = py - y;
    const dy = dyTop > 0 ? dyTop : dyBot > 0 ? dyBot : 0;
    const along = tail > 0 && py < y ? (y - py) / (tail + r) : 0;     // 0 at the head, 1 at the streak's end
    const rr = r * (1 - 0.6 * along);
    for (let px = x0; px <= x1; px++) {
      const dx = px - x, d = Math.sqrt(dx * dx + dy * dy);
      if (toDig) {
        // the dark moat round the time: the background is held back here
        const mo = Math.min(1, rr + MOAT + 0.5 - d) * a;
        if (mo > moat[py * W + px]) moat[py * W + px] = mo;
      }
      let cov = rr + 0.5 - d;
      if (cov <= 0) continue;
      if (cov > 1) cov = 1;
      // lit from the pool below: a bright lower rim, a darker crown
      const low = kit.clamp(((py - y) / r) * 0.5 + 0.5);
      const k = a * cov * (0.5 + 0.5 * low * low) * (1 - 0.75 * along);
      const sx = px - hx, sy = py - hy, sd = 1 - Math.sqrt(sx * sx + sy * sy) / hr;
      const spec = sd > 0 ? a * cov * sd * (0.28 + 1.1 * g) * (1 - along) : 0;
      const p = 3 * (py * W + px);
      const vr = cr * k + spec, vg = cg * k + spec, vb = cb * k + spec;
      if (toDig) {
        if (vr > buf[p]) buf[p] = vr;
        if (vg > buf[p + 1]) buf[p + 1] = vg;
        if (vb > buf[p + 2]) buf[p + 2] = vb;
      } else { buf[p] += vr; buf[p + 1] += vg; buf[p + 2] += vb; }
    }
  }
}

/** A ripple ring spreading from (x, SURF) into the pool, seen at a low angle. */
function ring(x, age, life, size, col, a) {
  const u = age / life;
  if (u <= 0 || u >= 1) return;
  const rx = 1.5 + size * Math.sqrt(u), ry = rx * 0.28;
  const amp = a * (1 - u) * (1 - u);
  const x0 = Math.max(0, Math.floor(x - rx - 1)), x1 = Math.min(W - 1, Math.ceil(x + rx + 1));
  const y1 = Math.min(H - 1, Math.ceil(SURF + ry + 1));
  for (let py = SURF; py <= y1; py++) {
    const ny = (py - SURF) / ry;
    for (let px = x0; px <= x1; px++) {
      const nx = (px - x) / rx, e = Math.sqrt(nx * nx + ny * ny);
      const d = Math.abs(e - 1) * (ry + 1) * 1.6;
      if (d >= 1.3) continue;
      const k = amp * (1 - d / 1.3);
      const p = 3 * (py * W + px);
      img[p] += col[0] * k; img[p + 1] += col[1] * k; img[p + 2] += col[2] * k;
    }
  }
}

/** The droplets a splash throws up: closed-form parabolas. */
function splash(x, age, seed, n, col, a) {
  if (age <= 0 || age > 0.75) return;
  for (let j = 0; j < n; j++) {
    const vx = (kit.hash(seed, j, 3) - 0.5) * 46, vy = 26 + 40 * kit.hash(seed, j, 5);
    const yy = SURF - (vy * age - 80 * age * age);
    if (yy > SURF) continue;
    drop(x + vx * age, yy, 0.6, 0, col, a * (1 - age / 0.75), 0.5, false);
  }
}

/** Fall time from the valves to row y. */
const fallFrom = (y0, y) => Math.sqrt((2 * Math.max(0, y - y0)) / G);

// ------------------------------------------------------------ the digits
/** A digit hanging in the strobe: water runs down its strokes, drops glint and drip. */
function drawHover(s, d, t, col) {
  const c = place(s, d, t);
  for (let b = 0; b < c; b++) {
    const id = BEAD[3 * b + 2];
    const tw = t * 1.7 + kit.hash(id, s, 1) * 9, twi = Math.floor(tw);
    const g = kit.hash(id, s, twi) > 0.9 ? Math.sin(Math.PI * (tw - twi)) ** 2 : 0;
    drop(BEAD[3 * b], BEAD[3 * b + 1], R, 0, col, 1, g, true);
  }
  // drips: a drop swells under each free lower end, lets go and falls to the pool
  const ends = DRIPS[s][d];
  for (let e = 0; e < ends.length; e++) {
    const P = 2.6 + 2.2 * kit.hash(s, d, e), u = t / P + kit.hash(e, s, d), cyc = Math.floor(u), ph = u - cyc;
    const x = ends[e][0], y = ends[e][1];
    const tf = fallFrom(y, SURF), local = ph * P;
    if (local < 0.9) {
      const sw = local / 0.9;
      drop(x, y + 1.2 + 1.6 * sw * sw, 0.7 + 0.8 * sw, 0, col, 0.85, 0.3, true);
    } else {
      const dt = local - 0.9;
      if (dt < tf) drop(x, y + 2.8 + 0.5 * G * dt * dt, 1.3, G * dt * 0.035, col, 0.55, 0, false);
      else { ring(x, dt - tf, 1.2, 13, col, 0.16); splash(x, dt - tf, s * 97 + d * 13 + cyc, 2, col, 0.4); }
    }
  }
}

/** The old digit let go at TL: it peels off bottom-first and falls into the pool. */
function drawFalling(s, d, t, TL, col) {
  const u = t - TL;
  if (u < 0) return;
  const c = place(s, d, TL);
  let yb = 0;
  for (let b = 0; b < c; b++) yb = Math.max(yb, BEAD[3 * b + 1]);
  for (let b = 0; b < c; b++) {
    const x = BEAD[3 * b], y0 = BEAD[3 * b + 1], id = BEAD[3 * b + 2];
    const tr = (yb - y0) / 150 + 0.07 * kit.hash(id, s, 31);
    const dt = u - tr;
    if (dt <= 0) { drop(x, y0, R, 0, col, 1, 0, true); continue; }
    const y = y0 + 0.5 * G * dt * dt, v = G * dt;
    // out of the strobe's grip the drop dims into a streak
    const fade = 0.7 * Math.exp(-dt * 3.2) + 0.06;
    if (y < SURF) drop(x, y, R * 0.9, v * 0.05, col, fade, 0, false);
    else {
      const a = dt - fallFrom(y0, SURF);
      ring(x, a, 1.3, 16, col, 0.2);
      splash(x, a, id * 7 + s, 2, col, 0.45);
    }
  }
}

/** The new digit, printed by the valves from M and caught by the strobe at its slot. */
function drawArrival(s, d, t, M, col) {
  const Tfly = CATCH_K * fallFrom(VALVE_Y, SLOTS[s].y + DH);
  const Tc = M + Tfly + 0.05;                  // the catch: every drop arrives at once
  const c = place(s, d, Tc);
  for (let b = 0; b < c; b++) {
    const x = BEAD[3 * b], yT = BEAD[3 * b + 1];
    const Ti = CATCH_K * fallFrom(VALVE_Y, yT);   // this drop's flight
    const tau = Tc - t;                           // time left to the catch
    if (tau >= Ti || tau <= 0) continue;          // not fired yet, or already caught
    const q = 1 - tau / Ti;
    // falls in, then the strobe grips it: y eases to rest at its place
    const f = 2 * q * q - q * q * q * q, fd = (4 * q - 4 * q * q * q) / Ti;
    const y = VALVE_Y + (yT - VALVE_Y) * f, v = (yT - VALVE_Y) * fd;
    drop(x, y, R * (0.8 + 0.2 * q), v * 0.045, col, 0.6 + 0.4 * q, 0, true);
  }
  return Tc;
}

// ------------------------------------------------------------- the design
export default {
  name: 'Water Curtain',
  blurb: 'a graphical waterfall prints the time in drops and a strobe holds it mid-air; at the minute it lets go',
  layouts: ['hub-2x3'], look: 'smoke', fps: 60, brightness: 0.45, dither: true,
  frame(ctx) {
    bg.fill(0); show.fill(0); dig.fill(0); moat.fill(0);
    const t = ctx.date.getTime() / 1000;
    const M0 = Math.floor(t / 60) * 60, age = t - M0;
    const cur = digitsAt(M0), prev = digitsAt(M0 - 60), next = digitsAt(M0 + 60);
    const hr = hourAt(M0), hrPrev = hourAt(M0 - 60), hrNext = hourAt(M0 + 60);
    const drift = 0.5 + 0.5 * Math.sin(t * 0.17);
    const base = kit.mix(HOUR_COL[hr], HOUR_COL[(hr + 1) % 24], 0.15 * drift);
    const nextCol = HOUR_COL[hrNext];
    const showStart = hrNext !== hr ? M0 + HELIX0 : hrPrev !== hr ? M0 - 60 + HELIX0 : -1e9;
    const showCol = HOUR_COL[hrNext !== hr ? hrNext : hr];

    // ---- mist, rising off the pool
    const mt = t * 0.3;
    for (let py = 104; py < SURF; py++) {
      const f = (py - 104) / (SURF - 104), ff = f * f * f;
      for (let px = 0; px < W; px++) {
        const n = kit.noise2(px * 0.07 + Math.sin(mt + py * 0.04) * 0.8, py * 0.09 + mt * 1.6);
        const k = ff * n * n * n * 0.05;
        const p = 3 * (py * W + px);
        img[p] += base[0] * k; img[p + 1] += base[1] * k; img[p + 2] += base[2] * k;
      }
    }

    // ---- drizzle: the valves never quite close; thin trains of drops everywhere
    const fallT = fallFrom(VALVE_Y, SURF);
    // the manifold: a dark pipe with a nozzle every 2 px, lit faintly from below
    for (let px = 0; px < W; px++) {
      for (let py = 0; py <= 3; py++) {
        const k = (py === 3 ? 0.05 : 0.018) * (px & 1 ? 0.6 : 1), p = 3 * (py * W + px);
        bg[p] += 0.5 * k + base[0] * k; bg[p + 1] += 0.5 * k + base[1] * k; bg[p + 2] += 0.5 * k + base[2] * k;
      }
    }
    for (let j = 0; j < 64; j++) {
      const x = 0.5 + 2 * j + 0.6 * (kit.hash(j, 9) - 0.5);
      const P = 0.8 + 1.6 * kit.hash(j, 1), ph = kit.hash(j, 2) * P;
      const k0 = Math.floor((t - ph - fallT - 1.3) / P), k1 = Math.floor((t - ph) / P);
      for (let k = k0; k <= k1; k++) {
        const tr = ph + k * P + 0.45 * P * kit.hash(j, k, 7), dt = t - tr;
        if (dt < 0) continue;
        const br = 0.3 + 0.7 * kit.hash(j, k, 11);
        const col = tr > showStart && tr < showStart + 30 ? showCol : base;
        if (dt < 0.12) drop(x, VALVE_Y - 1, 0.7, 0, col, 0.5 * br * (1 - dt / 0.12), 0.6, false);   // the nozzle spits
        if (dt < fallT) {
          const y = VALVE_Y + 0.5 * G * dt * dt;
          drop(x, y, 0.75, G * dt * 0.04, col, 0.17 * br * (0.4 + 0.6 * kit.smoothstep(20, SURF, y)), 0, false);
        } else {
          ring(x, dt - fallT, 1.1, 12, col, 0.1 * br);
          splash(x, dt - fallT, j * 977 + k, 1, col, 0.25 * br);
        }
      }
    }

    // ---- the hour: a double helix of water woven by the valves
    img = show;
    if (t > showStart && t < showStart + HELIXLEN + fallT + 1.5) helix(t - showStart, showCol, fallT);
    if (hrPrev !== hr && age < 4.5) giant(age, hr, base, fallT);
    img = bg;

    // ---- the time
    for (let s = 0; s < 4; s++) {
      const d = +cur[s];
      if (prev[s] !== cur[s] && age < 4) {
        drawFalling(s, +prev[s], t, M0 - LEAD[s], HOUR_COL[hrPrev]);
        const Mp = M0 + (s & 1) * 0.12 + (s < 2 && hrPrev !== hr ? HOUR_HOLD : 0);
        drawArrival(s, d, t, Mp, base);
        const Tc = Mp + CATCH_K * fallFrom(VALVE_Y, SLOTS[s].y + DH) + 0.05;
        if (t >= Tc) { drawHover(s, d, t, base); catchFlash(s, t - Tc, base); }
      } else if (next[s] !== cur[s] && age > 60 - LEAD[s]) {
        drawFalling(s, d, t, M0 + 60 - LEAD[s], base);
      } else drawHover(s, d, t, base);
    }

    // ---- the pool: surface sheen and a wavering reflection
    for (let py = SURF + 1; py < H; py++) {
      const depth = (py - SURF) / (H - SURF), fade = 0.05 * (1 - depth) * (1 - depth);
      for (let px = 0; px < W; px++) {
        const wob = 1.8 * Math.sin(py * 1.3 + t * 3.1 + px * 0.06) + 0.9 * Math.sin(py * 0.7 - t * 2.3);
        const sx = Math.round(px + wob), sy = Math.round(SURF - (py - SURF) * 2.4);
        if (sx < 0 || sx >= W || sy < 0) continue;
        const q = 3 * (sy * W + sx), p = 3 * (py * W + px);
        img[p] += (img[q] + dig[q]) * fade; img[p + 1] += (img[q + 1] + dig[q + 1]) * fade; img[p + 2] += (img[q + 2] + dig[q + 2]) * fade;
      }
    }
    for (let px = 0; px < W; px++) {
      const g = 0.06 + 0.06 * kit.noise2(px * 0.15 - t * 0.8, t * 0.5);
      const p = 3 * (SURF * W + px);
      img[p] += base[0] * g; img[p + 1] += base[1] * g; img[p + 2] += base[2] * g;
    }

    // ---- compose: the time's drops sit in a dark moat over the background
    const o = ctx.out, idx = ctx.layout.grid.idx, dim = 1 - 0.6 * ctx.night;
    for (let p = 0; p < N; p++) {
      const i = idx[p];
      if (i < 0) continue;
      const keep = 1 - 0.85 * moat[p], sk = keep * BOX[p];
      o[3 * i] = (bg[3 * p] * keep + show[3 * p] * sk + dig[3 * p]) * dim;
      o[3 * i + 1] = (bg[3 * p + 1] * keep + show[3 * p + 1] * sk + dig[3 * p + 1]) * dim;
      o[3 * i + 2] = (bg[3 * p + 2] * keep + show[3 * p + 2] * sk + dig[3 * p + 2]) * dim;
    }
  },
};

/** The glint that runs over a freshly caught digit. */
function catchFlash(s, u, col) {
  if (u > 0.8) return;
  const x0 = SLOTS[s].x - 2, y = SLOTS[s].y + DH * (u / 0.6) - 4;
  const a = 0.5 * (1 - u / 0.8);
  for (let py = Math.max(0, Math.floor(y - 3)); py <= Math.min(H - 1, y + 3); py++) {
    const k = a * (1 - Math.abs(py - y) / 3);
    if (k <= 0) continue;
    for (let px = x0; px < x0 + DW + 4; px++) {
      const p = 3 * (py * W + px);
      // only where there is a drop: brightens the drops, not the air
      const m = dig[p] + dig[p + 1] + dig[p + 2];
      if (m < 0.05) continue;
      dig[p] += k * (0.5 + col[0]); dig[p + 1] += k * (0.5 + col[1]); dig[p + 2] += k * (0.5 + col[2]);
    }
  }
}

/**
 * Hour show, closed form per pixel: water at row y left the valves fallFrom(y)
 * ago. The valves fire in rows, each row timed along the manifold by a sine
 * whose phase rolls from row to row, so the curtain carries full-width waves
 * that stretch apart as they accelerate down and break on the pool one after
 * another. u = time since the show began.
 */
const NB = 10, BGAP = HELIXLEN / NB, BA = 0.22;     // rows of the wave, their spacing (s), sine amplitude (s)
const SINX = new Float32Array(W), COSX = new Float32Array(W), BSIN = new Float32Array(NB), BCOS = new Float32Array(NB);
for (let x = 0; x < W; x++) { const a = (x / W) * Math.PI * 2 * 1.15; SINX[x] = Math.sin(a); COSX[x] = Math.cos(a); }
for (let b = 0; b < NB; b++) { BSIN[b] = Math.sin(b * 0.85); BCOS[b] = Math.cos(b * 0.85); }
const bandEnv = (b) => Math.min(1, (b + 1) / 3, (NB - b) / 3);
/** Release time of wave row b at column x, from the show's start. */
const bandT = (b, x) => (b + 0.5) * BGAP + BA * (SINX[x] * BCOS[b] + COSX[x] * BSIN[b]);

function helix(u, col, fallT) {
  const silver = kit.mix(col, [0.9, 0.95, 1], 0.2);
  for (let py = VALVE_Y; py < SURF; py++) {
    const f = fallFrom(VALVE_Y, py), tau = u - f;
    if (tau < -BA - 0.1 || tau > HELIXLEN + BA + 0.1) continue;
    const v = G * f + 14;                               // px/s at this row: rows thicken as they fall
    const bc = Math.round(tau / BGAP - 0.5);
    for (let px = 0; px < W; px++) {
      let best = 9, bb = 0;
      for (let b = bc - 1; b <= bc + 1; b++) {
        if (b < 0 || b >= NB) continue;
        const d = Math.abs(tau - bandT(b, px)) * v;
        if (d < best) { best = d; bb = b; }
      }
      const half = 0.9 + 0.012 * v;
      if (best > half + 1) continue;
      const cov = kit.clamp(half + 0.5 - best);
      // a row is a string of drops, one per valve; they glitter
      const bead = 0.55 + 0.45 * Math.cos((px + 0.5) * Math.PI * 2 / 3) ** 2;
      const k = 0.42 * cov * bead * bandEnv(bb) * (0.7 + 0.3 * kit.hash(px, bb, 5)), p = 3 * (py * W + px);
      img[p] += silver[0] * k; img[p + 1] += silver[1] * k; img[p + 2] += silver[2] * k;
    }
  }
  // each row breaks on the pool: a crown of spray along it, and rings
  for (let b = 0; b < NB; b++) {
    const e = bandEnv(b);
    for (let px = 0; px < W; px++) {
      const age = u - bandT(b, px) - fallT;
      if (age <= 0 || age > 0.55) continue;
      const hgt = (4 + 9 * kit.hash(px, b, 9)) * Math.sin(Math.PI * age / 0.55), y = Math.round(SURF - hgt);
      const k = 0.5 * e * (1 - age / 0.55) * kit.hash(px, b, 3);
      for (let yy = y; yy <= Math.min(SURF, y + 1); yy++) {
        const p = 3 * (yy * W + px);
        img[p] += silver[0] * k; img[p + 1] += silver[1] * k; img[p + 2] += silver[2] * k;
      }
    }
    for (let r = 0; r < 4; r++) {
      const x = 16 + 32 * r + 8 * (kit.hash(b, r) - 0.5), xi = Math.max(0, Math.min(W - 1, Math.round(x)));
      ring(x, u - bandT(b, xi) - fallT, 1.5, 24, silver, 0.3 * e);
    }
  }
}

/**
 * On the hour the valves print the new hour across the whole curtain, the
 * way real graphical waterfalls print words: bottom row first, one row per
 * tick, so the giant numerals fall right way up, squashed near the valves
 * and stretched near the pool. u = seconds since the hour.
 */
const GH = 100, GRATE = 132;                 // glyph rows; rows per second (true proportion at mid-fall)
const giants = new Map();
function giantMask(hr) {
  if (giants.has(hr)) return giants.get(hr);
  const m = new Float32Array(W * GH), str = pad(hr), gw = 50, gap = 10, x0 = (W - 2 * gw - gap) / 2, rad = 4.2;
  for (let k = 0; k < 2; k++) {
    for (const r of runs(+str[k], x0 + k * (gw + gap), 2, gw, GH - 4)) {
      for (let j = 0; j <= r.n; j += 2) {
        const cx = r.pts[2 * j], cy = r.pts[2 * j + 1];
        for (let y = Math.max(0, Math.floor(cy - rad - 1)); y <= Math.min(GH - 1, cy + rad + 1); y++) {
          for (let x = Math.max(0, Math.floor(cx - rad - 1)); x <= Math.min(W - 1, cx + rad + 1); x++) {
            const c = kit.clamp(rad + 0.5 - Math.hypot(x - cx, y - cy));
            if (c > m[y * W + x]) m[y * W + x] = c;
          }
        }
      }
    }
  }
  giants.set(hr, m);
  return m;
}
function giant(u, hr, col, fallT) {
  const m = giantMask(hr), silver = kit.mix(col, [0.92, 0.96, 1], 0.15);
  for (let py = VALVE_Y; py < SURF; py++) {
    const f = fallFrom(VALVE_Y, py), tau = u - f;           // when this row's water left the valves
    const gy = GH - 1 - tau * GRATE;
    if (gy < 0 || gy > GH - 1) continue;
    const g0 = Math.floor(gy), g1 = Math.min(GH - 1, g0 + 1), gf = gy - g0;
    const v = G * f + 10;
    // drop trains: one drop per valve per tick, further apart as they speed up
    const ph = (tau * 44) % 1, dd = Math.min(ph, 1 - ph) * (v / 44), bead = kit.clamp(1.4 - dd) * 0.7 + 0.3;
    const a = 0.42 * bead * kit.smoothstep(0, 0.25, u) * (1 - kit.smoothstep(3.6, 4.4, u));
    for (let px = 0; px < W; px++) {
      const c = m[g0 * W + px] * (1 - gf) + m[g1 * W + px] * gf;
      if (c <= 0.01) continue;
      const k = a * c * (px & 1 ? 0.6 : 1), p = 3 * (py * W + px);
      img[p] += silver[0] * k; img[p + 1] += silver[1] * k; img[p + 2] += silver[2] * k;
    }
  }
  // where the print meets the pool, it breaks into spray
  const gs = GH - 1 - (u - fallT) * GRATE;
  if (gs >= 0 && gs < GH) {
    const row = Math.floor(gs);
    for (let px = 0; px < W; px++) {
      const c = m[row * W + px];
      if (c < 0.3) continue;
      const h = 2 + 7 * kit.hash(px, row, 1), y = Math.round(SURF - h * kit.hash(px, row, 2));
      const p = 3 * (y * W + px), k = 0.45 * c;
      img[p] += silver[0] * k; img[p + 1] += silver[1] * k; img[p + 2] += silver[2] * k;
      const q = 3 * (SURF * W + px);
      img[q] += silver[0] * 0.3 * c; img[q + 1] += silver[1] * 0.3 * c; img[q + 2] += silver[2] * 0.3 * c;
    }
  }
}
