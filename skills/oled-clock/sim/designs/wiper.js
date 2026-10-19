// Wiper — stuck at a red light in the rain, at night, behind the bus.
//
// The screen is the windshield. Out beyond the glass, out of focus, a bus
// waits at the lights: its route number, blurred into a soft glow, is the
// hour (24 h), with its two brake lights as bokeh rings below and a traffic
// light glowing red up to the right. On the glass, sharp, the rain has run
// together into the minutes: each numeral is a rivulet of beaded water, one
// pearl after another, every bead with its glint.
//
// Always: rain lands (a splash ring, then a drop), drops that touch merge,
// and a drop that grows heavy lets go and runs down; one that lands on a
// numeral is drunk by it. The digits slowly fatten through the minute and
// the drop hanging from a stroke's lowest end lets go once a minute.
//
// The minute: the intermittent wiper is set to sixty seconds. It sweeps up
// round its pivot, the rubber bowing behind it, a sheet of water piling up
// on its leading edge, and wipes the glass clean (old numeral included)
// before :00. On the way back the rain fills in behind it: drops land along
// the new numeral and run together into its strokes.
//
// The hour: three seconds early the light goes green and the bus pulls
// away towards the vanishing point, still showing the old hour; an
// oncoming car's headlights sweep past and glare streaks through every
// drop; the wipers go to double speed and clear the glass at :00; then the
// next bus cuts in from the left lane, indicator blinking, and stops ahead
// with the new hour while the light goes amber and red again.
//
// Burn-in: everything beyond the glass walks a small square (kit.orbit),
// the minutes sit at a new spot each minute, the parked blade rests at a
// slightly different angle each minute, and 23:00-07:00 the panel dims.
//
// Pure function of the clock: the drops of a minute are a seeded list,
// replayed (with their merges) up to the moment asked for.

import { orbit } from '../js/kit.js';

const W = 128, H = 64;
const SPECIMEN = false;

// ------------------------------------------------------------ digit skeletons
// Centre-lines in a 26 x 40 box, as lists of polylines. Arcs are sampled.
function arc(cx, cy, rx, ry, a0, a1, n = 24) {
  // degrees, y down: 0 = right, 90 = down
  const p = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
    p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return p;
}
const SK = [
  /*0*/ [arc(13, 20, 8.5, 15.5, -90, 270, 40)],
  /*1*/ [[[7, 10], [13, 4.5], [13, 35.5]]],
  /*2*/ [[...arc(13, 12.5, 8.5, 8, 190, 380, 20), [4.5, 35.5], [22, 35.5]]],
  /*3*/ [[...arc(12.5, 11.5, 8.5, 7.5, 200, 450, 22)], [...arc(12.5, 27.5, 9.5, 8.5, 270, 520, 24)]],
  /*4*/ [[[17, 4.5], [4.5, 26], [23, 26]], [[17.5, 14], [17.5, 35.5]]],
  /*5*/ [[[21.5, 4.5], [7.5, 4.5], [6.5, 17]], [...arc(13, 25.5, 9.5, 10, 230, 495, 24)]],
  /*6*/ [[...arc(15.5, 22, 11, 17.5, 255, 180, 12)], arc(13, 27, 9, 8.8, 180, 540, 34)],
  /*7*/ [[[4.5, 4.5], [22, 4.5], [10, 35.5]]],
  /*8*/ [arc(13, 11.5, 7.5, 7.2, -90, 270, 28), arc(13, 27.5, 9.2, 8.3, -90, 270, 32)],
  /*9*/ [arc(13, 13, 9, 8.8, 0, 360, 34), [...arc(10.5, 18, 11, 17.5, 0, 75, 12)]],
];

function hash(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };

