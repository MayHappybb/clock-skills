// The Otis: a ten-storey apartment house in cross-section, floors 0-9. Four
// lift shafts run up through it, one per digit (hour tens, hour units,
// minute tens, minute units). Each car parks at the floor of its digit and
// lights that floor's brass number on the landing, so the time is read as
// four lit floor numbers at four heights against the dim scale painted up
// every landing. Minute turn: the car rides to its new floor on a
// jerk-limited S-curve, counterweight crossing it the other way, levels,
// bounces on its ropes, doors open with a ding. 9 to 0 is the express drop.
// Hour: a light wave runs up the building, a party on the roof, fireworks
// over the water tower. Residents live between: the frog cooks, the cat
// watches TV, someone sleeps, lights go on and off with the real time of
// day, and the sky over the roof follows the sun.
import * as kit from '../js/kit.js';
import * as G from './elevators-gfx.js';
import { drawSide } from './elevators-side.js';
import { drawRooms, drawLobby, drawStreet, drawSky, drawRoof, ROOMS_X0, ROOMS_X1 } from './elevators-scene.js';

const { W, H, img } = G;
const C = kit.hex;

// ------------------------------------------------------------- geometry
export const FLOOR_H = 15, Y_TOP = 30;              // floor 9 starts at y 30; floor 0 ends at 180
export const floorTop = (f) => Y_TOP + (9 - f) * FLOOR_H;
// four units: numeral landing (9 px) beside its shaft (12 px)
export const SHAFT_X = [11, 23, 93, 105];
export const NUM_X = [2, 35, 84, 117];
// the hour-tens lift only needs floors 0-2, the minute-tens 0-5: their shafts stop short
export const SHAFT_TOP = [2, 9, 5, 9];
const carXOf = (s) => (s === 0 || s === 2 ? SHAFT_X[s] + 1 : SHAFT_X[s] + 3);

// ------------------------------------------------------------- palette
const AMBER = [1.0, 0.36, 0.035], AMBER_CORE = [1.0, 0.62, 0.16], PLATE = [0.09, 0.025, 0.002], ENGRAVE = [0.0125, 0.0118, 0.0118];
const SHAFT_BG = [0, 0, 0], RAIL = C('#3a3f48');
const LANDING = [0.006, 0.005, 0.006], SLAB = C('#34343a'), SILL = C('#5c5c64');
const CAR_FRAME = C('#6a665e'), GATE = C('#8a8478'), CAR_IN = [0.85, 0.82, 0.74];
const BRICK_LIT = [0.07, 0.062, 0.056];
const CABLE = C('#565c66'), CW = C('#7c8494'), WALL = C('#26262c');

// ------------------------------------------------------------- the digits
// Brass floor numbers, 7 x 10, cast for this grid: heavy stems, hairline
// joins, ball terminals. '#' full, '+' half coverage.
const GLYPHS = [
  ['..###..', '.##+##.', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '.##+##.', '..###..'],
  ['...##..', '.+###..', '#+.##..', '...##..', '...##..', '...##..', '...##..', '...##..', '...##..', '.######'],
  ['.+###+.', '##...##', '##...##', '.....##', '....##+', '...##+.', '..##+..', '.##+...', '##....+', '#######'],
  ['.+####.', '##...##', '.....##', '.....##', '..####.', '.....##', '.....##', '##...##', '##...##', '.+###+.'],
  ['....##.', '...###.', '..+###.', '.+#.##.', '+#..##.', '##..##.', '#######', '....##.', '....##.', '...####'],
  ['#######', '##.....', '##.....', '##+##+.', '.+...##', '.....##', '.....##', '##...##', '##...##', '.+###+.'],
  ['..+###.', '.##+...', '##.....', '##.....', '##+##+.', '###.+##', '##...##', '##...##', '.##+##.', '..###..'],
  ['#######', '#....##', '....##+', '....##.', '...##+.', '...##..', '..+##..', '..##...', '..##...', '..##...'],
  ['.+###+.', '##...##', '##...##', '.##+##.', '..###..', '.##+##.', '##...##', '##...##', '##...##', '.+###+.'],
  ['..###..', '.##+##.', '##...##', '##...##', '##+.###', '.+##+##', '.....##', '.....##', '...+##.', '.###+..'],
].map((rows) => rows.map((r) => [...r].map((ch) => (ch === '#' ? 1 : ch === '+' ? 0.5 : 0))));

