// Locomotive — a night shunter working the clock.
//
// A side elevation of a small steam engine and its tender, running left
// across the glass under a black sky. The engine is the clock. The time is
// its own two number plates: the hours on a cast plate bolted to the cab
// side, the minutes on the tender's works plate, and the coupling between
// the two vehicles is the colon. Everything else on the glass is the
// engine's own motion — the driving wheels, the coupling rod, the crosshead
// sliding in its guide and the connecting rod doing the real geometry
// between them, the ground and the lineside poles streaming past in two
// parallax layers. Nothing on the face is a hand or a dial: the minute is
// read off the metal.
//
// The numerals are a set of cast-iron digits (see GLYPH): heavy slab forms
// with flat terminals and shallow counters, the lettering of a locomotive's
// cast number plate. They are cut in relief — a keyline clears the metal
// around each stroke so the numeral stands off the plate.
//
// A numeral changes the way iron changes. Over the last half second of the
// minute the blast from the stack catches the old digit: it comes apart into
// hot beads and streams away to the rear. At :00 the new digit is poured
// back on — a drop of molten metal runs the length of each stroke in turn,
// laying the numeral behind it in a trail of sparks, and cools to solid. So
// the plate always shows the old digit leaving or the new one arriving,
// never a third thing.
//
// On the minute the exhaust beats once at the stack — a puff, a shower of
// sparks, and the firebox light pulsing up through the motion. On the hour
// the engine gets up on its toes: the whistle screams a plume over the cab,
// the fire flares, and the engine and the whole world speed up together for
// a few seconds while all four numerals are re-poured in a cascade.
//
// Burn-in: the whole picture rides the engine's springs — a three-pixel orbit
// stepped every three minutes — so no glass pixel sits still for long.
// From 23:00 to 07:00 the panel dims through ctx.night.

import {
  dither, segDist, clamp, noise, orbit, previousMinute, clockFields, ON, OFF,
} from '../js/kit.js';

const TAU = Math.PI * 2;
const RAIL = 52;
const DR = 5.5, DCY = 46.5;                 // driving wheel: radius, centre height
const SPD = (TAU * DR) / 4;                 // ground speed — one wheel turn in 4 s
const DRIVERS = [35, 47, 59];
const CRANK = 4.5, ROD = 14, GUIDE = 38;    // valve motion
const TWHEELS = [84, 98, 112];
const CAB = { x0: 40, x1: 70, y0: 13, y1: 41 };
const TENDER = { x0: 82, x1: 122, y0: 20, y1: 45 };
const HOURS = { x: 44, y: 20, w: 23, h: 19 };
const MINS = { x: 82, y: 21, w: 38, h: 22 };
const COAL = { x0: 84, x1: 120, top: 15 };

/** The burn-in orbit, applied to the finished frame: g.shift, without
 *  allocating a fresh buffer every frame. */
const SCRATCH = new Uint8Array(128 * 64);
function ride(g, dx, dy) {
  if (!dx && !dy) return;
  const b = g.buf, W = g.width, H = g.height;
  SCRATCH.set(b);
  for (let y = 0; y < H; y++) {
    const sy = y - dy;
    for (let x = 0; x < W; x++) {
      const sx = x - dx;
      b[y * W + x] = sx >= 0 && sy >= 0 && sx < W && sy < H ? SCRATCH[sy * W + sx] : 0;
    }
  }
}

// ---------------------------------------------------------------- letterforms
//
// One digit set, drawn as strokes in a box 11 wide and 20 tall (y down).
// A stroke is a polyline; arcs are sampled in clock angles (0 up, clockwise).

function arcP(cx, cy, rx, ry, a0, a1) {
  const span = a1 - a0;
  const n = Math.max(3, Math.ceil(Math.abs(span) / 9));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (span * i) / n) * Math.PI) / 180;
    out.push([cx + rx * Math.sin(a), cy - ry * Math.cos(a)]);
  }
  return out;
}

