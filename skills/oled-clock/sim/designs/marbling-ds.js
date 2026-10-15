// Ebru — the time as ink floating on a tray of water.
//
// A shallow tray seen from above, its water combed into a family of wavy bands
// and mirrored down the seam of a taraklı comb at the middle of the glass. Two
// drops of ink hang on that seam: the colon. A drop is pressed over the hours,
// so their bands run in rings while the minutes' run straight.
//
// The time is that same ink, laid thick. Where a numeral stands the bands have
// closed into a solid stroke — a stroke that is heavy where the stylus was
// turning and fades out at its ends, and that the needle's drag has left a
// clean line around, bare water inside it. Nothing is drawn over the water: the
// numerals *are* the water, only thick enough to be opaque, and the filaments
// that meet one stop at its drag line.
//
// A needle circles the numerals once a minute — that is the second hand — on an
// ellipse that lies on a new axis every minute, pressing a bulge of water ahead
// of it that bends the bands, and with them the numerals, as it passes.
//
// The minute: the changing numeral is stirred. Its ink is drawn out along the
// bands and gathered into a bead of pure ink at the middle of its slot, and the
// bead is stirred back out as the next numeral. The boundary falls exactly on
// the bead, so the slot never holds a wrong time. The hour: a comb with teeth
// sweeps down the whole glass, the drop pattern itself re-forms behind it on a
// new axis, and all four numerals are pressed out again from their beads.
//
// Every frame is computed from the clock alone. The tray walks a few pixels
// every few minutes to spread the wear; 23:00-07:00 it runs at low contrast.

import { clamp, lerp, dither, previousMinute, clockFields, orbit } from '../js/kit.js';

const W = 128, H = 64;
const TOP = 17, INK_W = 22, INK_H = 30, PAD = 2, ADV = 26;
const SLOT_X = [8, 34, 70, 96];
const SEAM = 65, CY = TOP + INK_H / 2;

const S = 19;                        // band spacing = S / |grad|
const WFIL = 2.0;                     // filament width, pixels
const MAXCOV = 0.94;
const DRAG = 3.0;                    // how wide the needle's clean drag line is
const TAU = Math.PI * 2;
const TURN_PRE = 0.75;                // the part of the turn that happens before :00
const TURN_MIN = 1.8, TURN_HR = 2.6;
const STRETCH = 0.5;                 // how far the drag draws the ink out along the bands

const frac = (v) => v - Math.floor(v);
const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------ numerals
//
// One stroke per move of the needle: a polyline that swells through its length
// and tapers to a point at each end, so a stroke reads as a line of ink dragged
// through water rather than a bar of pixels.

function ellipsePts(cx, cy, rx, ry, n = 26) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

