// Vitals: a bedside patient monitor, and the patient's heart writes the time.
//
// The ECG channel sweeps left to right across the glass at 32 px/s, one
// sweep every five seconds, with the erase gap running ahead of the write
// head as on a real monitor. The heart beats at exactly 60: one complex per
// second, five per sweep. Four of the five are not QRS complexes at all:
// after each P wave the trace leaves the baseline and writes a digit in one
// unbroken pen stroke, then drops back to the line. The middle beat is a
// plain PQRST, the separator between hours and minutes. So the strip reads
// "10 -^- 09", rewritten by the heartbeat every five seconds, always in the
// same place.
//
// The minute turn is a dropped beat. In the last sweep of the minute every
// digit that is about to change gets a P wave with no QRS after it (a missed
// beat), so the old digit is wiped by the erase gap and nothing replaces it;
// the header flashes the yellow MISSED BEAT alarm and HR sags. From :00 the
// next sweep writes the new digits. A slot is only ever blank or right.
// On the hour the cuff takes an automatic NIBP reading: the pressure climbs,
// bleeds down, and the new figure posts.
//
// Pleth (cyan) and respiration (yellow) sweep below at their own speeds,
// with SpO2 and RR numerics beside them. Palette is the monitor convention:
// green ECG, cyan SpO2, yellow resp, white NIBP, on blue-black glass.
// Traces are AA (they glide by fractions of a pixel); all type is hard 3x5
// and 5x7 pixels, as monitor firmware draws it.

import { font3x5, font5x7, sprite, mix, clockFields, rand, clamp } from '../js/kit.js';
import { GLYPHS } from './vitals-glyphs.js';

// ------------------------------------------------------------ layout
const W = 160;
const SWEEP = 5;               // seconds per ECG sweep (divides 60: a sweep starts at :00)
const V = W / SWEEP;           // 32 px/s
const BASE = 49;               // ECG baseline row (centre of the 2 px trace)
const GW = 22, GH = 34;        // glyph box
const GOFF = 8;                // glyph box left, inside its 32 px slot
const GAP = 7;                 // erase gap ahead of the head
const SLOT_DIGIT = [0, 1, -1, 2, 3];   // slot -> digit index (-1: the separator beat)

const LOW_W = 112;             // pleth / resp panes
const PLETH_V = 32, RESP_V = 12;

// ------------------------------------------------------------ colours
const BG = 0x04080c;
const HEAD_BAR = 0x0f1b24;
const ECG = 0x3cf07a, ECG_HOT = 0xe2ffe8, ECG_DIM = 0x1d6b3a;
const SPO2 = 0x34d6f0, SPO2_DIM = 0x17606c;
const RESP = 0xf0cf3a, RESP_DIM = 0x6a5a1a;
const NIBP = 0xe6e9ec;
const LABEL = 0x7f93a0;
const ALARM = 0xf0cf3a;

const HEART = sprite(`
.#.#.
#####
#####
.###.
..#..`);

// ------------------------------------------------------------ the ECG strip as samples
// Each sample: [x, y, tw] with tw the time (s from sweep start) the head writes it.

function pushLine(out, x0, y0, x1, y1, tw0, tw1, step = 1.2) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    out.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, tw0 + (tw1 - tw0) * u]);
  }
}

/** A trace drawn as an ordinary sweep (y a function of x): written as the head passes. */
function pushWave(out, pts) {
  let [px, py] = out.length ? out[out.length - 1] : pts[0];
  for (const [x, y] of pts) {
    pushLine(out, px, py, x, y, px / V, x / V);
    px = x; py = y;
  }
}

function pWave(x0) {
  const pts = [];
  for (let i = 0; i <= 6; i++) pts.push([x0 + i, BASE - 2.6 * Math.sin((Math.PI * i) / 6)]);
  return pts;
}

/** One second of trace: slot `i` holding a digit, a dropped beat, or the separator. */
function slotSamples(i, kind) {
  const x0 = i * 32, out = [[x0, BASE, x0 / V]];
  if (kind === 'beat') {
    pushWave(out, [...pWave(x0 + 2), [x0 + 12, BASE], [x0 + 13, BASE + 1.5], [x0 + 15, BASE - 19],
      [x0 + 17, BASE + 4], [x0 + 18.5, BASE], [x0 + 21, BASE - 0.5]]);
    const t = [];
    for (let k = 0; k <= 8; k++) t.push([x0 + 21 + k, BASE - 0.5 - 4.5 * Math.sin((Math.PI * k) / 8) ** 1.4]);
    pushWave(out, [...t, [x0 + 32, BASE]]);
    return out;
  }
  pushWave(out, [...pWave(x0 + 1), [x0 + GOFF, BASE]]);
  if (kind === 'drop') {
    pushWave(out, [[x0 + 32, BASE]]);
    return out;
  }
  // a digit: the pen leaves the line at the box's left and is back at its right
  const gx = x0 + GOFF, top = BASE - GH;
  const pts = GLYPHS[kind].map(([u, v]) => [gx + u * GW, top + v * GH]);
  let L = 0;
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push((L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])));
  const t0 = gx / V, t1 = (gx + GW) / V;
  for (let k = 1; k < pts.length; k++) {
    pushLine(out, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1],
      t0 + (t1 - t0) * (cum[k - 1] / L), t0 + (t1 - t0) * (cum[k] / L), 1.4);
  }
  pushWave(out, [[x0 + 32, BASE]]);
  return out;
}