const GLYPH = {
  0: [arcP(5.5, 10, 3.7, 7.7, 0, 360)],
  1: [[[2.5, 6.6], [6.3, 2.4], [6.3, 17.8]], [[3.0, 17.8], [9.5, 17.8]]],
  2: [[...arcP(5.5, 6.7, 3.6, 4.1, 250, 462), [1.9, 17.8], [9.6, 17.8]]],
  3: [[...arcP(5.4, 5.9, 3.4, 3.9, 272, 470), [8.5, 10.1], ...arcP(5.4, 12.5, 3.4, 4.9, 84, 282)]],
  4: [[[7.9, 2.4], [1.8, 12.9], [9.7, 12.9]], [[7.9, 2.4], [7.9, 17.8]]],
  5: [[[9.4, 2.6], [3.0, 2.6], [2.6, 9.7]], arcP(5.8, 13.3, 3.4, 4.2, 306, 586)],
  6: [arcP(5.6, 6.9, 3.7, 4.5, 60, -114).concat(arcP(5.6, 13.4, 3.7, 4.4, 246, 606))],
  7: [[[1.9, 2.6], [9.4, 2.6], [5.4, 17.8]], [[1.9, 2.6], [1.9, 5.6]]],
  8: [arcP(5.5, 6.0, 3.5, 3.9, 0, 360), arcP(5.5, 13.6, 3.6, 4.2, 0, 360)],
  9: [arcP(5.5, 6.3, 3.65, 4.2, 286, 646), [[8.9, 7.0], [8.1, 12.4], [6.3, 17.8]]],
};

const GW = 11, GH = 20, HALF = 1.85, KEY = 1.5;

/** Flatten a digit into segments carrying the pen length at each end. */
function penOf(d) {
  const segs = [];
  let cum = 0;
  for (const st of GLYPH[d]) {
    for (let i = 1; i < st.length; i++) {
      const [ax, ay] = st[i - 1], [bx, by] = st[i];
      const L = Math.hypot(bx - ax, by - ay);
      if (L > 1e-6) { segs.push([ax, ay, bx, by, cum, L]); cum += L; }
    }
  }
  return { segs, total: cum };
}
const PEN = {};
for (const d of Object.keys(GLYPH)) PEN[d] = penOf(Number(d));

/** Where the pen is after `need` glyph units along a digit's path. */
function penHead(d, need) {
  for (const [ax, ay, bx, by, s0, L] of PEN[d].segs) {
    if (need <= s0 + L) {
      const u = clamp((need - s0) / L, 0, 1);
      return [ax + (bx - ax) * u, ay + (by - ay) * u];
    }
  }
  const last = PEN[d].segs.at(-1);
  return [last[2], last[3]];
}

/**
 * A distance field for one digit at one scale: for every pixel of a small
 * tile, how far it is from the stroke's centre-line and how far along the
 * pen that nearest point lies. The frame then draws a digit with one pass
 * and no geometry, and a partly drawn digit is just a threshold on `arc`.
 */
const FIELDS = new Map();
function field(d, s) {
  const key = d + '|' + s;
  let f = FIELDS.get(key);
  if (f) return f;
  const pad = 3;
  const w = Math.ceil((GW + 2 * pad) * s), h = Math.ceil((GH + 2 * pad) * s);
  const dist = new Float32Array(w * h), arc = new Float32Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const gx = (i + 0.5) / s - pad, gy = (j + 0.5) / s - pad;
      let m = 1e9, sa = 0;
      for (const [ax, ay, bx, by, s0, L] of PEN[d].segs) {
        const dx = bx - ax, dy = by - ay;
        const u = clamp(((gx - ax) * dx + (gy - ay) * dy) / (L * L), 0, 1);
        const dd = Math.hypot(gx - ax - dx * u, gy - ay - dy * u);
        if (dd < m) { m = dd; sa = s0 + L * u; }
      }
      dist[j * w + i] = m; arc[j * w + i] = sa;
    }
  f = { w, h, dist, arc, pad, s, total: PEN[d].total };
  FIELDS.set(key, f);
  return f;
}

/**
 * Draw digit `d` at scale `s` with its glyph origin at (x, y). `need` is how
 * far along the pen to draw (Infinity for the finished numeral). The metal
 * that has not been reached yet is cleared, not left, so a numeral is always
 * poured onto bare plate.
 */
function drawDigit(g, d, s, x, y, need = Infinity) {
  const f = field(d, s);
  const ox = Math.round(x - f.pad * s), oy = Math.round(y - f.pad * s);
  const n = Math.min(need, f.total);
  for (let j = 0; j < f.h; j++)
    for (let i = 0; i < f.w; i++) {
      const k = j * f.w + i, dd = f.dist[k];
      if (dd > HALF + KEY) continue;
      g.pixel(ox + i, oy + j, dd <= HALF && f.arc[k] <= n ? ON : OFF);
    }
}

