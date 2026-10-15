// Slalom: a ski slope at blue hour, seen from above. The time is carved into
// the snow as ski tracks, and skiers only go downhill: every numeral is made
// of downhill runs on the lattice's three downhill lines (schuss, and a
// traverse either way), so a 0 is two skiers splitting at the top and
// meeting at the bottom, a 5 is three skiers, a 1 one straight schuss.
//
// The slope is the parallelogram's own frame: its 30-degree rows are
// traverses across the fall line, its columns are the fall line. Hours sit
// up the slope, minutes below, each pair stepping down it. Old tracks sink
// to deep blue; the minute's are still white.
//
// Minute: a piste basher climbs through the changed digit blade first,
// swallowing the old track, and backs away as a skier drops in behind it
// and carves the new one. Hour: the slab breaks along the ridge, a powder
// avalanche buries the slope, and a ski school follows it down in lines,
// writing the whole new time. Between: a slalom racer down the gates, a
// skier re-riding an old track, the chairlift, glints, flakes.
//
// Stateless: everything is a function of the wall clock.
import * as kit from '../js/kit.js';

// ------------------------------------------------------------- geometry
// Slope coordinates: u = column 0..14 (gx), v = row 0..15 down the column.
// Rows of constant v are 30-degree lattice lines; that's a traverse.
const DX = 2 * Math.sqrt(3);
const W = (u, v) => [(u - 7) * DX, -60 + 2 * u + 4 * v];
const SLOTS = [{ u: 1, v: 1 }, { u: 9, v: 1 }, { u: 1, v: 9 }, { u: 9, v: 9 }];

// Numerals as downhill tracks, in slot-local u 0..4, v 0..6. A skier can
// only go downhill, which on this lattice leaves three straight moves:
//   R (1, 0)   traverse right, 30 degrees down the slope
//   D (0, 1)   schuss straight down the fall line
//   L (-1, 1)  traverse left, 30 degrees down the other way
// Every stroke is a chain of those, so a numeral that needs an uphill
// stroke is split between skiers who drop in at different points. The
// corners are carved turns (rounded), not drawn joins.
const GLYPHS = {
  0: [[[1, 0], [0, 1], [0, 6], [3, 6]], [[1, 0], [4, 0], [4, 5], [3, 6]]],
  1: [[[2, 0], [2, 6]]],                                   // a straight schuss
  2: [[[0, 0], [4, 0], [4, 2], [0, 6], [4, 6]]],
  3: [[[0, 0], [4, 0], [4, 5], [3, 6]], [[1, 3], [4, 3]], [[0, 6], [3, 6]]],
  4: [[[3, 0], [0, 3], [0, 4], [4, 4]], [[3, 0], [3, 6]]],
  5: [[[0, 0], [4, 0]], [[0, 0], [0, 3], [4, 3], [4, 5], [3, 6]], [[0, 6], [3, 6]]],
  6: [[[1, 0], [0, 1], [0, 6], [3, 6]], [[1, 0], [4, 0]], [[0, 3], [4, 3], [4, 5], [3, 6]]],
  7: [[[0, 0], [4, 0], [4, 1], [2, 3], [2, 6]]],
  8: [[[1, 0], [0, 1], [0, 6], [3, 6]], [[1, 0], [4, 0], [4, 5], [3, 6]], [[0, 3], [4, 3]]],
  9: [[[1, 0], [0, 1], [0, 3], [4, 3]], [[1, 0], [4, 0], [4, 5], [3, 6]], [[0, 6], [3, 6]]],
};