const DIGITS = {
  '0': [ellipsePts(0.5, 0.5, 0.48, 0.5, 28)],
  '1': [
    [[0.18, 0.38], [0.54, 0.13]],
    [[0.54, 0.13], [0.52, 0.9]],
    [[0.26, 0.9], [0.82, 0.9]],
  ],
  '2': [[[0.09, 0.28], [0.22, 0.1], [0.52, 0.03], [0.81, 0.12], [0.88, 0.3], [0.78, 0.5], [0.44, 0.7], [0.10, 0.94], [0.52, 0.94], [0.93, 0.94]]],
  '3': [[[0.1, 0.21], [0.31, 0.05], [0.61, 0.02], [0.86, 0.16], [0.88, 0.31], [0.74, 0.43], [0.5, 0.49], [0.78, 0.56], [0.92, 0.71], [0.85, 0.89], [0.55, 0.99], [0.25, 0.94], [0.1, 0.81]]],
  '4': [
    [[0.83, 0.02], [0.06, 0.68]],
    [[0.06, 0.68], [0.98, 0.68]],
    [[0.73, 0.02], [0.72, 1.0]],
  ],
  '5': [[[0.91, 0.05], [0.22, 0.05], [0.16, 0.43], [0.45, 0.36], [0.78, 0.45], [0.92, 0.65], [0.84, 0.87], [0.55, 0.99], [0.22, 0.93], [0.09, 0.81]]],
  '6': [[[0.86, 0.06], [0.5, 0.02], [0.22, 0.19], [0.13, 0.54], [0.16, 0.8], [0.35, 0.96], [0.62, 0.96], [0.86, 0.8], [0.87, 0.6], [0.72, 0.46], [0.45, 0.44], [0.24, 0.55], [0.16, 0.72]]],
  '7': [[[0.08, 0.05], [0.5, 0.05], [0.93, 0.05], [0.76, 0.4], [0.56, 0.71], [0.43, 0.99]]],
  '8': [[
    [0.5, 0.53], [0.29, 0.47], [0.15, 0.31], [0.21, 0.12], [0.5, 0.03], [0.79, 0.12], [0.85, 0.31], [0.71, 0.47], [0.5, 0.53],
    [0.29, 0.59], [0.13, 0.71], [0.11, 0.86], [0.35, 0.98], [0.65, 0.98], [0.89, 0.86], [0.87, 0.71], [0.71, 0.59], [0.5, 0.53],
  ]],
  '9': [[[0.14, 0.95], [0.5, 0.99], [0.78, 0.81], [0.87, 0.46], [0.84, 0.2], [0.65, 0.04], [0.38, 0.04], [0.15, 0.2], [0.13, 0.4], [0.28, 0.55], [0.55, 0.57], [0.76, 0.46], [0.84, 0.28]]],
};

function resample(pts, n) {
  const seg = [], cum = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    total += d; cum.push(total); seg.push(d);
  }
  const out = [];
  if (total < 1e-6) { for (let i = 0; i < n; i++) out.push([pts[0][0], pts[0][1]]); return out; }
  let j = 1;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * total;
    while (j < cum.length - 1 && cum[j] < s) j++;
    const t = seg[j - 1] ? (s - cum[j - 1]) / seg[j - 1] : 0;
    out.push([lerp(pts[j - 1][0], pts[j][0], t), lerp(pts[j - 1][1], pts[j][1], t)]);
  }
  return out;
}

/** A glyph in canvas pixels: strokes with per-point radii. `n` forces a
 *  resampling, so two glyphs can be morphed point for point. */
function buildGlyph(ch, ox, oy, n = 0) {
  const def = DIGITS[ch] ?? DIGITS['0'];
  const strokes = [];
  for (const raw of def) {
    let len = 0;
    for (let i = 1; i < raw.length; i++) len += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
    const N = n || Math.max(4, Math.min(24, Math.round((len * INK_H) / 4.5)));
    const pts0 = resample(raw, N);
    const closed = Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]) < 1e-6;
    const pts = pts0.map(([u, v]) => [ox + PAD + u * INK_W, oy + v * INK_H]);
    const r0 = 2.2;
    const kk = pts.map((_, i) => {
      if (i === 0 || i === N - 1) return 0;
      const ax = pts[i][0] - pts[i - 1][0], ay = pts[i][1] - pts[i - 1][1];
      const bx = pts[i + 1][0] - pts[i][0], by = pts[i + 1][1] - pts[i][1];
      const la = Math.hypot(ax, ay) + 1e-6, lb = Math.hypot(bx, by) + 1e-6;
      return Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) / ((la + lb) / 2);
    });
    const ws = pts.map((_, i) => {
      let w;
      if (closed) w = 1;
      else {
        const t = i / (N - 1);
        const taper = clamp(Math.min(1, t / 0.22, (1 - t) / 0.22), 0, 1);
        w = 0.34 + 0.66 * Math.pow(taper, 0.5);
      }
      // the needle lays more ink where it is turning: round forms are heavy,
      // straights are thin, and every stroke fades out at its ends
      let k = 0;
      for (let j = -2; j <= 2; j++) k += kk[clamp(i + j, 0, N - 1)] / 5;
      return r0 * w * (0.94 + 0.12 * Math.min(1, k / 0.09));
    });
    const cen = pts.reduce((a, p) => [a[0] + p[0] / N, a[1] + p[1] / N], [0, 0]);
    strokes.push({ pts, ws, cen });
  }
  return { strokes };
}