/** The beads a digit breaks into when the blast takes it. */
const BEADS = new Map();
function beads(d, s) {
  const key = d + '|' + s;
  let b = BEADS.get(key);
  if (b) return b;
  b = [];
  let n = 0;
  for (const [ax, ay, bx, by, s0, L] of PEN[d].segs) {
    const steps = Math.max(1, Math.round(L / (2.1 / s)));
    for (let i = 0; i < steps; i++) {
      const u = i / steps;
      b.push({
        x: ax + (bx - ax) * u, y: ay + (by - ay) * u,
        delay: 0.55 * (1 - (s0 + L * u) / PEN[d].total) + 0.42 * noise(n * 7.3 + d * 3.1, 2),
        spd: 0.5 + noise(n * 2.7 + d, 5),
        vy: -0.4 - noise(n * 1.9 + d, 8),
      });
      n++;
    }
  }
  BEADS.set(key, b);
  return b;
}

// ---------------------------------------------------------------- the plates

/** A rivet: a lit boss with a keyline round it, so it reads raised. */
function rivet(g, x, y) {
  g.fillRect(x - 1, y - 1, 3, 3, OFF);
  g.fillRect(x, y, 2, 2, ON);
}

/** A cast plate: a rim, a shadow line under the top edge, four rivets. */
function plate(g, p, framed) {
  if (framed) g.roundRect(p.x, p.y, p.w, p.h, 2, ON);
  else {
    g.hline(p.x + 3, p.y, p.w - 6, ON);
    g.hline(p.x + 3, p.y + p.h - 1, p.w - 6, ON);
  }
  rivet(g, p.x + 2, p.y + 1);
  rivet(g, p.x + p.w - 4, p.y + 1);
  rivet(g, p.x + 2, p.y + p.h - 3);
  rivet(g, p.x + p.w - 4, p.y + p.h - 3);
}

/** A dotted line: how the engraver's hatch reads at this pitch. */
const hatch = (g, x, y, w, lvl = 0.42) => g.shade(x, y, w, 1, lvl);

// ---------------------------------------------------------------- night sky

function stars(g, T) {
  for (let i = 0; i < 13; i++) {
    const x = Math.round(noise(i, 11) * 124) + 2;
    const y = Math.round(noise(i, 12) * 10) + 1;
    if (x > 6 && x < 40 && y > 4) continue;             // the plume's road
    if (y > 9 && x > 38 && x < 74) continue;            // the cab roof
    if (0.55 + 0.45 * Math.sin(T * (0.5 + noise(i, 13)) + i) < 0.4) continue;
    g.pixel(x, y, ON);
  }
}

/** Lineside poles, streaming past a little slower than the ground. */
function poles(g, D) {
  const S = 62;
  const off = (((D * 0.45) % S) + S) % S;
  for (let x = off - S; x < 132; x += S) {
    const px = Math.round(x);
    if (px < -3 || px > 131) continue;
    g.vline(px, 12, RAIL - 12, ON);
    g.hline(px - 4, 15, 9, ON);
    g.hline(px - 3, 19, 7, ON);
    g.pixel(px - 1, 13, ON); g.pixel(px + 1, 13, ON);
  }
}

/** The permanent way: rail, sleepers, and the light the engine throws on it. */
function ground(g, D, fire) {
  const S = 14;
  const off = (((D % S) + S) % S);
  glow(g, 50, RAIL + 2, 12, 3.5, 0.06 + 0.26 * fire, 0);
  for (let x = off - 2 * S; x < 132; x += S) {
    const px = Math.round(x);
    g.hline(px, RAIL + 1, 8, ON);
    g.pixel(px + 1, RAIL + 2, ON);
    g.pixel(px + 6, RAIL + 2, ON);
  }
  g.hline(0, RAIL, 128, ON);
}

// ---------------------------------------------------------------- the engine