const slotCache = new Map();
function slotCached(i, kind) {
  const k = `${i}:${kind}`;
  if (!slotCache.has(k)) slotCache.set(k, slotSamples(i, kind));
  return slotCache.get(k);
}

/** What the sweep starting at `startMs` writes in its five slots. */
function sweepPlan(startMs) {
  const f = clockFields(new Date(startMs));
  const digits = f.hh + f.mm;
  const next = f.s >= 60 - SWEEP ? (() => { const n = clockFields(new Date(startMs + 60000)); return n.hh + n.mm; })() : digits;
  return SLOT_DIGIT.map((d) => (d < 0 ? 'beat' : digits[d] !== next[d] ? 'drop' : Number(digits[d])));
}

// ------------------------------------------------------------ drawing the ECG
function colourFor(age) {
  if (age < 0.06) return ECG_HOT;
  if (age < 0.45) return mix(ECG_HOT, ECG, clamp((age - 0.06) / 0.39, 0, 1) ** 0.6);
  return ECG;
}

function drawEcg(g, plan, prevPlan, p) {
  const B = p * V;                          // erase bar / head x
  const wrap = B + GAP - W;                 // the gap wraps onto the new sweep's start
  let head = null;
  const pass = (samples, cur) => {
    let prev = null, prevVis = false;
    for (const s of samples) {
      const [x, y, tw] = s;
      let vis, age;
      if (cur) { vis = tw <= p && !(x < wrap); age = p - tw; } else { vis = x > B + GAP; age = p + SWEEP - tw; }
      if (cur && prev && prevVis && !vis && tw > p) {
        // the head is somewhere on this segment
        const u = (p - prev[2]) / (tw - prev[2]);
        const hx = prev[0] + (x - prev[0]) * u, hy = prev[1] + (y - prev[1]) * u;
        g.thickLine(prev[0], prev[1], hx, hy, 2, ECG_HOT, { aa: true });
        head = [hx, hy];
      }
      if (vis && prev && prevVis) segment(g, prev, s, age);
      prev = s; prevVis = vis;
    }
  };
  for (let i = 0; i < 5; i++) pass(slotCached(i, prevPlan[i]), false);
  for (let i = 0; i < 5; i++) pass(slotCached(i, plan[i]), true);
  if (head) {
    g.fillCircle(head[0], head[1], 2.6, ECG, { aa: true, a: 0.35 });
    g.fillCircle(head[0], head[1], 1.4, 0xffffff, { aa: true });
  }
}

// flat runs of baseline merge into one rect; everything else is an AA segment
function segment(g, a, b, age) {
  const c = colourFor(age);
  if (a[1] === BASE && b[1] === BASE) {
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
    g.fillRect(Math.round(x0), BASE - 1, Math.max(1, Math.round(x1) - Math.round(x0)), 2, c);
    return;
  }
  g.thickLine(a[0], a[1], b[0], b[1], 2, c, { aa: true });
}

// ------------------------------------------------------------ pleth and resp
function pleth(t) {
  const ph = ((t - 0.42) % 1 + 1) % 1;
  let y;
  if (ph < 0.14) { const s = ph / 0.14; y = s * s * (3 - 2 * s); } else y = Math.exp(-(ph - 0.14) * 3.4);
  y += 0.16 * Math.exp(-(((ph - 0.42) / 0.06) ** 2));
  return y * (0.9 + 0.1 * Math.sin((t * Math.PI * 2) / 4));
}
function resp(t) {
  const ph = (t / 4) % 1;
  return ph < 0.42 ? 0.5 - 0.5 * Math.cos((ph / 0.42) * Math.PI) : 0.5 + 0.5 * Math.cos(((ph - 0.42) / 0.58) * Math.PI);
}

function drawLow(g, daySec, fn, v, y0, amp, c, hot) {
  const period = LOW_W / v;
  const B = ((daySec % period) / period) * LOW_W;
  let px = null, py = null;
  for (let x = 0; x < LOW_W; x++) {
    const back = (B - x + LOW_W) % LOW_W;               // px behind the head
    if (back > LOW_W - GAP) { px = null; continue; }    // in the erase gap
    const y = y0 - fn(daySec - back / v) * amp;
    if (px !== null) g.thickLine(px + 0.5, py, x + 0.5, y, 1.5, back < 6 ? hot : c, { aa: true });
    px = x; py = y;
  }
  const hy = y0 - fn(daySec) * amp;
  g.fillCircle(B, hy, 1.2, 0xffffff, { aa: true });
}