const FILLET = 0.42;   // turn radius at corners, in lattice steps
/** A uv polyline with carved (rounded) corners, sampled to world mm. */
function sampleTrack(pts, slot) {
  const uv = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) {
    const a = pts[k - 1], p = pts[k], b = pts[k + 1];
    const la = Math.hypot(p[0] - a[0], p[1] - a[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const r = Math.min(FILLET, la / 2, lb / 2);
    const p0 = [p[0] - (p[0] - a[0]) * r / la, p[1] - (p[1] - a[1]) * r / la];
    const p1 = [p[0] + (b[0] - p[0]) * r / lb, p[1] + (b[1] - p[1]) * r / lb];
    for (let j = 0; j <= 6; j++) {
      const t = j / 6, w0 = (1 - t) ** 2, w1 = 2 * t * (1 - t), w2 = t * t;
      uv.push([w0 * p0[0] + w1 * p[0] + w2 * p1[0], w0 * p0[1] + w1 * p[1] + w2 * p1[1]]);
    }
  }
  uv.push(pts[pts.length - 1]);
  // subdivide long straight runs so arc length lookups stay fine-grained
  const fine = [uv[0]];
  for (let k = 1; k < uv.length; k++) {
    const a = uv[k - 1], b = uv[k], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.34));
    for (let j = 1; j <= n; j++) fine.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]);
  }
  return polyline(fine.map(([u, v]) => W(slot.u + u, slot.v + v)));
}

function polyline(xy) {
  const s = [0];
  for (let k = 1; k < xy.length; k++) s.push(s[k - 1] + Math.hypot(xy[k][0] - xy[k - 1][0], xy[k][1] - xy[k - 1][1]));
  return { xy, s, len: s[s.length - 1] };
}

/** Position and unit tangent at arc length s (clamped). */
function posAt(P, s) {
  const { xy, s: S } = P;
  if (s <= 0) { const d = dir(xy[0], xy[1]); return [xy[0][0] + d[0] * s, xy[0][1] + d[1] * s, d[0], d[1]]; }
  if (s >= P.len) { const n = xy.length, d = dir(xy[n - 2], xy[n - 1]); const e = s - P.len; return [xy[n - 1][0] + d[0] * e, xy[n - 1][1] + d[1] * e, d[0], d[1]]; }
  let k = 1;
  while (S[k] < s) k++;
  const f = (s - S[k - 1]) / (S[k] - S[k - 1] || 1), a = xy[k - 1], b = xy[k], d = dir(a, b);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, d[0], d[1]];
}
const dir = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; };