function boiler(g) {
  g.line(13, 26, 40, 26, ON);                            // the crown of the barrel
  g.line(12, 27, 12, 30, ON);                            // the smokebox's rounded front
  g.line(11, 31, 11, 38, ON);
  g.line(12, 39, 13, 40, ON);
  g.hline(2, 41, 69, ON);                                // the running plate
  g.vline(24, 26, 15, ON);                               // the smokebox joint
  g.shade(27, 30, 12, 1, 0.26);                          // one long highlight
  g.vline(38, 27, 14, ON);                               // a boiler band
  // the handrail along the barrel
  g.hline(22, 28, 16, ON);
  g.vline(26, 27, 2, OFF); g.vline(36, 27, 2, OFF);
  // chimney: a tapered stack under a flared cap
  g.line(15, 26, 15, 17, ON); g.line(21, 26, 21, 17, ON);
  g.hline(13, 16, 10, ON);
  g.hline(11, 17, 14, ON); g.hline(11, 18, 14, ON);
  g.hline(15, 19, 6, OFF);
  // steam dome, a half-round with its base ring
  g.fillWhere((px, py) => {
    const u = ((px - 35.5) / 4.4) ** 2 + ((py - 30) / 8) ** 2;
    return u <= 1 && u > 0.42 && py < 27.4 && py > 22.6;
  }, ON, [30, 21, 12, 8]);
  g.hline(32, 22, 7, ON);
  // the safety valves
  g.fillRect(44, 23, 3, 4, ON); g.fillRect(45, 21, 2, 3, ON);
}

function cab(g) {
  // a shallow curved roof with an overhanging lip
  for (let x = 38; x <= 72; x++) {
    const u = (x - 55) / 17;
    g.pixel(x, Math.round(12.6 + 2.1 * u * u), ON);
  }
  g.vline(40, 15, 27, ON);
  g.vline(70, 15, 27, ON);
  g.roundRect(50, 15, 14, 5, 2, ON);                     // the cab window
  // the whistle on the roof
  g.fillRect(46, 10, 2, 3, ON); g.fillRect(45, 8, 4, 2, ON);
}

function tender(g) {
  g.roundRect(TENDER.x0, TENDER.y0, TENDER.x1 - TENDER.x0, TENDER.y1 - TENDER.y0, 2, ON);
  // the coal, heaped above the rail
  for (let x = COAL.x0; x < COAL.x1; x++) {
    const u = (x - COAL.x0) / (COAL.x1 - COAL.x0);
    const top = TENDER.y0 - 4.6 * Math.sin(Math.PI * clamp(u, 0, 1)) - 0.6;
    g.pixel(x, Math.round(top), ON);
    if (noise(x, 3) > 0.5) g.pixel(x, Math.round(top) + 1, ON);
  }
  g.vline(120, TENDER.y0 + 4, 5, ON);                    // a handrail at the back
}

/** One wheel: tyre, spokes, counterweight, crank pin, all at phase `a`. */
function wheel(g, cx, cy, r, a, spokes, pin) {
  g.circle(cx, cy, r, ON);
  if (r > 4.5) g.circle(cx, cy, r - 1.3, ON);
  const hub = Math.max(1, r * 0.28);
  for (let k = 0; k < spokes; k++) {
    const th = a + (k * TAU) / spokes;
    g.line(cx + hub * Math.sin(th), cy - hub * Math.cos(th),
      cx + (r - 1.4) * Math.sin(th), cy - (r - 1.4) * Math.cos(th), ON);
  }
  g.fillCircle(cx, cy, hub, ON);
  g.arc(cx, cy, Math.max(1.4, r * 0.42), r - 1.1, a + Math.PI - 0.85, a + Math.PI + 0.85, ON);
  if (!pin) return null;
  const px = cx + CRANK * Math.sin(a), py = cy - CRANK * Math.cos(a);
  return [px, py];
}

function motion(g, D) {
  const ph = (TAU * D) / (TAU * DR);
  const p1 = [DRIVERS[0] + CRANK * Math.sin(ph), DCY - CRANK * Math.cos(ph)];
  const dy = p1[1] - GUIDE;
  const ch = [p1[0] - Math.sqrt(Math.max(4, ROD * ROD - dy * dy)), GUIDE];
  // cylinder block
  g.rect(11, 34, 11, 9, ON);
  hatch(g, 13, 36, 7, 0.3);
  g.hline(11, 43, 11, ON);
  // piston rod, crosshead, connecting rod
  g.line(21, GUIDE, ch[0] + 3, GUIDE, ON);
  g.fillRect(ch[0] - 2, GUIDE - 3, 5, 6, ON);
  g.fillRect(ch[0] - 3, GUIDE - 4, 2, 8, OFF);
  g.thickLine(ch[0], GUIDE, p1[0], p1[1], 2.4, ON);
  // driving wheels and the coupling rod that ties them
  const pins = DRIVERS.map((x) => wheel(g, x, DCY, DR, ph, 6, true));
  g.thickLine(pins[0][0], pins[0][1], pins[2][0], pins[2][1], 2.2, ON);
  for (const p of pins) { g.fillCircle(p[0], p[1], 2.2, OFF); g.fillCircle(p[0], p[1], 1.4, ON); }
  wheel(g, 23, 48, 4, ph * (DR / 4), 5, false);
  for (const x of TWHEELS) wheel(g, x, 48, 4, ph * (DR / 4), 5, false);
  // buffers and the bar to the tender
  g.fillRect(3, 35, 3, 14, ON);
  g.fillRect(1, 38, 3, 3, ON);
  g.fillRect(1, 44, 3, 3, ON);
  g.hline(70, 40, 6, ON);
}