/** A bead of ink: one small closed loop, drawn thick so it reads as a drop. */
function beadGlyph(x, y) {
  const pts = ellipsePts(x, y, 1.6, 1.6, 10);
  const ws = pts.map(() => 2.4);
  return { strokes: [{ pts, ws, cen: [x, y] }] };
}

/** Between two glyphs, stroke for stroke. A stroke with no partner in the other
 *  glyph retreats to `collapse` (the bead), so the ink is carried across and
 *  never fades out. */
function morphGlyph(a, b, collapse) {
  const n = clamp(Math.max(10, ...a.strokes.map((s) => s.pts.length), ...b.strokes.map((s) => s.pts.length)), 10, 16);
  const ra = a.strokes.map((s) => ({ pts: resample(s.pts, n), ws: pad(s.ws, n), cen: s.cen }));
  const rb = b.strokes.map((s) => ({ pts: resample(s.pts, n), ws: pad(s.ws, n), cen: s.cen }));
  const out = [];
  const to = (o) => o.cen;
  for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
    let sa = ra[i], sb = rb[i];
    if (i >= rb.length) {
      const c = collapse ?? to(ra[i]);
      sb = { pts: ra[i].pts.map(() => [c[0], c[1]]), ws: ra[i].ws.map((w) => Math.min(w, 1.6)) };
    }
    if (i >= ra.length) {
      const c = collapse ?? to(rb[i]);
      sa = { pts: rb[i].pts.map(() => [c[0], c[1]]), ws: rb[i].ws.map((w) => Math.min(w, 1.6)) };
    }
    out.push({ a: sa, b: sb });
  }
  return { pairs: out };
}

function pad(ws, n) {
  if (ws.length === n) return ws;
  const out = [];
  for (let i = 0; i < n; i++) out.push(ws[Math.min(ws.length - 1, Math.round((i / (n - 1)) * (ws.length - 1)))]);
  return out;
}

/** The strokes of a glyph (or of a morph at parameter s) as polylines of
 *  [x, y, r] points. */
function glyphPolys(G, s, wk) {
  const out = [];
  if (G.pairs) {
    for (let j = 0; j < G.pairs.length; j++) {
      const pr = G.pairs[j];
      const pa = pr.a.pts, pb = pr.b.pts, wa = pr.a.ws, wb = pr.b.ws;
      const n = Math.min(pa.length, pb.length);
      const st = [];
      for (let i = 0; i < n; i++) {
        st.push([pa[i][0] + (pb[i][0] - pa[i][0]) * s, pa[i][1] + (pb[i][1] - pa[i][1]) * s,
          (wa[i] + (wb[i] - wa[i]) * s) * wk]);
      }
      out.push(st);
    }
    return out;
  }
  for (const st of G.strokes) out.push(st.pts.map((p, i) => [p[0], p[1], st.ws[i] * wk]));
  return out;
}

/** Lay ink along a polyline: a disc of the local radius at every step, so the
 *  cost is the stroke's length and not the area it covers. */
function stampInk(g, pts, place) {
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1], ar = pts[i - 1][2];
    const bx = pts[i][0], by = pts[i][1], br = pts[i][2];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 1.1));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const p = place(ax + (bx - ax) * t, ay + (by - ay) * t);
      stamp(g, p[0], p[1], ar + (br - ar) * t, 0, 1);
    }
  }
}

/** Take ink off along a polyline: a ring of (r, r+DRAG] at every step. */
function stampDrag(g, pts, place) {
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1], ar = pts[i - 1][2];
    const bx = pts[i][0], by = pts[i][1], br = pts[i][2];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 1.4));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const p = place(ax + (bx - ax) * t, ay + (by - ay) * t);
      const r = ar + (br - ar) * t;
      stamp(g, p[0], p[1], r + DRAG, r + 0.35, 0);
    }
  }
}