const REACH = 2.5;
const glyphCache = new Map();
/** For slot/digit: the tracks, and per track the LEDs near it with distance and arc length. */
function glyph(ctx, si, d) {
  const key = si * 10 + d;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const slot = SLOTS[si];
  const tracks = GLYPHS[d].map((pts) => {
    const P = sampleTrack(pts, slot);
    const best = new Map();
    for (let k = 0; k + 1 < P.xy.length; k++) {
      const [ax, ay] = P.xy[k], [bx, by] = P.xy[k + 1];
      for (const i of ctx.layout.index.near((ax + bx) / 2, (ay + by) / 2, Math.hypot(bx - ax, by - ay) / 2 + REACH)) {
        const l = ctx.leds[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
        const t = L2 ? kit.clamp(((l.x - ax) * dx + (l.y - ay) * dy) / L2) : 0;
        const dd = Math.hypot(l.x - ax - t * dx, l.y - ay - t * dy);
        if (dd < REACH && !(best.get(i)?.d <= dd)) best.set(i, { i, d: dd, s: P.s[k] + t * Math.sqrt(L2) });
      }
    }
    P.near = [...best.values()].map((e) => ({ ...e, cov: 1 - kit.smoothstep(0.8, REACH, e.d) }));
    return P;
  });
  const g = { tracks, slot };
  glyphCache.set(key, g);
  return g;
}

// --------------------------------------------------------------- palette
// Blue hour: the sun has just gone behind the ridge at the top left, the
// snow is deep blue, the last light catches the fresh-cut edges of tracks.
const SNOW = [0, 0.008, 0.03], GLOW = kit.hex('#5a2438');      // snow: linear, blue only, ~5/255
const ICE_NEW = kit.hex('#d8ecff'), ICE_OLD = kit.hex('#4a80ea'), WHITE = [1, 1, 1];
const PINE = kit.hex('#11703a'), GATE_RED = kit.hex('#ff2010'), GATE_BLUE = kit.hex('#1a3cff');
const SUN = kit.blackbody(2000);
const JACKET = kit.hex('#ff2a10'), SCARF = kit.hex('#ffb400'), SUIT = kit.hex('#ffd000');
const KIDS = [kit.hex('#ff2a10'), kit.hex('#ffc400'), kit.hex('#ff7000')];
const CAB = kit.hex('#ff3c00'), BEACON = kit.hex('#ff9800'), LAMP = kit.blackbody(3800);

const SPEED = 52;                 // mm/s: a carving skier, about 11 LEDs a second
const LINE = 0.17;                // s between skiers following one track (ski school)
const MARGIN_U = [0, 7, 0, 7];    // the column a skier comes down from the top to reach its start
const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => (pad(d.getHours()) + pad(d.getMinutes())).split('').map(Number);

/** Slope coordinates of every LED. */
let UV = null;
function uvOf(ctx) {
  if (UV?.n === ctx.n) return UV;
  UV = { n: ctx.n, u: new Float32Array(ctx.n), v: new Float32Array(ctx.n) };
  for (const l of ctx.leds) { UV.u[l.i] = l.gx; UV.v[l.i] = Math.round((l.y + 60 - 2 * l.gx) / 4); }
  return UV;
}

/** Arc length a skier has covered tau seconds after dropping in (eased start). */
const sOf = (tau) => (tau <= 0 ? 0 : SPEED * (tau - 0.12 * (1 - Math.exp(-tau / 0.12))));

const routeCache = new Map();
/** One skier's whole path for track k of digit d in slot si: lead-in, the track, and for
 *  minute digits a run-out off the bottom edge. */
function route(ctx, si, d, k) {
  const key = (si * 10 + d) * 8 + k;
  if (routeCache.has(key)) return routeCache.get(key);
  const slot = SLOTS[si], pts = GLYPHS[d][k], T = glyph(ctx, si, d).tracks[k];
  const su = slot.u + pts[0][0], sv = slot.v + pts[0][1];
  const leadUV = si < 2 && pts[0][1] === 0 ? [[su, sv - 3.4], [su, sv]]
    : [[MARGIN_U[si], -1.6], [MARGIN_U[si], sv - 0.7], [su, sv]];
  const lead = sampleTrack(leadUV, { u: 0, v: 0 });
  const xy = [...lead.xy, ...T.xy.slice(1)];
  if (si >= 2) {
    const n = T.xy.length, e = T.xy[n - 1], t = dir(T.xy[n - 2], e), a = [e[0] + t[0] * 2.5, e[1] + t[1] * 2.5];
    xy.push(a, [a[0] + t[0] * 1.5, a[1] + 4], [a[0] + t[0] * 1.5, a[1] + 24]);
  }
  const R = { ...polyline(xy), lead: lead.len, tlen: T.len, exit: si >= 2 };
  routeCache.set(key, R);
  return R;
}
/** Turn sharpness at arc length s: signed sine of the heading change over 4 mm. */
function turnAt(R, s) {
  const a = posAt(R, s - 2), b = posAt(R, s + 2);
  return a[2] * b[3] - a[3] * b[2];
}

/**
 * A skier tau seconds after dropping in on route R. Head (a cold lamp-lit
 * helmet), jacket, a scarf that flutters behind, and spray thrown to the
 * outside of every turn. Top-row (hour) skiers end in a hockey stop and sit
 * down out of sight in their own spray; minute skiers run off the bottom.
 */
function drawSkier(ctx, R, tau, jacket, a, spray = true) {
  if (tau <= 0 || a <= 0) return;
  tau *= R.speed ?? 1;
  let s = sOf(tau), fade = kit.smoothstep(0, 0.2, tau), stop = -1;
  if (!R.exit && s > R.len) {
    stop = tau - (R.len / SPEED + 0.12);
    s = R.len + 3 * (1 - Math.exp(-Math.max(0, stop) / 0.1));
    fade *= 1 - kit.smoothstep(0.1, 0.4, stop);
  }
  if (fade <= 0.001) return;
  const [x, y, tx, ty] = posAt(R, s), nx = -ty, ny = tx, k = a * fade;
  const w = 0.9 * Math.sin(tau * 11);
  kit.splat(ctx, x - tx * 4.6 + nx * w, y - ty * 4.6 + ny * w, 2.8, SCARF, 0.32 * k);
  kit.splat(ctx, x - tx * 1.2, y - ty * 1.2, 3.2, jacket, 0.6 * k);
  kit.splat(ctx, x + tx * 1.2, y + ty * 1.2, 2.7, WHITE, 0.42 * k);
  if (!spray) return;
  for (let j = 1; j <= 6; j++) {
    const te = tau - j * 0.05;
    if (te <= 0) break;
    const age = tau - te;
    let se = sOf(te), amt;
    if (!R.exit && se > R.len) { se = R.len; amt = 0.25; } else amt = 0.15 + Math.min(1, Math.abs(turnAt(R, se)) * 2.5);
    const [px, py, qx, qy] = posAt(R, se), turn = turnAt(R, se), side = turn > 0 ? -1 : 1;
    const ox = -qy * side, oy = qx * side, sp = 26 + 14 * kit.hash(j, Math.floor(te * 20));
    const f = amt * (1 - age / 0.32) ** 2;
    if (f > 0) kit.splat(ctx, px + ox * sp * age - qx * 5 * age, py + oy * sp * age - qy * 5 * age, 2.6, ICE_NEW, 0.32 * f * k);
  }
}
// ------------------------------------------------------- the piste basher
// It climbs up through a changed minute digit blade first, swallowing the
// old track into its berm, lifts the blade at the top, and backs away down
// the slope with the new skier dropping in right behind it.
const CLIMB = 0.9, LIFT = 1.05, BACK = 0.75;
function bladeAt(age) {
  if (age < CLIMB) return kit.lerp(8.8, -0.7, kit.ease.inOut(age / CLIMB));
  if (age < LIFT) return -0.7;
  return kit.lerp(-0.7, 9.6, kit.ease.inOut(kit.clamp((age - LIFT) / BACK)));
}

function drawGroomer(ctx, U, si, age, now, a) {
  const slot = SLOTS[si], vb = bladeAt(age), up = age > CLIMB, eaten = kit.clamp((8.8 - vb) / 9.5);
  for (let i = 0; i < ctx.n; i++) {
    const lu = U.u[i] - slot.u, lv = U.v[i] - slot.v;
    if (lu < -1 || lu > 5) continue;
    const across = kit.smoothstep(-1, -0.45, lu) * (1 - kit.smoothstep(4.45, 5, lu));
    // corduroy from the tiller: fall-line stripes, every other column
    const top = up ? -0.4 : vb + 2.9;
    if (lu >= 0 && lu <= 4 && lv >= top && lv <= 6.4) kit.add(ctx, i, ICE_OLD, a * 0.06 * (lu % 2 ? 0.3 : 1) * Math.exp(-age / 20));
    // the berm it leaves where the blade lifted
    if (up && lv < -0.3 && lv > -1.6 && lu >= -0.4 && lu <= 4.4) kit.add(ctx, i, ICE_NEW, a * 0.22 * Math.exp(-(age - CLIMB) / 1.4));
    if (age > LIFT + BACK) continue;
    const r = lv - vb;
    if (across <= 0 || r < -4 || r > 3.6) continue;
    if (r < 0) kit.add(ctx, i, LAMP, a * 0.07 * (1 + r / 4) * across);                // headlight wash
    const blade = 1 - kit.smoothstep(0.2, 0.7, Math.abs(r));
    kit.add(ctx, i, ICE_NEW, a * blade * across * (up ? 0.1 : 0.2 + 0.32 * eaten));   // blade and berm
    // body, seen from above: cab in the middle, a crawler track down each side
    // whose treads roll as it moves, the tiller drum across the back
    const body = kit.smoothstep(0.45, 0.9, r) * (1 - kit.smoothstep(2.4, 2.9, r));
    const side = Math.abs(lu - 2) > 1.5;
    if (side) kit.add(ctx, i, ICE_OLD, a * body * across * 0.05 * (0.4 + 0.6 * Math.max(0, Math.sin((r + vb) * Math.PI * 1.5)) ** 2));
    else kit.add(ctx, i, CAB, a * 0.24 * body);
    const tiller = 1 - kit.smoothstep(0.1, 0.4, Math.abs(r - 3.15));
    kit.add(ctx, i, ICE_OLD, a * 0.09 * tiller * across);
  }
  if (age > LIFT + BACK) return;
  for (const lu of [0.2, 3.8]) { const [x, y] = W(slot.u + lu, slot.v + vb + 0.6); kit.splat(ctx, x, y, 2.8, LAMP, a * 0.5); }
  const [bx, by] = W(slot.u + 2, slot.v + vb + 1.6), fl = Math.max(0, Math.sin(now * kit.TAU * 1.6)) ** 6;
  kit.splat(ctx, bx, by, 3.4, BEACON, a * (0.12 + 0.75 * fl));
}

// ----------------------------------------------------------- the avalanche
// The slab breaks along the top edge and a powder cloud pours down the fall
// line, front first, burying every track; it settles as the ski school
// follows it down and writes the new hour.
function frontY(x, a) {
  const p = kit.clamp((a - 0.12) / 0.95);
  return -68 + 106 * p ** 1.45 + 7 * (kit.noise2(x * 0.08, 5.3) - 0.5) + 2.5 * Math.sin(x * 0.3 + a * 5);
}
function drawAvalanche(ctx, U, age, a) {
  const settle = age < 1.0 ? 1 : Math.exp(-(age - 1.0) / 0.4);
  const POWDER = kit.mix(ICE_NEW, WHITE, 0.4);
  for (const l of ctx.leds) {
    if (age < 0.4 && U.v[l.i] <= 0) kit.add(ctx, l.i, WHITE, a * 0.45 * (1 - age / 0.4) * (0.4 + 0.6 * kit.hash(l.i, Math.floor(age * 30))));
    const dy = frontY(l.x, age) - l.y;
    if (dy < -4) continue;
    const head = Math.exp(-((dy - 1.5) ** 2) / 14), body = dy > 0 ? Math.exp(-dy / 26) : 0;
    const turb = 0.12 + 1.1 * kit.smoothstep(0.3, 0.75, kit.fbm(l.x * 0.13, dy * 0.12, age * 1.6, 2));
    kit.add(ctx, l.i, POWDER, a * 0.5 * (0.9 * head + 0.4 * body) * turb * settle);
  }
  // snowballs tumbling out ahead of the front
  if (age < 1.1) for (let j = 0; j < 5; j++) {
    const x = -22 + j * 11 + 3 * kit.hash(j, 3), y = frontY(x, age) + 3 + 4 * kit.hash(j, 4) + 2 * Math.sin(age * 9 + j);
    kit.splat(ctx, x, y, 3, WHITE, a * 0.35);
  }
}

// ------------------------------------------------------------- the world
// Pines along both edges and one in the hollow of every 0 (the two skiers
// of a 0 split round it); slalom gates down the corridor between the digits.
const PINES = [[0, 3], [0, 5], [0, 6], [0, 11], [0, 13], [0, 15]];
// The chairlift up the right edge: chairs glide up column 14, riders in bright jackets.
const LIFT_RATE = 0.5, LIFT_GAP = 5, LIFT_CHAIRS = 4;     // rows/s, rows apart
const RIDERS = [kit.hex('#ff2a10'), kit.hex('#ffc400'), kit.hex('#ff7000'), kit.hex('#ff4aa0')];
const GATES = [[6, 1, GATE_RED], [8, 3, GATE_BLUE], [6, 6, GATE_RED], [8, 8, GATE_BLUE], [6, 11, GATE_RED], [8, 13, GATE_BLUE]];

/** Smooth Catmull-Rom through uv points, to a world polyline. */
function spline(pts) {
  const out = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const p0 = pts[k - 1] ?? pts[k], p1 = pts[k], p2 = pts[k + 1], p3 = pts[k + 2] ?? pts[k + 1];
    for (let j = 0; j < 10; j++) {
      const t = j / 10, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push(W(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])));
    }
  }
  out.push(W(...pts[pts.length - 1]));
  return polyline(out);
}
// The racer's line: round each gate on alternate sides, down the corridor.
const RACE = { ...spline([[7, -2.5], [6.45, 1.3], [7.55, 3.3], [6.45, 6.3], [7.55, 8.3], [6.45, 11.3], [7.55, 13.3], [7, 17], [7, 22]]), lead: 0, exit: true, speed: 1.6 };
const RACES = [6, 26, 46];          // seconds into the minute a racer starts
const RIDES = [[15, 0], [34, 2], [51, 1]];   // [second, slot]: a skier re-rides an existing digit