// ---------------------------------------------------------------- light

/** A soft dithered glow whose texture travels with it. */
function glow(g, cx, cy, rx, ry, level, seed) {
  const sx = Math.round(cx) + seed * 5, sy = Math.round(cy) - seed * 3;
  g.fillWhere((px, py, ix, iy) => {
    const u = (px - cx) / rx, v = (py - cy) / ry;
    const d2 = u * u + v * v;
    if (d2 > 1) return false;
    return dither(ix - sx, iy - sy, level * (1 - d2) ** 1.5);
  }, ON, [cx - rx - 1, cy - ry - 1, 2 * rx + 2, 2 * ry + 2]);
}

/** The exhaust: a puff at the stack every second, trailing away to the rear. */
function smoke(g, T, flare) {
  const X = 17.5, Y = 15;
  for (let k = 0; k < 3; k++) {
    const age = T - (Math.floor(T) - k);
    if (age < 0 || age > 2.9) continue;
    const cx = X + 2.3 * age + 0.9 * age * age;
    const cy = Y - 3.8 * age;
    const r = 1.8 + 1.6 * age;
    const lvl = (0.72 + 0.2 * flare) * Math.exp(-age * 0.5);
    for (let l = 0; l < 4; l++) {
      const a = l * 2.1 + age * 0.5;
      glow(g, cx + Math.sin(a) * r * 0.42, cy + Math.cos(a * 1.7) * r * 0.32,
        r * 1.2, r * 0.95, lvl * (l ? 0.66 : 1), l * 3);
    }
  }
}

/** Sparks off the stack, and the hot shower at the fire door. */
function sparks(g, T, flare) {
  const age = T - Math.floor(T);
  for (let i = 0; i < 16; i++) {
    const a = age - noise(i, 21) * 0.32;
    if (a < 0 || a > 0.95) continue;
    const vx = 0.5 + 2.3 * noise(i, 22) + 2 * flare;
    const vy = -1.5 - 2.5 * noise(i, 23);
    const x = 17.5 + vx * a + 0.7 * a * a;
    const y = 15 + vy * a + 4.4 * a * a;
    if (y < 0 || y > RAIL - 3) continue;
    if (noise(i, 24) < a / 0.95) continue;
    g.pixel(Math.round(x), Math.round(y), ON);
  }
}

// ---------------------------------------------------------------- schedule

const HOUR_BLOW = 1.2, HOUR_WRITE = 2.2;
const MIN_BLOW = 0.5, MIN_WRITE = 1.1;
const digits4 = (hh, mm) => [Math.floor(hh / 10), hh % 10, Math.floor(mm / 10), mm % 10];