function stamp(g, cx, cy, rOut, rIn, c) {
  const x0 = Math.floor(cx - rOut), x1 = Math.ceil(cx + rOut);
  const y0 = Math.floor(cy - rOut), y1 = Math.ceil(cy + rOut);
  const o2 = rOut * rOut, i2 = rIn * rIn;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 <= o2 && d2 > i2) g.pixel(x, y, c);
    }
  }
}

// ------------------------------------------------------------ the design

export default {
  name: 'Ebru',
  blurb: 'Marbling ink on a tray of water: the numerals are the pattern itself, laid thick, and a needle stirs each one into a bead of ink and out again as the next.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const f = ctx.fields;
    const T = ctx.date.getTime() / 1000;
    const u = f.sec;
    const [OX, OY] = orbit(ctx.date, 2, 3);       // the whole tray walks, for the wear

    // ---- what the turn is doing right now
    const prev = previousMinute(ctx.date);
    const nextF = clockFields(new Date(ctx.date.getTime() + 60000));
    let oldStr, newStr, tau;
    if (u >= 60 - TURN_PRE) { oldStr = f.hh + f.mm; newStr = nextF.hh + nextF.mm; tau = u - (60 - TURN_PRE); }
    else { oldStr = prev.hh + prev.mm; newStr = f.hh + f.mm; tau = TURN_PRE + u; }
    const hourTurn = oldStr.slice(0, 2) !== newStr.slice(0, 2);
    const turnLen = hourTurn ? TURN_HR : TURN_MIN;
    const turning = tau < turnLen;
    const ph = turning ? clamp(tau / turnLen, 0, 1) : 0;
    const boundary = TURN_PRE / turnLen;

    // ---- the tray's pattern: ink combed into wavy bands, mirrored down the
    //      seam of the comb, with a drop's rings pressed round the hour numerals.
    // Every one of these is a continuous function of the clock: nothing here
    // may step when a minute or an hour turns, or the whole tray would jump.
    const dayIdx = Math.floor((ctx.date.getTime() - ctx.date.getTimezoneOffset() * 60000) / 86400000);
    const hourIdx = dayIdx * 24 + ctx.date.getHours();
    // the tray is re-combed at the top of each hour: the new axis is slewed in
    // over the first two seconds of the hour, not stepped on the boundary
    const recomb = sstep(0, 1, clamp(((f.m * 60 + f.sec) - 0.7) / 2.2, 0, 1));
    const pick = (k) => { const x = Math.sin(k * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const U0 = 0.1 + 0.16 * Math.sin(T / 113) + 0.62 * lerp(pick(hourIdx), pick(hourIdx + 1), recomb);
    const UX = Math.sin(U0), UY = Math.cos(U0);
    const KR = lerp(0.146, 0.118, recomb), AW = 4.0;
    // Every phase that is evaluated per pixel is reduced to one turn here: the
    // sine of a 1e9-second clock is seven times slower than the sine of a small
    // number, and it is the same angle either way.
    const Drift = -T / 17;
    const driftFrac = Drift - Math.floor(Drift);
    const driftPh = ((Drift * 5.6) % TAU + TAU) % TAU;
    const wrap = (v) => ((v % TAU) + TAU) % TAU;
    const f1 = wrap(T / 23 + 2.4 * Math.sin(T / 57));
    const f3 = wrap(2.4 * Math.cos(T / 71) - T / 29);
    const hrRing = [[38, CY], [38, CY]];
    const hourAmp = 0.95;

    let PH = 0, GS = 1;
    const band = (x0, y0) => {
      const xm = SEAM + Math.abs(x0 - SEAM);            // mirrored across the comb's seam
      const fx = xm + 3.0 * Math.sin(y0 * 0.052 + f1);
      const fy = y0 + 2.6 * Math.sin(xm * 0.041 - f3);
      const a = fx * UX + fy * UY;
      const b = -fx * UY + fy * UX;
      const wv = b * KR + driftPh;
      const sw = Math.sin(wv);
      let s = a + AW * sw;
      const ak = AW * KR;
      let gr = Math.sqrt(1 + ak * ak * (1 - sw * sw));
      if (x0 < hrRing[0][0] + 44 && x0 > hrRing[0][0] - 44) {
        const dx = x0 - hrRing[0][0], dy = y0 - hrRing[0][1];
        const d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
        if (d < 42) {
          const q = 1 - d / 42;
          s += hourAmp * q * q * d;
          gr += hourAmp * q * 0.95;
        }
      }
      PH = s / S + driftFrac; GS = gr;
    };

    // ---- the needle: the second hand
    //
    // It circles the numerals once a minute on an ellipse that lies on a new
    // axis every minute. The axis only ever changes while the needle is off its
    // circle for the turn, so the change is never seen.
    const ms = (((f.minuteKey % 11) / 11) - 0.5) * 0.9;
    const GCX = 65, GCY = CY, RXe = 52, RYe = 18;
    const cs0 = Math.cos(ms), sn0 = Math.sin(ms);
    const swept = (u / 60) * Math.PI * 2;
    const tipX = GCX + (RXe * Math.sin(swept)) * cs0 + (RYe * Math.cos(swept)) * sn0;
    const tipY = GCY + (RXe * Math.sin(swept)) * sn0 - (RYe * Math.cos(swept)) * cs0;

    const changing = [];
    for (let i = 0; i < 4; i++) if (oldStr[i] !== newStr[i]) changing.push(i);
    const flyL = SLOT_X[changing.length ? changing[0] : 0] - 4;
    const flyR = SLOT_X[changing.length ? changing[changing.length - 1] : 0] + 38;
    let nx = tipX, ny = tipY, needleOn = true, combY = -99, onCircle = 1;
    if (turning && changing.length) {
      const fly = sstep(0.0, 0.22, ph);
      const pass = ph < 0.62 ? sstep(0.08, 0.72, ph) : 1 - sstep(0.78, 1.0, ph);
      if (hourTurn) { combY = lerp(-14, H + 16, sstep(0.05, 1, ph)); needleOn = false; }
      nx = lerp(tipX, lerp(flyL, flyR, pass), fly);
      ny = lerp(tipY, CY + Math.sin(ph * 13.4) * 11 * sstep(0.06, 0.3, ph), fly);
      onCircle = 1 - fly;                    // the needle lifts off its circle
    }

    const wakeR = turning ? 17 : 11;
    const wakeA = turning ? 3.2 : 1.3;
    const wp = [0, 0];
    const WR2 = wakeR * wakeR;
    const wake = (x, y) => {
      const dx = x - nx, dy = y - ny, d2 = dx * dx + dy * dy;
      if (d2 < WR2 && d2 > 0.16) {
        const d = Math.sqrt(d2);
        const k = wakeA * (1 - d / wakeR) * (1 - d / wakeR);
        wp[0] = x + (dx / d) * k; wp[1] = y + (dy / d) * k;
      } else { wp[0] = x; wp[1] = y; }
    };

    // ---- the ink of the tray: a filament wherever frac(PH) is under the lid
    const water = (x, y) => {
      const lx = x - OX, ly = y - OY;
      wake(lx, ly);
      band(wp[0], wp[1]);
      return Math.min(MAXCOV, (WFIL * GS) / S);
    };

    g.fillWhere((x, y) => {
      const c = water(x, y);
      return frac(PH) < c;
    }, 1, [0, 0, W, H]);

    // ---- the numerals: the same ink, laid thick enough that its bands close
    //      into a solid stroke, with the clean line the needle's drag leaves
    //      round it
    const laid = [];
    for (let i = 0; i < 4; i++) {
      const ch = newStr[i], och = oldStr[i];
      const live = turning && ch !== och;
      const gx = SLOT_X[i] + PAD + OX, gy = TOP + OY;
      let G, stretch = 0, nX = -UY, nY = UX;
      const cx0 = SLOT_X[i] + 13;
      if (live) {
        // hold, then gather decisively into a bead of ink at the middle of the
        // slot, hold again, then let the bead out as the next numeral. The
        // minute boundary falls exactly on the bead.
        const g0 = Math.max(0.02, boundary - 0.37), f1 = Math.min(0.98, boundary + 0.28);
        const t = ph <= g0 ? 0
          : ph <= boundary ? 0.5 * sstep(g0, boundary, ph)
            : ph <= f1 ? 0.5 + 0.5 * sstep(boundary, f1, ph) : 1;
        const bp = [cx0 + OX, CY + 6 * Math.sin(Math.PI * t) + OY];
        const bead = beadGlyph(bp[0], bp[1]);
        G = t < 0.5 ? morphGlyph(buildGlyph(och, gx, gy), bead, bp)
          : morphGlyph(bead, buildGlyph(ch, gx, gy), bp);
        G.s = (t < 0.5 ? t : t - 0.5) * 2;
        G.wk = 1 / (1 + 0.45 * STRETCH * Math.sin(Math.PI * t));
        // the ink is drawn out along the bands as the needle drags it
        stretch = STRETCH * Math.sin(Math.PI * t);
      } else {
        G = buildGlyph(ch, gx, gy);
        G.wk = 1;
      }
      // the needle's drag draws the ink out along the bands, and its bulge
      // bends the numeral as it goes past
      const place = (x, y) => {
        const rx = x - cx0, ry = y - CY;
        const t0 = (rx * nX + ry * nY) * stretch;
        let px = x + nX * t0, py = y + nY * t0;
        const dx = px - nx, dy = py - ny, d2 = dx * dx + dy * dy;
        if (d2 < WR2 && d2 > 0.16) {
          const d = Math.sqrt(d2);
          const k = wakeA * (1 - d / wakeR) * (1 - d / wakeR);
          px += (dx / d) * k; py += (dy / d) * k;
        }
        return [px, py];
      };
      laid.push({ polys: glyphPolys(G, G.s, G.wk), place });
    }
    // every drag line first, then every numeral: ink always wins over a drag
    for (const L of laid) for (const pts of L.polys) stampDrag(g, pts, L.place);
    for (const L of laid) for (const pts of L.polys) stampInk(g, pts, L.place);

    // ---- the tray: a far lip, and the near wall whose top edge is the waterline
    for (let x = 6; x < W - 6; x++) if (dither(x, 3, 0.45)) g.pixel(x + OX, 3 + OY, 1);
    for (let j = 0; j < 4; j++) {
      const lvl = 0.82 - j * 0.23;
      for (let x = 3; x < W - 3; x++) if (dither(x, H - 6 + j, lvl)) g.pixel(x + OX, H - 6 + j + OY, 1);
    }
    for (let x = 3; x < W - 3; x++) if (dither(x, H - 7, 0.8)) g.pixel(x + OX, H - 7 + OY, 1);

    // ---- the colon: two drops of ink on the seam
    const beat = Math.sin(u * Math.PI * 2);
    g.fillCircle(SEAM + OX, CY - 8 + OY + 0.9 * beat, 2.7 + 0.25 * beat);
    g.fillCircle(SEAM + OX, CY + 8 + OY - 0.9 * beat, 2.7 - 0.25 * beat);

    // ---- the needle, and the comet it drags behind it on the water
    if (needleOn && onCircle > 0.4) {
      for (let k = 13; k >= 1; k--) {
        const a = swept - k * 0.023;
        const sa = Math.sin(a), ca = Math.cos(a);
        const wdt = 2.9 * (1 - k / 15);
        if (wdt < 0.8) continue;
        g.fillCircle(GCX + RXe * sa * cs0 + RYe * ca * sn0 + OX,
          GCY + RXe * sa * sn0 - RYe * ca * cs0 + OY, wdt);
      }
    }
    if (needleOn) {
      g.fillCircle(nx + OX, ny + OY, 3.2);
      g.fillCircle(nx + OX, ny + OY, 1.3, 0);
    }

    // ---- the comb, on the hour
    if (combY > -20 && combY < H + 20) {
      g.fillRect(2, combY + OY, W - 4, 2);
      for (let x = 4; x < W - 4; x += 7) g.fillRect(x + OX, combY + 2 + OY, 1, 7);
    }

    if (ctx.night > 0) ctx.oled.contrast(Math.round(255 - 175 * ctx.night));
  },
};