/** How old a slot's tracks are, 0 (just carved) .. 1 (an hour): old tracks sink to deep blue. */
function toneOf(si, now, date) {
  const M = Math.floor(now / 60) * 60, min = date.getMinutes();
  const start = si < 2 ? M - min * 60 : si === 2 ? M - (min % 10) * 60 : M;
  return kit.clamp(Math.log1p(Math.max(0, now - start - 2) / 15) / Math.log1p(240));
}
const ledAt = (ctx, u, v) => ctx.layout.index.at(...W(u, v));
export default {
  name: 'Slalom', blurb: 'the time carved as downhill ski tracks; a piste basher grooms the minute away, an avalanche takes the hour',
  layouts: ['tri-pair'], look: { look: 'opal', gap: 1.5 }, fps: 60, brightness: 0.6, dither: true,
  frame(ctx) {
    const U = uvOf(ctx), n = ctx.n, leds = ctx.leds;
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, age = now - M;
    const cur = digitsOf(ctx.date), prev = digitsOf(new Date((M - 60) * 1000));
    const hourTurn = cur[0] !== prev[0] || cur[1] !== prev[1];
    const dim = 1 - 0.7 * ctx.night, sun = 1 - ctx.night;

    // blue-hour snow, wind drifting over it, alpenglow from the sunset corner
    for (const l of leds) {
      const drift = 0.45 + 1.1 * kit.noise2(l.x * 0.06 + now * 0.05, l.y * 0.05 - now * 0.02);
      const glow = Math.exp(-((l.x + 30) ** 2 + (l.y + 66) ** 2) / (2 * 18 * 18)) * sun;
      kit.set(ctx, l.i, SNOW, dim * drift);
      kit.add(ctx, l.i, GLOW, dim * 0.4 * glow);
    }

    // ---- tracks: lum (coverage), tone (age), fresh (just-cut sparkle)
    const lum = new Float32Array(n), fresh = new Float32Array(n), tone = new Float32Array(n), shine = new Float32Array(n);
    const actors = [], groomers = [];
    const stamp = (si, d, tn, fn) => glyph(ctx, si, d).tracks.forEach((P, k) => {
      for (const e of P.near) {
        const [vis, fr] = fn ? fn(k, e) : [1, 0], c = e.cov * vis;
        if (c > lum[e.i]) { lum[e.i] = c; tone[e.i] = tn; }
        if (fr * e.cov > fresh[e.i]) fresh[e.i] = fr * e.cov;
        // light running down every groove: each stroke flows the way it was skied
        const sh = c * Math.max(0, Math.sin(e.s * 0.22 - now * 2.4 + k * 1.7 + si * 2.3)) ** 8;
        if (sh > shine[e.i]) shine[e.i] = sh;
      }
    });
    // skiers reach the start of their tracks at t0 (s into the minute), one line per track
    const run = (si, d, t0, line, colours, tn, carving) => {
      const Rs = GLYPHS[d].map((_, k) => route(ctx, si, d, k));
      const go = Rs.map((R, k) => t0 + 0.12 * k - R.lead / SPEED - 0.12);
      const tip = Rs.map((R, k) => sOf(age - go[k]) - R.lead);
      stamp(si, d, tn, (k, e) => {
        const ds = tip[k] - e.s, vis = carving ? kit.clamp((ds + 1) / 2) : 1;
        return [vis, ds > -1 ? (carving ? 1 : 0.7) * Math.exp(-Math.max(0, ds) / (carving ? 14 : 10)) : 0];
      });
      Rs.forEach((R, k) => { for (let j = 0; j < line; j++) actors.push([R, age - go[k] - j * LINE, colours[j % colours.length], j === 0]); });
    };
    for (let si = 0; si < 4; si++) {
      const d = cur[si], p = prev[si], tn = toneOf(si, now, ctx.date);
      if (hourTurn && age < 5) {
        if (age < 1.3) stamp(si, p, 1, (k, e) => [1 - kit.smoothstep(-1.5, 1.5, frontY(leds[e.i].x, age) - leds[e.i].y), 0]);
        run(si, d, si < 2 ? 0.75 : 1.15, si < 2 ? 3 : 2, KIDS, tn, true);
      } else if (!hourTurn && d !== p && age < 5) {
        const vb = bladeAt(age), v0 = SLOTS[si].v;
        if (age < CLIMB) stamp(si, p, 0.6, (k, e) => [kit.clamp((vb - (U.v[e.i] - v0)) / 0.6), 0]);
        run(si, d, CLIMB + 0.2 + (si === 2 ? 0.1 : 0), 1, [JACKET], tn, true);
        groomers.push(si);
      } else {
        const ride = RIDES.find(([s, sl]) => sl === si && age >= s - 1.2 && age < s + 3.5);
        if (ride) run(si, d, ride[0], 1, [KIDS[Math.floor(kit.hash(M, si) * 3)]], tn, false);
        else stamp(si, d, tn);
      }
    }
    for (let i = 0; i < n; i++) {
      if (lum[i] > 0) {
        const t = tone[i];
        kit.add(ctx, i, kit.mix(ICE_NEW, ICE_OLD, t ** 0.7), dim * lum[i] * (0.5 - 0.16 * t));
      }
      if (fresh[i] > 0) kit.add(ctx, i, WHITE, dim * 0.4 * fresh[i]);
      if (shine[i] > 0) kit.add(ctx, i, ICE_NEW, dim * 0.14 * shine[i]);
      // glints: crystals in the untouched powder catching the last light
      if (lum[i] < 0.3 && kit.hash(i, 7) < 0.4) {
        const g = Math.max(0, Math.sin(now * (0.5 + kit.hash(i, 9)) + kit.hash(i, 8) * 40)) ** 40;
        if (g > 0.01) kit.add(ctx, i, ICE_NEW, dim * 0.22 * g);
      }
    }

    // the sun just under the ridge, top left
    const [sx, sy] = W(-0.9, -1.1);
    kit.splat(ctx, sx, sy, 8.5, SUN, 0.9 * sun * dim);

    // racer: through the gates, which flex as they are clipped
    const race = RACES.map((s) => age - s).find((tau) => tau > 0 && tau < 3);
    const rp = race !== undefined ? posAt(RACE, sOf(race * 1.6)) : null;
    for (const [u, v] of PINES) kit.add(ctx, ledAt(ctx, u, v), PINE, 0.32 * dim);
    for (const [u, v, c] of GATES) {
      const i = ledAt(ctx, u, v), l = leds[i];
      const hit = rp ? Math.exp(-((l.x - rp[0]) ** 2 + (l.y - rp[1]) ** 2) / 12) : 0;
      kit.add(ctx, i, c, dim * (0.2 + 0.5 * hit));
    }

    // chairlift: a faint cable, chairs climbing it
    for (let v = 0; v < 16; v++) kit.add(ctx, ledAt(ctx, 14, v), ICE_OLD, 0.03 * dim);
    for (let k = 0; k < LIFT_CHAIRS; k++) {
      const q = now * LIFT_RATE + k * LIFT_GAP, v = 17 - (q % (LIFT_CHAIRS * LIFT_GAP)), id = Math.floor(q / (LIFT_CHAIRS * LIFT_GAP)) * LIFT_CHAIRS + k;
      const [x, y] = W(14, v), sway = 0.4 * Math.sin(now * 1.3 + k);
      kit.splat(ctx, x + sway, y, 3, RIDERS[Math.floor(kit.hash(id, 11) * 4)], 0.3 * dim);
      kit.splat(ctx, x + sway, y - 2.2, 2.2, WHITE, 0.12 * dim);
    }
    // a few flakes drifting across
    for (let j = 0; j < 6; j++) {
      const P = 7, q = now + j * P / 6, b = Math.floor(q / P), fa = q - b * P;
      const x = -28 + 56 * kit.hash(b, j, 1) - 1.6 * fa + 1.5 * Math.sin(fa * 1.7 + j);
      const y = -62 + 92 * kit.hash(b, j, 2) + 2.6 * fa;
      kit.splat(ctx, x, y, 2.6, ICE_NEW, 0.12 * Math.sin(Math.PI * fa / P) * dim);
    }

    if (hourTurn && age < 3.5) drawAvalanche(ctx, U, age, dim);
    for (const si of groomers) drawGroomer(ctx, U, si, age, now, dim);
    for (const [R, tau, c, lead] of actors) drawSkier(ctx, R, tau, c, dim, lead);
    if (race !== undefined) drawSkier(ctx, RACE, race, SUIT, dim);
  },
};