// ------------------------------------------------------------ water strokes
// Each stroke is sampled every 1.2 px into discs whose radius swells with
// gravity (water runs to the bottom of a stroke) and into whole beads, a
// fixed number per stroke; the union of the discs is the rivulet. Open
// ends that point down hang a pendant drop.
const STEP = 1.2;
function strokesOf(d) {
  const strokes = [];
  let sid = 0;
  for (const pl of SK[d]) {
    sid++;
    const L = [0];
    for (let i = 1; i < pl.length; i++) L.push(L[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
    const tot = L[L.length - 1];
    const closed = Math.hypot(pl[0][0] - pl[pl.length - 1][0], pl[0][1] - pl[pl.length - 1][1]) < 0.5;
    const n = Math.max(2, Math.round(tot / STEP));
    const nb = Math.max(1, Math.round(tot / 7.4)), lam = tot / nb;
    const pts = [];
    for (let j = 0; j <= n; j++) {
      const sd = tot * j / n;
      let i = 1; while (i < L.length - 1 && L[i] < sd) i++;
      const u = (sd - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
      const x = pl[i - 1][0] + (pl[i][0] - pl[i - 1][0]) * u;
      const y = pl[i - 1][1] + (pl[i][1] - pl[i - 1][1]) * u;
      const ph = Math.PI / 2 + 6.2832 * sd / lam;
      const b = Math.floor(sd / lam + 0.25) % nb;
      pts.push({ x, y, ph, bead: b, h: hash(d * 101 + sid * 17 + b) });
    }
    strokes.push({ pts, closed });
  }
  const drops = [];
  for (const st of strokes) {
    if (st.closed) continue;
    for (const [e, f] of [[0, 3], [st.pts.length - 1, st.pts.length - 4]]) {
      const a = st.pts[e], b = st.pts[f];
      if (a.y - b.y > 1.5 && a.y > 30) drops.push({ x: a.x, y: a.y + 1.2, r: 3.3 });
    }
  }
  return { strokes, drops };
}
const DIGIT = Array.from({ length: 10 }, (_, d) => strokesOf(d));

// radius of a sample; `pinch` 0..1 narrows the necks between beads.
function radiusAt(p, pinch, swell) {
  const base = 2.2 + 0.8 * (p.y / 40) + swell;
  const w = 0.5 + 0.5 * Math.sin(p.ph);
  return base * (1 - pinch * 0.85 * (1 - w) ** 1.5) + 0.9 * w * w * w;
}

// ------------------------------------------------------------ signed distance buffers
// Discs are stamped into a distance buffer (min of |p - c| - r) within a margin.
const SD = new Float32Array(W * H);     // water on the glass
function clearBuf(B) { B.fill(99); }
function stamp(B, cx, cy, r, margin) {
  const R = r + margin;
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.floor(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.floor(cy + R));
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy, row = y * W;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, v = Math.sqrt(dx * dx + dy * dy) - r;
      if (v < B[row + x]) B[row + x] = v;
    }
  }
}

// Bead centres collected while stamping, for the glints: [x, y, r]*.
const CEN = [];

// A water numeral at (ox, oy). `born(x, y, h)` gives the age (s) of the water
// at a point since the wiper last passed it (negative: not there yet);
// `gone(x, y)` is true where the wiper has already taken it away.
function waterDigit(d, ox, oy, swell, born, gone) {
  const { strokes, drops } = DIGIT[d];
  for (const st of strokes) {
    const pts = st.pts;
    let best = null, bestR = 0, lastBead = -1;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const x = ox + p.x, y = oy + p.y;
      if (p.bead !== lastBead) {
        if (best) CEN.push(best[0], best[1], best[2]);
        best = null; bestR = 0; lastBead = p.bead;
      }
      if (gone && gone(x, y)) continue;
      let pinch = 0.62, size = 1, dx = 0, dy = 0;
      if (born) {
        const age = born(x, y, p.h);
        if (age < 0) continue;
        if (age < 1.4) {
          // a drop lands here and runs into its neighbours: small, separate
          // and off its place at first, then pulled into the stroke
          size = 0.35 + 0.65 * smooth(age / 0.45);
          pinch = 0.62 + 0.38 * (1 - smooth((age - 0.25) / 0.9));
          const pull = 1 - smooth(age / 0.7);
          dx = (p.h - 0.5) * 5 * pull; dy = (hash(p.h * 91) - 0.5) * 5 * pull - 1.5 * pull;
        }
      }
      const r = radiusAt(p, pinch, swell) * size;
      const cx = x + dx, cy = y + dy;
      stamp(SD, cx, cy, r, 1.6);
      if (r > bestR && r > 2.9) { bestR = r; best = [cx, cy, r]; }
    }
    if (best) CEN.push(best[0], best[1], best[2]);
  }
  return drops;
}