/** The landing indicator for floor d at (x, y). Unlit: a dim tick, plus a
 *  faint engraved numeral on floors 0, 5 and 9 only (a ruler, not a wall of
 *  numbers). Lit: an amber number on a glowing backplate, like an old floor
 *  indicator; these are the only saturated warm lights on the building. */
function numeral(d, x, y, level, side) {
  const g = GLYPHS[d], lit = Math.max(0, level), k = Math.min(1, lit);
  // the tick by the shaft door, always there
  const tx = side < 0 ? x + 4.5 : x - 1;
  G.rect(tx, y + 4.5, tx + 3.5, y + 5.5, [0.035, 0.032, 0.03], 1 - k);
  if (k > 0.01) {
    G.splat(x + 3.5, y + 5, 9, [1, 0.32, 0.03], 0.13 * k);                    // halo
    G.rect(x - 0.5, y - 0.8, x + 7.5, y + 10.8, PLATE, k);                     // backplate
    G.rect(x - 0.5, y - 0.8, x + 7.5, y - 0.3, [0.3, 0.1, 0.01], k);           // its lit rim
    G.rect(x - 0.5, y + 10.3, x + 7.5, y + 10.8, [0.3, 0.1, 0.01], k);
  }
  const showScale = d === 0 || d === 5 || d === 9;
  if (k < 0.01 && !showScale) return;
  const over = Math.max(1, lit);            // the ding overshoots toward the core colour
  for (let j = 0; j < 10; j++) for (let i = 0; i < 7; i++) {
    const v = g[j][i];
    if (!v) continue;
    const inner = (i > 0 && g[j][i - 1]) && (i < 6 && g[j][i + 1]) ? 1 : 0;
    const hot = kit.mix(AMBER, AMBER_CORE, Math.min(1, 0.35 * inner + (over - 1)));
    NC[0] = kit.lerp(ENGRAVE[0], hot[0], k); NC[1] = kit.lerp(ENGRAVE[1], hot[1], k); NC[2] = kit.lerp(ENGRAVE[2], hot[2], k);
    G.over(x + i, y + j, NC, k > 0.01 ? v : showScale ? v : 0);
  }
}
const NC = [0, 0, 0];