function numerals(g, T, f) {
  const s = f.sec;
  const cur = digits4(f.h, f.m);
  const BLOW = f.m === 59 ? HOUR_BLOW : MIN_BLOW;
  const WRITE = f.m === 0 ? HOUR_WRITE : MIN_WRITE;
  let ref = null, blowing = false, writing = false;
  if (s >= 60 - BLOW) {
    ref = digits4(...(() => { const n = clockFields(new Date(Math.round(T * 1000) + 60000)); return [n.h, n.m]; })());
    blowing = true;
  } else if (s < WRITE) {
    const pv = previousMinute(new Date(Math.round(T * 1000)));
    ref = digits4(pv.h, pv.m); writing = true;
  }

  for (let i = 0; i < 4; i++) {
    const isH = i < 2;
    const P = isH ? HOURS : MINS;
    const sc = isH ? 0.76 : 1.0;
    const gw = GW * sc, tr = isH ? 3.0 : 6.5;
    const x0 = P.x + (P.w - (2 * gw + tr)) / 2 + (i % 2) * (gw + tr);
    const y0 = P.y + (P.h - GH * sc) / 2;
    const d = cur[i];
    const changed = ref && d !== ref[i];

    if (changed && blowing) {
      // the blast takes the old numeral apart
      const p = clamp((s - (60 - BLOW)) / BLOW, 0, 1);
      drawDigit(g, d, sc, x0, y0, 0);                    // and the plate under it
      for (const b of beads(d, sc)) {
        const q = (p - b.delay) / (1 - b.delay);
        if (q <= 0) { g.pixel(x0 + b.x * sc, y0 + b.y * sc, ON); continue; }
        if (q > 1.4) continue;
        if (noise(b.x * 3.1 + b.y, 9) < q * 1.3 - 0.3) continue;
        const x = x0 + b.x * sc - (1.4 + 3.1 * b.spd) * q - 1.4 * q * q;
        const y = y0 + b.y * sc + b.vy * 3.4 * q + 3.4 * q * q;
        if (y > 58) continue;
        g.pixel(Math.round(x), Math.round(y), ON);
        if (q < 0.3) g.pixel(Math.round(x) + 1, Math.round(y), ON);
      }
    } else if (changed && writing) {
      // the drop runs each stroke in turn and lays the numeral behind it
      const p = clamp(s / WRITE, 0, 1);
      const need = PEN[d].total * p;
      drawDigit(g, d, sc, x0, y0, need);
      if (p < 1) {
        const h = penHead(d, need);
        const hx = x0 + h[0] * sc, hy = y0 + h[1] * sc;
        glow(g, hx, hy, 7.5, 7, 0.30 + 0.34 * (1 - p), 2);
        glow(g, hx, hy, 3.4, 3.2, 0.8, 1);
        for (let k = 0; k < 5; k++) {
          const a = p * 15 + k * 1.7;
          const r = 2.5 + 5 * noise(k + Math.floor(p * 11), 31);
          const x = Math.round(hx + Math.cos(a) * r), y = Math.round(hy + Math.sin(a) * r * 0.8);
          if (y > 17 && y < 62) g.pixel(x, y, ON);
        }
      }
    } else {
      drawDigit(g, d, sc, x0, y0);
    }
  }
}

// ---------------------------------------------------------------- the design

export default {
  name: 'Siderod',
  blurb: 'A night shunter, side on: the time is the engine\'s own number plates, the exhaust beats the seconds, and each minute the changed numeral is blown off the metal and poured back on.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const { date, fields: f, oled, night } = ctx;
    const T = date.getTime() / 1000;
    const s = f.sec;

    // the hour: up on its toes, everything a little faster for a few seconds
    const fracHr = f.m * 60 + s;
    const flare = Math.exp(-fracHr / 3.4);
    const hrId = Math.floor(date.getTime() / 3600000);
    const D = SPD * (T + 3.74 * hrId + 3.74 * (1 - flare));

    const beat = Math.exp(-(T - Math.floor(T)) * 6.2);
    const fire = 0.14 + 0.36 * beat + 0.5 * flare;

    stars(g, T);
    glow(g, 51, 46, 10, 4.5, 0.05 + 0.30 * fire, 0);      // firelight in the motion
    ground(g, D, fire);

    tender(g);
    boiler(g);
    cab(g);
    motion(g, D);

    plate(g, HOURS, true);
    plate(g, MINS, false);
    numerals(g, T, f);

    // the coupling between the vehicles is the colon
    for (const y of [28, 35]) { g.fillCircle(72.5, y, 2.6, OFF); g.fillCircle(72.5, y, 1.8, ON); }

    smoke(g, T, flare);
    sparks(g, T, flare);
    if (flare > 0.3) {
      const lvl = (flare - 0.3) / 0.7;
      for (let k = 0; k < 3; k++) {
        const age = k * 1.0 + (1 - flare) * 2.2;
        if (age > 3.4) continue;
        glow(g, 47 + 0.4 * age, 8 - 3.0 * age, 1.8 + 1.1 * age, 1.5 + 0.9 * age,
          0.48 * lvl * Math.exp(-age * 0.7), k);
      }
    }

    const [ox, oy] = orbit(date, 3, 3);
    ride(g, ox, oy);

    oled.contrast(0xcf + (0x20 - 0xcf) * night);
  },
};