// The water is lit; a one-pixel black moat round it keeps the lights
// behind the glass from touching it.
function paintSD(g) {
  const buf = g.buf;
  for (let k = 0; k < W * H; k++) { const v = SD[k]; if (v <= 0) buf[k] = 1; else if (v < 1.25) buf[k] = 0; }
}

// The glint of a bead: a dark hairline arc inside its upper-left rim (the
// lit sliver outside it is the highlight), cut only well inside the water.
function glint(g, cx, cy, r) {
  const buf = g.buf, rr = r - 1.5;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.floor(cx));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.floor(cy));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dd = Math.hypot(dx, dy);
    if (Math.abs(dd - rr) > 0.55) continue;
    const a = Math.atan2(-dy, -dx);
    if (a < 0.15 || a > 1.6) continue;
    const k = y * W + x;
    if (SD[k] < -1.0) buf[k] = 0;
  }
}

// ------------------------------------------------------------ the wiper
// Pivot below the bottom right corner; the blade lies parked along the
// bottom edge and sweeps up round the pivot over the whole glass.
const PX = 138, PY = 65, TH0 = 0.04, THMAX = 1.5;
const phiOf = (x, y) => Math.atan2(PY - y, PX - x);   // 0 = pointing left, up is +

// One wipe: [start, up, pause, down] seconds; it leaves the park angle p0
// and comes back to rest at p1 (the park creeps a little from minute to
// minute, so the parked blade does not burn one line into the glass).
// The angle (and rate) at t.
function wipeAngle(w, t, p0, p1) {
  const [s, up, pa, dn] = w;
  if (t <= s) return [p0, 0];
  if (t < s + up) { const A = THMAX - p0, u = (t - s) / up; return [p0 + A * (1 - Math.cos(Math.PI * u)) / 2, Math.sin(Math.PI * u) * A * Math.PI / (2 * up)]; }
  if (t < s + up + pa) return [THMAX, 0];
  if (t < s + up + pa + dn) { const A = THMAX - p1, u = (t - s - up - pa) / dn; return [THMAX - A * (1 - Math.cos(Math.PI * u)) / 2, -Math.sin(Math.PI * u) * A * Math.PI / (2 * dn)]; }
  return [p1, 0];
}
const parkOf = (K) => TH0 + 0.022 * Math.sin(K * 0.41) + 0.012 * Math.sin(K * 0.137);
// When the blade passes angle phi going up / coming down.
function passUp(w, phi) {
  const v = clamp01((phi - TH0) / (THMAX - TH0));
  return w[0] + w[1] * Math.acos(1 - 2 * v) / Math.PI;
}
function passDown(w, phi) {
  const v = clamp01(1 - (phi - TH0) / (THMAX - TH0));
  return w[0] + w[1] + w[2] + w[3] * Math.acos(1 - 2 * v) / Math.PI;
}

function drawWiper(g, th, om, load) {
  const buf = g.buf;
  const ux = -Math.cos(th), uy = -Math.sin(th);       // along the blade, outwards
  const nx = Math.sin(th), ny = -Math.cos(th);         // towards increasing angle
  const lead = om >= 0 ? 1 : -1, moving = Math.abs(om) > 0.05;
  const bow = -Math.max(-1, Math.min(1, om / 5)) * 2.2;  // the rubber lags behind
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const qx = x + 0.5 - PX, qy = y + 0.5 - PY;
    const al = qx * ux + qy * uy;
    if (al < 12) continue;
    const u = clamp01((al - 12) / 150);
    const dp = qx * nx + qy * ny - bow * Math.sin(Math.PI * u);
    const k = y * W + x;
    if (dp > -2.2 && dp < 2.2) {
      // the rubber: black, its spine catching the street light
      buf[k] = (dp > -1.0 && dp < 0.9) ? 1 : 0;
      // the clips where the blade's frame holds the rubber
      if (Math.abs(((al - 20) % 34) - 17) < 1.2 && dp > -1.6 && dp < 1.6) buf[k] = 1;
    } else if (moving && load > 0) {
      // the sheet of water piled against the leading edge
      const s = lead * dp - 2.2;
      if (s > 0 && s < 0.6 + load * (1.4 + 1.2 * Math.sin(al * 0.37 + th * 9) + 0.8 * Math.sin(al * 0.13 - th * 5))) buf[k] = 1;
    }
  }
}