// ------------------------------------------------------------- the time
const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (sec) => { const d = new Date(sec * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };

/** A jerk-limited lift run: main S-curve to 96 %, then the slow levelling creep. */
function runCurve(u) {
  const mj = (x) => { x = kit.clamp(x); return x * x * x * (10 + x * (6 * x - 15)); };
  return 0.965 * mj(u / 0.82) + 0.035 * mj((u - 0.7) / 0.3);
}
export const runTime = (D) => 0.85 + 0.21 * Math.abs(D);

/** Door opening 0..1 over a set of [open-at, close-at] windows, 0.45 s slides. */
function doorsFrom(win, age) {
  let o = 0;
  for (const [a, b] of win) o = Math.max(o, Math.min(kit.smoothstep(a, a + 0.45, age), 1 - kit.smoothstep(b, b + 0.45, age)));
  return o;
}

/** Everything about car s (0..3) at time now. */
function carState(s, now, M, prev, cur, next) {
  const age = now - M, mi = Math.floor(M / 60);
  const a = +prev[s], b = +cur[s], willMove = next[s] !== cur[s];
  const st = { vel: 0, pos: b, moving: false, from: a, to: b, k: 1, open: 0, arrive: -10, dip: 0, mi };
  const win = [];
  if (a !== b) {
    const T = runTime(b - a);
    const u = age / T;
    if (u < 1) { st.pos = a + (b - a) * runCurve(u); st.moving = true; st.k = u; st.vel = (b - a) * (runCurve(u + 0.004) - runCurve(u - 0.004)) / (0.008 * T); }
    st.arrive = T;
    // rope bounce after the stop
    if (u >= 1) { const t = age - T; st.pos += 0.035 * Math.exp(-5 * t) * Math.sin(16 * t) * Math.sign(b - a); }
    win.push([T + 0.15, T + 3.2]);
  }
  // life: the minute-units car always changes passengers mid-minute; the
  // others now and then
  if (s === 3) win.push([28, 32.5]);
  else if (kit.hash(mi, s, 7) < 0.45) { const t0 = 9 + 40 * kit.hash(mi, s, 9); win.push([t0, t0 + 3.5]); }
  st.open = doorsFrom(win, age);
  if (willMove && age > 58.6) st.open = 0;          // doors shut before departure
  st.win = win;
  return st;
}

/** Brightness of the floor number f in shaft s. */
function numLevel(s, f, st, now, M) {
  const age = now - M;
  let lv = 0;
  if (st.from !== st.to) {
    if (f === st.from) lv = 1 - kit.smoothstep(0, 0.35, age);
    if (f === st.to) {
      const t = age - st.arrive;
      lv = t < -0.1 ? 0 : kit.smoothstep(-0.1, 0.12, t) * (1 + 0.6 * Math.exp(-4 * Math.max(0, t)));   // ding
    }
    if (st.moving) lv = Math.max(lv, 0.1 * Math.max(0, 1 - Math.abs(st.pos - f) * 1.6));      // glimmer as it passes
  } else if (f === st.to) lv = 1;
  return lv;
}

// ------------------------------------------------------------- shafts & cars
const numSide = (s) => (s === 0 || s === 2 ? -1 : 1);      // which side the landing is on
const SHIRTS = [C('#d04040'), C('#3c7ad8'), C('#3aa860'), C('#d8a020'), C('#9a50c8'), C('#e07830')];
const SKIN = C('#e0a070');

const SIL = [0.03, 0.02, 0.02];
function passenger(x, yb, shirt, a) {
  // dark silhouettes against the bright cab, a hint of coat colour
  G.rect(x + 0.2, yb - 6, x + 1.8, yb - 4.5, kit.mix(SIL, SKIN, 0.3), a);    // head
  G.rect(x - 0.2, yb - 4.5, x + 2.2, yb - 1.5, kit.mix(SIL, shirt, 0.35), a); // coat
  G.rect(x + 0.2, yb - 1.5, x + 1.8, yb, SIL, a);
}

function drawShaft(s, st, now) {
  const x0 = SHAFT_X[s], side = numSide(s), top = SHAFT_TOP[s];
  const yS = floorTop(top), ropeY = top === 9 ? 24 : floorTop(top + 1) + 7.5;
  G.rect(x0, yS, x0 + 12, 180, SHAFT_BG);
  // guide rails and the floor beams that give the shaft its scale
  const carX = carXOf(s), cwX = side < 0 ? x0 + 9.5 : x0 + 0.5;
  G.rect(carX - 0.6, yS, carX - 0.2, 180, RAIL, 0.5);
  G.rect(carX + 8.2, yS, carX + 8.6, 180, RAIL, 0.5);
  for (let f = 0; f <= top; f++) {
    const y = floorTop(f) + 13;
    G.rect(x0, y, x0 + 12, y + 1, RAIL, 0.35);
    const sx = side < 0 ? x0 : x0 + 10;
    G.rect(sx, y, sx + 2, y + 1, SILL, 0.8);                // landing sill
  }
  // the cab lamp lights the shaft round the car: brick walls, rails, beams
  const carTop = floorTop(st.pos) + 2, cy = carTop + 5.5;
  const ya = Math.max(yS, Math.floor(cy - 20)), yb = Math.min(180, Math.ceil(cy + 20));
  for (let y = ya; y < yb; y++) {
    const dy = (y + 0.5 - cy) / 11, f = Math.exp(-dy * dy);
    if (f < 0.02) continue;
    const course = Math.floor(y / 3), mortar = y % 3 === 0;
    for (let x = x0; x < x0 + 12; x++) {
      const joint = mortar || (x + (course % 2) * 2) % 5 === 0;
      G.add(x, y, BRICK_LIT, f * (joint ? 0.35 : 1));
    }
  }
  // speed streak: the cab light smears along the shaft on a fast run
  const sp = Math.abs(st.vel);
  if (sp > 1.2) {
    const len = Math.min(26, sp * 3.2), dir = Math.sign(st.vel);           // +vel = going up = trail below
    for (let k = 0; k < len; k++) {
      const y = dir > 0 ? carTop + 11 + k : carTop - 1 - k;
      G.glow(carX + 1, y, carX + 7, y + 1, [1, 0.75, 0.45], 0.22 * (1 - k / len) * Math.min(1, (sp - 1.2) / 2));
    }
  }
  // counterweight: rides opposite the car on the same rope
  const cwTop = floorTop(top - st.pos) + 3;
  G.line(cwX + 1, ropeY, cwX + 1, cwTop, CABLE, 0.6, 0.6);
  G.rect(cwX, cwTop, cwX + 2, cwTop + 7, CW); G.rect(cwX, cwTop, cwX + 2, cwTop + 0.8, C('#c0c8d4'));
  G.rect(cwX, cwTop + 1, cwX + 2, cwTop + 1.6, [0.05, 0.05, 0.06]);
  G.rect(cwX, cwTop + 3.5, cwX + 2, cwTop + 4.1, [0.05, 0.05, 0.06]);
  // hoist ropes up to the machine room
  G.line(carX + 3.5, ropeY, carX + 3.5, carTop, CABLE, 0.8, 0.6);
  G.line(carX + 4.5, ropeY, carX + 4.5, carTop, CABLE, 0.8, 0.6);
  drawCar(s, st, carX, carTop, now);
}

function drawCar(s, st, x, y, now) {
  const o = st.open, mi = st.mi;
  // crosshead and sling
  G.rect(x + 1, y - 1, x + 7, y, CAR_FRAME, 0.9);
  G.rect(x, y, x + 8, y + 11, CAR_FRAME);
  // cab interior, lit from a ceiling lamp
  const lamp = 0.62 + 0.05 * Math.sin(now * 2.1 + s);
  G.rect(x + 1, y + 1, x + 7, y + 10, kit.scale(CAR_IN, lamp * 0.8));
  G.rect(x + 2.5, y + 1, x + 5.5, y + 1.6, [1, 0.95, 0.8]);       // the ceiling lamp
  // passengers. The minute-units car's load changes only while its gate is
  // open at :28 (count c(mi) -> c(mi + 1)); the other cars keep theirs.
  const yb = y + 10, age = now - Math.floor(now / 60) * 60;
  const count = (m) => (s === 3 ? 1 + (kit.hash(m, 3, 3) < 0.5 ? 1 : 0) : [1, 2, 1][s]);
  const n0 = count(mi), n1 = count(mi + 1);
  const k = s === 3 ? kit.clamp((age - 28.6) / 2.4) : 0;          // the walk, while open
  const shirt = (p) => SHIRTS[(p + 2 * s) % SHIRTS.length];
  const slotX = (p, n) => x + (n === 1 ? 3 : 1.4 + p * 3.2);
  const nStay = Math.min(n0, n1), mover = n0 !== n1 ? nStay : -1;
  for (let p = 0; p < nStay; p++) {
    // stayers shuffle to their new spots as the car's load changes
    const px = kit.lerp(slotX(p, n0), slotX(p, n1), kit.ease.inOut(k)) + 0.3 * Math.sin(now * 0.7 + p * 2 + s);
    passenger(px, yb + 0.2 * Math.sin(now * 3 + p), shirt(p), 0.95);
  }
  let leaver = null;
  if (mover >= 0) {
    const side = numSide(s), e = kit.ease.inOut(k);
    if (n1 > n0) {          // someone steps in from the landing
      const px = kit.lerp(slotX(mover, n0 + 1) + side * 8, slotX(mover, n1), e);
      if (k > 0) passenger(px, yb, shirt(mover), kit.smoothstep(0, 0.25, k));
    } else leaver = { px: kit.lerp(slotX(mover, n0), slotX(mover, n0) + side * 8, e), a: 1 - kit.smoothstep(0.75, 1, k) };
  }
  // the brass scissor gate: a lattice over the lit cab that concertinas
  // away from the landing side as it opens
  const side = numSide(s), gw = 6 * (1 - o) + 0.9 * o;
  const g0 = side < 0 ? x + 7 - gw : x + 1, sc = gw / 6;
  for (let py = Math.floor(y + 1); py < y + 10; py++) {
    const v = py + 0.5 - y;
    for (let px = Math.floor(g0); px < Math.ceil(g0 + gw); px++) {
      const cov = Math.min(px + 1, g0 + gw) - Math.max(px, g0);
      if (cov <= 0) continue;
      const u = (px + 0.5 - g0) / sc;                       // gate-local, unfolded
      const d1 = Math.abs(kit.fract((u + v) / 3 + 0.5) - 0.5) * 3, d2 = Math.abs(kit.fract((u - v) / 3 + 0.5) - 0.5) * 3;
      const ink = Math.max(0, 1 - Math.min(d1, d2) * sc * 1.6);
      if (ink > 0) G.over(px, py, GATE, ink * cov * 0.45);
    }
  }
  G.rect(g0 - 0.2, y + 1, g0 + 0.5, y + 10, GATE, 0.9); G.rect(g0 + gw - 0.5, y + 1, g0 + gw + 0.2, y + 10, GATE, 0.9);
  if (leaver && leaver.a > 0) passenger(leaver.px, yb, shirt(mover), leaver.a);
  // light spilling onto the landing while the doors are open
  if (o > 0.02) G.splat(x + 4 + numSide(s) * 7, y + 6, 6, [0.8, 0.78, 0.7], 0.1 * o);
}

function drawLanding(s, sts, now) {
  const x0 = NUM_X[s];
  for (let f = 0; f <= SHAFT_TOP[s]; f++) {
    const y = floorTop(f);
    G.rect(x0, y, x0 + 9, y + 13, LANDING);
    G.rect(x0, y + 13, x0 + 9, y + 15, SLAB);
    G.rect(x0, y + 13, x0 + 9, y + 13.5, SILL, 0.5);
  }
}

// ------------------------------------------------------------- the face
const tower = {};
export default {
  name: 'The Otis',
  blurb: 'a ten-storey building in cutaway: four lifts park at the floors of the four digits; ride, level and ding on the minute',
  layouts: ['hub-2x3'], look: 'smoke', fps: 60, brightness: 0.32,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, age = now - M;
    const prev = digitsAt(M - 60), cur = digitsAt(M), next = digitsAt(M + 60);
    const sts = [0, 1, 2, 3].map((s) => carState(s, now, M, prev, cur, next));
    const hourAge = cur.slice(2) === '00' ? age : -1;
    const date = ctx.date;
    G.clear();
    drawSky(now, date, hourAge);
    drawRoof(now, date, sts, hourAge);
    // the building's carcass
    G.rect(0, Y_TOP - 2, 2, 180, WALL); G.rect(126, Y_TOP - 2, 128, 180, WALL);
    drawRooms(now, date, hourAge);
    drawSide(now, date, hourAge, sts, [0, 1, 2, 3].map(carXOf));
    drawLobby(now, date, sts, hourAge);
    for (let s = 0; s < 4; s++) { drawLanding(s, sts, now); drawShaft(s, sts[s], now); }
    for (let s = 0; s < 4; s++) for (let f = 0; f <= SHAFT_TOP[s]; f++) {
      const lv = numLevel(s, f, sts[s], now, M);
      numeral(f, NUM_X[s] + 1, floorTop(f) + 2, lv, numSide(s));
      if (lv > 0.05) G.glow(NUM_X[s], floorTop(f) + 13, NUM_X[s] + 9, floorTop(f) + 14, [1, 0.32, 0.03], 0.45 * Math.min(1, lv));   // the landing's sill lamp
    }
    drawStreet(now, date);
    const dim = 1 - 0.55 * ctx.night;
    // below 3/255 the panel only shows hue-shifted mush: make it black, deliberately
    const floor = 3 / 255 / dim;
    for (let p = 0; p < img.length; p++) if (img[p] < floor) img[p] = 0;
    kit.blitGrid(ctx, img, dim);
  },
};