// ------------------------------------------------------------ the face
export default {
  name: 'Vitals',
  blurb: 'A bedside monitor: the heart beats at 60 and each beat writes a digit into the ECG; the minute turn is a dropped beat.',
  fps: 60,

  frame(g, ctx) {
    const { date, fields: f } = ctx;
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    g.clear(BG);

    const ms = date.getTime();
    const p = f.sec % SWEEP;
    const start = ms - p * 1000;
    const plan = sweepPlan(start), prevPlan = sweepPlan(start - SWEEP * 1000);
    const daySec = f.h * 3600 + f.m * 60 + f.sec;

    // --- alarm state: a dropped beat whose moment has come, or one just past
    let missed = 0;
    plan.forEach((k, i) => { if (k === 'drop' && p >= i + 0.3) missed++; });
    const carry = prevPlan.filter((k) => k === 'drop').length;
    const alarm = missed > 0 || (carry > 0 && p < 3);
    const nMissed = missed || carry;

    // --- header
    g.fillRect(0, 0, W, 7, HEAD_BAR);
    g.text('BED 07', 2, 1, { font: font3x5, c: LABEL });
    if (alarm) {
      const on = (f.sec * 2) % 1 < 0.7;
      g.fillRect(34, 0, 84, 7, on ? ALARM : 0x5a4c10);
      const msg = nMissed > 1 ? `${nMissed} MISSED BEATS` : 'MISSED BEAT';
      g.text(msg, 76 - (msg.length * 4 - 1) / 2, 1, { font: font3x5, c: on ? 0x101000 : ALARM });
    } else {
      g.text(`${f.dow} ${f.day} ${f.month}`, 52, 1, { font: font3x5, c: LABEL });
    }
    const beatPh = ((f.sec - 0.28) % 1 + 1) % 1;
    const throb = plan[Math.floor(p)] !== 'drop' && beatPh < 0.18;
    g.blit(HEART, 133, 1, { c: throb ? 0xff4a5a : 0x7a2a32 });
    const hr = alarm ? String(60 - 5 * nMissed) : '60';
    g.text(hr, 140, 1, { font: font3x5, c: ECG });
    g.text('BPM', 148, 1, { font: font3x5, c: ECG_DIM });

    // --- ECG pane labels
    g.text('II', 2, 8, { font: font3x5, c: ECG });
    g.text('X1', 10, 8, { font: font3x5, c: ECG_DIM });
    drawNibp(g, f);

    drawEcg(g, plan, prevPlan, p);

    // --- lower panes
    g.hline(0, 55, W, 0x14222c);
    g.vline(113, 56, 24, 0x14222c);
    g.text('PLETH', 2, 57, { font: font3x5, c: SPO2_DIM });
    g.text('RESP', 2, 69, { font: font3x5, c: RESP_DIM });
    drawLow(g, daySec, pleth, PLETH_V, 66.5, 8, SPO2, 0xc8f6ff);
    drawLow(g, daySec, resp, RESP_V, 78, 7, RESP, 0xfff2b8);

    // --- numerics
    const spo2 = 97 + Math.floor(rand(f.minuteKey, 7) * 3);
    const rr = 14 + Math.floor(rand(f.minuteKey, 9) * 3);
    g.text('SPO2', 116, 57, { font: font3x5, c: SPO2_DIM });
    g.text(String(spo2), 116, 64, { font: font5x7, scale: 2, c: SPO2 });
    g.text('%', 139, 71, { font: font3x5, c: SPO2_DIM });
    g.text('RR', 148, 57, { font: font3x5, c: RESP_DIM });
    g.text(String(rr), 146, 68, { font: font5x7, c: RESP });
  },
};

// NIBP: an automatic reading on the hour, otherwise the last result.
function drawNibp(g, f) {
  const reading = (hourKey) => {
    const s = 112 + Math.floor(rand(hourKey, 3) * 18), d = 68 + Math.floor(rand(hourKey, 5) * 12);
    return `${s}/${d}`;
  };
  const hourKey = Math.floor(f.minuteKey / 60);
  let txt, c = NIBP;
  if (f.m === 0 && f.sec < 36) {
    // inflate to 170 in 6 s, bleed down to 40 by 34 s, then post
    const cuff = f.sec < 6 ? (f.sec / 6) * 170 : 170 - ((f.sec - 6) / 28) * 130;
    txt = f.sec < 34 ? `CUFF ${Math.max(40, Math.round(cuff))}` : reading(hourKey);
    if (f.sec < 34) c = 0xb8c2ca;
  } else txt = reading(hourKey);
  const w = txt.length * 4 - 1;
  g.text('NIBP', 158 - w - 18, 8, { font: font3x5, c: LABEL });
  g.text(txt, 158 - w, 8, { font: font3x5, c });
}