// ------------------------------------------------------------ rain on the glass
// The drops of minute `K` landed before local time `T`, replayed with merges.
const NDROP = 40;
function rainOf(K, T, absorb) {
  const out = [];
  for (let i = 0; i < NDROP; i++) {
    const tl = 0.9 + (i + hash(K * 97 + i)) * (58 / NDROP);
    if (tl > T) break;
    const x = 2 + 124 * hash(K * 31 + i * 7 + 1), y = 2 + 56 * hash(K * 53 + i * 11 + 2);
    const r = 1.35 + 1.0 * hash(K * 17 + i * 3 + 5) ** 2;
    if (absorb(x, y, r)) { out.push({ x, y, r: 0, t: tl, run: Infinity }); continue; }
    let merged = false;
    for (const o of out) {
      if (o.r <= 0 || o.run < tl) continue;
      if (Math.hypot(o.x - x, o.y - y) < o.r + r + 0.6) {
        const a1 = o.r * o.r, a2 = r * r;
        o.x = (o.x * a1 + x * a2) / (a1 + a2); o.y = (o.y * a1 + y * a2) / (a1 + a2);
        o.r = Math.sqrt(a1 + a2);
        if (o.r > 2.25) o.run = tl + 0.5 + hash(K + i) * 1.5;
        merged = true;
        out.push({ x, y, r: 0, t: tl, run: Infinity });
        break;
      }
    }
    if (!merged) out.push({ x, y, r, t: tl, run: Infinity });
  }
  return out;
}
// how far a running drop has slid after dt seconds: stick-slip
function runDist(dt) { return 11 * dt + 2.2 * Math.sin(dt * 7.5); }

function drawDrop(g, x, y, r, flare) {
  const buf = g.buf;
  disc(g, x, y, Math.max(r, 1.2) + 1.1, 0);      // a black moat: the drop is in front of the street
  if (r < 1.3) {
    const px = Math.floor(x - 0.5), py = Math.floor(y - 0.5);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const xx = px + i, yy = py + j;
      if (xx >= 0 && xx < W && yy >= 0 && yy < H) buf[yy * W + xx] = 1;
    }
  } else disc(g, x, y, r);
  if (flare > 0.15) streak(g, x, y, r + 2 + 9 * flare);
}

// headlight glare caught in a drop: a thin horizontal streak through it
function streak(g, cx, cy, half) {
  const y = Math.floor(cy);
  if (y < 0 || y >= H) return;
  for (let x = Math.max(0, Math.floor(cx - half)); x <= Math.min(W - 1, Math.floor(cx + half)); x++) g.buf[y * W + x] = 1;
}
function ring(g, cx, cy, r, c = 1) {
  const buf = g.buf, R = r + 1;
  for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(H - 1, Math.floor(cy + R)); y++)
    for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(W - 1, Math.floor(cx + R)); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r;
      if (d > -0.5 && d <= 0.5) buf[y * W + x] = c;
    }
}
function disc(g, cx, cy, r, c = 1) {
  const buf = g.buf, R = r + 1;
  for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(H - 1, Math.floor(cy + R)); y++)
    for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(W - 1, Math.floor(cx + R)); x++)
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) buf[y * W + x] = c;
}

// ------------------------------------------------------------ out beyond the glass
// The bus, from behind: its route sign is the hour, out of focus. `sc` is
// its size (1 = waiting right in front of us).
const BUS_X = 30, BUS_Y = 18, VPX = 30, VPY = 24;
function busSign(g, hour, cx, cy, sc, blink, side = 0) {
  if (sc < 0.12) return;
  // the bus itself: a black body that hides the lamps behind it, one dim
  // edge of street light along its roof and sides
  const bw = 27 * sc, top = cy - 19 * sc, bot = cy + 30 * sc, rr = 6 * sc;
  const buf = g.buf;
  for (let y = Math.max(0, Math.floor(top)); y < Math.min(H, Math.ceil(bot)); y++)
    for (let x = Math.max(0, Math.floor(cx - bw)); x < Math.min(W, Math.ceil(cx + bw)); x++) {
      const qx = Math.abs(x + 0.5 - cx) - (bw - rr), qy = (top + rr) - (y + 0.5);
      const d = (qx > 0 && qy > 0) ? Math.hypot(qx, qy) - rr : Math.max(qx - rr, -(y + 0.5 - top));
      if (d <= 0) buf[y * W + x] = (d > -1 && y + 0.5 - top < 9 * sc + 2) ? 1 : 0;
    }
  // an LED route sign seen out of focus: every LED along the numeral opens
  // into its own bokeh ring, the same rings as the street lamps
  const s = 0.74 * sc, str = String(hour), n = str.length;
  const gap = 21 * sc, br = 2.2 * sc + 0.45, sp = 3.3 * sc + 0.3;
  for (let j = 0; j < n; j++) {
    const d = +str[j];
    const ox = cx + (j - (n - 1) / 2) * gap - 13 * s, oy = cy - 20 * s;
    for (const st of DIGIT[d].strokes) {
      const pts = st.pts, every = Math.max(1, Math.round(sp / (STEP * s)));
      const last = st.closed ? pts.length - every * 0.5 : pts.length;
      for (let i = 0; i < last; i += every) ring(g, ox + pts[i].x * s, oy + pts[i].y * s, br);
    }
  }
  // brake lights, and the indicator
  const ly = cy + 21 * sc, lr = Math.max(1.2, 4.2 * sc);
  ring(g, cx - 19 * sc, ly, lr); ring(g, cx + 19 * sc, ly, lr);
  if (blink) { disc(g, cx + side * 19 * sc, ly, lr); }
}

// The traffic light, a horizontal one, out of focus: green, amber, red
// from left to right. The lit lamp is a glow with a bokeh halo, the others
// faint rings.
function trafficLight(g, ox, oy, lamp) {
  for (let i = 0; i < 3; i++) {
    const x = ox + i * 9, y = oy;
    if (i === lamp) { disc(g, x, y, 2.9); ring(g, x, y, 5.4); }
    else ring(g, x, y, 2.4);
  }
}

// ------------------------------------------------------------ the frame
const PRE_MIN = 0.75, PRE_HOUR = 3.2;
const WIPE_MIN = [[-0.75, 0.6, 0.08, 0.6]];
const WIPE_HOUR = [[-0.95, 0.26, 0.02, 0.26], [-0.4, 0.26, 0.02, 0.26]];   // double speed

function fieldsAt(ms) {
  const d = new Date(ms);
  return { h: d.getHours(), m: d.getMinutes() };
}

function render(g, ctx) {
  const date = ctx.date, now = date.getTime();
  const K0 = Math.floor(now / 60000);
  const sec = (now - K0 * 60000) / 1000;
  const nextF = fieldsAt((K0 + 1) * 60000);
  const pre = nextF.m === 0 ? PRE_HOUR : PRE_MIN;
  // the event: the minute boundary K we are around, tau seconds from it
  let K, tau;
  if (sec >= 60 - pre) { K = K0 + 1; tau = sec - 60; } else { K = K0; tau = sec; }
  const oldF = fieldsAt((K - 1) * 60000), newF = fieldsAt(K * 60000);
  const isHour = newF.m === 0;
  const wipes = isHour ? WIPE_HOUR : WIPE_MIN;
  const lastW = wipes[wipes.length - 1];
  const firstW = wipes[0];

  // the wiper now
  const pOld = parkOf(K - 1), pNew = parkOf(K);
  let th = tau < firstW[0] ? pOld : pNew, om = 0, wi = -1;
  for (let i = 0; i < wipes.length; i++) {
    const w = wipes[i];
    const a = i === 0 ? pOld : pNew;
    if (tau >= w[0] && tau < w[0] + w[1] + w[2] + w[3]) { [th, om] = wipeAngle(w, tau, a, pNew); wi = i; }
  }
  const load = wi >= 0 ? clamp01((tau - wipes[wi][0]) / (wipes[wi][1] * 0.8)) : 0;

  // ---------------- beyond the glass (walks a small square against burn-in)
  const [bx, by] = orbit(date, 2, 3);
  // street lamps, out of focus, shimmering through the wet glass
  const sh = Math.sin(now / 1000 * 1.7) * 0.3;
  ring(g, 66 + sh + bx, 4 + by, 3.4 + sh * 0.4);
  ring(g, 86 - sh + bx, 6 + by, 4.6 - sh * 0.4);

  // the buses
  const idle = 0.25 * Math.sin(now / 1000 * 2 * Math.PI * 1.3);       // engine shudder
  if (isHour && tau < 2) {
    // green: the old bus pulls away into the distance, still readable,
    // and at :00 is gone; the next one cuts in from the left lane, its
    // indicator blinking, and stops in front of us
    const u = clamp01((tau + 3) / 3), so = 1 / (1 + 0.75 * u * u * (3 - 2 * u)) * (1 - smooth((tau + 0.3) / 0.3));
    if (so > 0.12) busSign(g, oldF.h, VPX + (BUS_X - VPX) * so + bx, VPY + (BUS_Y - VPY) * so + by + idle * (1 - u), so, false, 0);
    if (tau >= 0) {
      const cut = smooth(tau / 1.3), sn = 1.1 - 0.1 * cut;
      const blink = tau < 1.9 && Math.floor((tau + 10) * 2.6) % 2 === 0;
      busSign(g, newF.h, BUS_X - 46 * (1 - cut) ** 1.3 + bx, BUS_Y + 1.5 * (1 - cut) + idle * cut + by, sn, blink, 1);
    }
  } else {
    busSign(g, newF.h, BUS_X + bx, BUS_Y + idle + by, 1, false, 0);
  }

  // an oncoming car on the hour: its headlights sweep past behind the glass
  if (isHour && tau > -3.0 && tau < -1.0) {
    const hx = 150 - 200 * (tau + 3.0) / 2.0;
    ring(g, hx, 47, 8.5); ring(g, hx + 30, 47, 8.5);
    disc(g, hx, 47, 3.2); disc(g, hx + 30, 47, 3.2);
  }

  // the traffic light: green from 3 s before the hour, amber, red again
  let lamp = 2;
  if (isHour) {
    if (tau > -3.0 && tau < 1.2) lamp = 0;
    else if (tau >= 1.2 && tau < 2.6) lamp = 1;
  }
  trafficLight(g, 104 + bx, 7 + by, lamp);

  // ---------------- on the glass
  clearBuf(SD); CEN.length = 0;
  const slots = [62, 94], baseY = 17;
  const offOf = (k) => [Math.round((hash(k * 3.1) - 0.5) * 4), Math.round((hash(k * 7.7) - 0.5) * 3)];
  const swell = 0.35 * clamp01(tau / 60);
  const hanging = [];
  // old numerals (before the wipe takes them)
  if (tau < firstW[0] + firstW[1] + 0.05) {
    const [ox, oy] = offOf(K - 1);
    const gone = (x, y) => tau > passUp(firstW, phiOf(x, y));
    const mm = String(oldF.m).padStart(2, '0');
    for (let j = 0; j < 2; j++) waterDigit(+mm[j], slots[j] + ox, baseY + oy, 0.35, null, gone);
  }
  // new numerals, rebuilt by the rain behind the last stroke
  if (tau > lastW[0] + lastW[1]) {
    const [ox, oy] = offOf(K);
    const born = (x, y, h) => Math.min(tau, tau - passDown(lastW, phiOf(x, y)) - 0.05) - h * 0.35;
    const mm = String(newF.m).padStart(2, '0');
    for (let j = 0; j < 2; j++) {
      const drops = waterDigit(+mm[j], slots[j] + ox, baseY + oy, swell, born, null);
      for (const dr of drops) hanging.push({ x: slots[j] + ox + dr.x, y: baseY + oy + dr.y, r: dr.r });
    }
  }
  // the drop hanging from a stroke's lowest end grows, and once a minute lets go
  hanging.forEach((dr, i) => {
    const age = tau - passDown(lastW, phiOf(dr.x, dr.y)) - 0.6;
    if (age < 0) return;
    const rel = 30 + 14 * hash(K * 2.9 + i);
    let r = dr.r * smooth(age / 1.2) + 0.5 * clamp01((tau - 1) / 30);
    if (tau > rel) {
      const dt = tau - rel, y = dr.y + 1 + runDist(dt);
      if (y < 70) { stamp(SD, dr.x, y, Math.max(1.6, r - 0.4), 1.6); }
      const re = smooth((dt - 2) / 6);                   // and grows back
      if (re > 0) stamp(SD, dr.x, dr.y, dr.r * re, 1.6);
      return;
    }
    const y = dr.y + 0.6 * (r - dr.r);
    stamp(SD, dr.x, y, r, 1.6);
    if (r > 2.4) CEN.push(dr.x, y, r);
  });

  // flare: the overtaking bus's headlights light every drop on the glass
  const fx = 150 - 200 * (tau + 3.0) / 2.0 + 15;
  const flareAt = (x) => (isHour && tau > -3.0 && tau < -1.0) ? clamp01(1 - Math.abs(x - fx) / 26) : 0;

  // rain: last minute's drops until the wipe, this minute's after it
  const absorbAt = (x, y, r) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    return xi >= 0 && xi < W && yi >= 0 && yi < H && SD[yi * W + xi] < r + 0.8;
  };
  const sets = [];
  if (tau < firstW[0] + firstW[1] + 0.05) sets.push({ K: K - 1, T: tau + 60, gone: (x, y) => tau > passUp(firstW, phiOf(x, y)) });
  if (tau > 0) sets.push({ K, T: tau, gone: null });
  paintSD(g);
  for (const st of sets) {
    const drops = rainOf(st.K, st.T, absorbAt);
    for (const o of drops) {
      const age = st.T - o.t;
      if (age < 0.2 && !(st.gone && st.gone(o.x, o.y))) ring(g, o.x, o.y, 1.5 + 3 * age / 0.2, 1);   // the splash
      if (o.r <= 0) continue;
      let x = o.x, y = o.y;
      const r = o.r;
      if (st.T > o.run) {
        const dy = runDist(st.T - o.run);
        // it runs until it meets a numeral, which drinks it
        let hit = false;
        for (let yy = o.y; yy < o.y + dy; yy += 1) if (absorbAt(x, yy + r, 0.2)) { hit = true; break; }
        if (hit) continue;
        y += dy;
        if (y - r > H) continue;
      }
      if (st.gone && st.gone(x, y)) continue;
      drawDrop(g, x, y, r, flareAt(x));
      if (st.T > o.run && y - o.y > 3) drawDrop(g, x, y - r - 0.8, Math.min(1, r * 0.5), 0);
      if (r > 2.4) glint(g, x, y, r);
    }
  }
  for (let i = 0; i < CEN.length; i += 3) glint(g, CEN[i], CEN[i + 1], CEN[i + 2]);
  for (let i = 0; i < CEN.length; i += 3) {
    const f = flareAt(CEN[i]);
    if (f > 0.2 && (i / 3) % 3 === 0) streak(g, CEN[i], CEN[i + 1], CEN[i + 2] + 2 + 10 * f);
  }

  // ---------------- the wiper, on top of it all
  drawWiper(g, th, om, load);
}

function specimen(g, t) {
  const page = ((Math.floor(t || 0) % 3) + 3) % 3;
  clearBuf(SD); CEN.length = 0;
  for (let j = 0; j < 4; j++) {
    const d = page * 4 + j; if (d > 9) break;
    waterDigit(d, 2 + j * 32, 12, 0.2, null, null);
  }
  paintSD(g);
  for (let i = 0; i < CEN.length; i += 3) glint(g, CEN[i], CEN[i + 1], CEN[i + 2]);
}

export default {
  name: 'Wiper',
  blurb: 'Stuck at a red light in the rain at night: the hour is the route number of the bus ahead, blurred into bokeh, the minutes are rain run together into beaded water on the windshield; the intermittent wiper sweeps them away each minute and the rain rebuilds the next; on the hour the light goes green, the bus leaves, and the next one cuts in.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  frame(g, ctx) {
    if (SPECIMEN) return specimen(g, ctx.t);
    render(g, ctx);
    const DAY = 0xcf, NIGHT_LEVEL = 0x20;
    ctx.oled.contrast(Math.round(DAY + (NIGHT_LEVEL - DAY) * ctx.night));
  },
};
