// Gumball: a gumball machine that tells the time with its gumballs.
//
// The octagon is the glass globe. The hour stands in it, built from bright
// gumballs, with the machine's dim stock heaped around it (kept one site
// clear of the digits, so they stand in clear glass). The stock drains as the
// hour goes on. A loose gumball rolls in the bottom of the bowl, one pass a
// second, and light sweeps across the glass every 11 s.
//
// The 32x8 strip is the red base: a chrome crank on the left, the minutes in
// the middle (smaller gumballs), and a rainbow-bellied frog in round glasses
// on the right. Just before each minute the frog flicks a coin over to the
// crank. The frog's tongue whips through the minute, licking up every
// gumball the new number doesn't need, and the crank turns half a turn for
// each gumball the globe drops through its neck, across the seam, into place.
//
// On the hour the old hour digit collapses and drains out through the neck,
// the new one rains in from the lid, and the stock floods back in behind it
// while the frog hops.
//
// Letterforms: every ball sits on a checkerboard site ((x + y) even), the
// square lattice's version of a hex-packed pile: each ball rests in the notch
// between two below. Straight strokes come out as brick zigzags, 45-degree
// strokes as chains of touching balls, and every corner is chamfered like the
// octagon. Behind an opal diffuser at 2.5 mm each LED becomes a round, glossy
// candy, and the checkerboard's empty sites keep the candies apart.
//
// Stateless: a closed-form function of the wall clock, with small caches
// keyed by the minute.
import * as kit from '../js/kit.js';

// ------------------------------------------------------------ letterforms
// Globe set, 6 x 10. Never (0,0) or (5,9): the octagon's cut corners.
const G10 = {
  0: ['..#.#.', '.#...#', '#...#.', '.#...#', '#...#.', '.#...#', '#...#.', '.#...#', '#...#.', '.#.#..'],
  1: ['..#...', '.#.#..', '#.#...', '...#..', '..#...', '...#..', '..#...', '...#..', '..#...', '.#.#..'],
  2: ['..#.#.', '.#...#', '#...#.', '.....#', '....#.', '...#..', '..#...', '.#....', '#.#.#.', '.#.#..'],
  3: ['..#.#.', '.#...#', '....#.', '.....#', '..#.#.', '.....#', '....#.', '.....#', '#...#.', '.#.#..'],
  4: ['....#.', '...#.#', '..#.#.', '.#...#', '#...#.', '.#.#.#', '....#.', '.....#', '....#.', '...#..'],
  5: ['..#.#.', '.#.#.#', '#.....', '.#.#..', '....#.', '.....#', '....#.', '.....#', '#...#.', '.#.#..'],
  6: ['....#.', '...#..', '..#...', '.#....', '#.....', '.#.#..', '#...#.', '.#...#', '#...#.', '.#.#..'],
  7: ['..#.#.', '.#.#.#', '....#.', '...#..', '..#...', '.#....', '..#...', '.#....', '..#...', '.#....'],
  8: ['..#.#.', '.#...#', '#...#.', '.#...#', '..#.#.', '.#.#..', '#...#.', '.#...#', '#...#.', '.#.#..'],
  9: ['..#.#.', '.#...#', '#...#.', '.#...#', '..#.#.', '.....#', '....#.', '...#..', '..#...', '.#....'],
};
// Base set, 6 x 8.
const G8 = {
  0: ['..#.#.', '.#...#', '#...#.', '.#...#', '#...#.', '.#...#', '#...#.', '.#.#..'],
  1: ['..#...', '.#.#..', '#.#...', '...#..', '..#...', '...#..', '..#...', '.#.#..'],
  2: ['..#.#.', '.#...#', '#...#.', '.....#', '....#.', '...#..', '#.#...', '.#.#..'],
  3: ['..#.#.', '.#...#', '....#.', '.....#', '..#.#.', '.....#', '#...#.', '.#.#..'],
  4: ['....#.', '...#.#', '..#.#.', '.#...#', '#.#.#.', '.....#', '....#.', '...#..'],
  5: ['..#.#.', '.#.#.#', '#.....', '.#.#..', '....#.', '.....#', '#...#.', '.#.#..'],
  6: ['....#.', '...#..', '..#...', '.#....', '#.#.#.', '.#...#', '#...#.', '.#.#..'],
  7: ['..#.#.', '.#.#.#', '....#.', '...#..', '..#...', '.#....', '..#...', '.#....'],
  8: ['..#.#.', '.#...#', '#...#.', '.#.#..', '..#.#.', '.#...#', '#...#.', '.#.#..'],
  9: ['..#.#.', '.#...#', '#...#.', '.#.#.#', '....#.', '...#..', '..#...', '.#....'],
};
const parse = (F) => Object.fromEntries(Object.entries(F).map(([d, rows]) => {
  const pts = [];
  rows.forEach((s, y) => [...s].forEach((ch, x) => {
    if (ch !== '#') return;
    if ((x + y) % 2) throw new Error(`gumball glyph ${d}: (${x},${y}) off the lattice`);
    pts.push([x, y]);
  }));
  return [d, pts];
}));
const FG = parse(G10), FS = parse(G8);

// ---------------------------------------------------------------- palette
// Eight flavours, luminance roughly levelled so no candy drops out of a digit.
const FLAVOURS = ['#ff1830', '#ff6a10', '#ffc018', '#58e030', '#20d8c0', '#3a64ff', '#a848ff', '#ff48a8'].map((h) => {
  const c = kit.hex(h), Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return kit.scale(c, Math.min(1.25, Math.sqrt(0.3 / Y)) / 1.25);
});
const flavour = (a, b) => FLAVOURS[Math.floor(kit.hash(a, b, 911) * FLAVOURS.length)];
const ENAMEL = kit.hex('#ff1a10');               // the red base
const CHROME = [0.55, 0.62, 0.75];
const GOLD = kit.hex('#ffb020');
const TONGUE = kit.hex('#ff3a6a');
const SKIN = kit.hex('#40e020');                 // the frog

// --------------------------------------------------------------- geometry
const OCT = { x0: -30, y0: -74.2, p: 4 }, STR = { x0: -46.5, y0: -10.5, p: 3 };
const NECK = [0, -20];                            // where gumballs leave the globe
const LID = [0, -84];                             // where the refill pours in
const MOUTH = [27.5, 1.5];                        // the frog's mouth
const SLOT = [-36, -7];                           // the coin slot, top of the crank
const CRANK = [-36, 0];
const HOUR_SLOTS = [[1, 3], [9, 3]], MIN_SLOTS = [[9, 0], [17, 0]];

const pad = (n) => String(n).padStart(2, '0');
const pitchAt = (y) => kit.lerp(3, 4, kit.smoothstep(-10.5, -14.2, y));
// A ball site: board 'o' (globe) or 's' (base), lattice column and row, mm.
const site = (b, c, r) => ({
  key: (b === 'o' ? 0 : 1000) + c * 32 + r, b, c, r,
  x: b === 'o' ? OCT.x0 + OCT.p * c : STR.x0 + STR.p * c,
  y: b === 'o' ? OCT.y0 + OCT.p * r : STR.y0 + STR.p * r,
});
const glyphSites = (b, font, slots, txt) => {
  const out = [];
  slots.forEach(([c0, r0], k) => { for (const [x, y] of font[txt[k]]) out.push({ ...site(b, c0 + x, r0 + y), slot: k }); });
  return out;
};
const HOURS = Array.from({ length: 24 }, (_, h) => glyphSites('o', FG, HOUR_SLOTS, pad(h)));
const MINS = Array.from({ length: 60 }, (_, m) => glyphSites('s', FS, MIN_SLOTS, pad(m)));
const HOURKEYS = HOURS.map((s) => new Set(s.map((q) => q.key)));
const MINKEYS = MINS.map((s) => new Set(s.map((q) => q.key)));

// Every checkerboard site in the globe (built once, from the layout).
let octSites = null;
function globeSites(ctx) {
  if (octSites) return octSites;
  octSites = ctx.leds.filter((l) => l.panel === 0 && (l.col + l.row) % 2 === 0).map((l) => site('o', l.col, l.row));
  return octSites;
}
// The stock for hour h: the globe's other sites, lowest first, heaped into a
// mound (centre fills before the shoulders). It keeps clear of the hour's
// own balls by one site, so the digits stand in clear glass and their
// counters stay open.
const stocks = new Map();
function stockOf(ctx, h) {
  if (stocks.has(h)) return stocks.get(h);
  const near = (q) => HOURS[h].some((d) => Math.abs(d.c - q.c) <= 1 && Math.abs(d.r - q.r) <= 1);
  const s = globeSites(ctx).filter((q) => !near(q))
    .map((q) => ({ ...q, rank: (15 - q.r) + 0.55 * Math.abs(q.c - 7.5) + 0.01 * kit.hash(q.c, q.r) }))
    .sort((a, b) => a.rank - b.rank);
  stocks.set(h, s);
  return s;
}
/** How many stock balls are left during minute m: full on the hour, a fifth by :59. */
const stockCount = (n, m) => Math.round(n * (1 - 0.8 * m / 59));

/** The minute a gumball at `key` arrived, seen during the minute starting M (epoch s). */
function bornMin(key, M) {
  for (let k = 0; k < 90; k++) if (!MINKEYS[new Date((M - 60 * (k + 1)) * 1000).getMinutes()].has(key)) return M - 60 * k;
  return 0;
}
function bornHour(key, H) {
  for (let k = 0; k < 30; k++) if (!HOURKEYS[new Date((H - 3600 * (k + 1)) * 1000).getHours()].has(key)) return H - 3600 * k;
  return 0;
}

// ------------------------------------------------------------- the minute
const T = {
  coin: [-1.3, -0.4],      // flicked from the frog to the slot (before the minute)
  out: [0.05, 0.5],        // tongue out ...
  back: [0.5, 1.05],       // ... and reeled in with its catch
  gulp: [1.05, 1.6],
  drop: 0.5,               // first gumball leaves the neck
  fall: 0.5,               // neck to tray
  pour: 0.15, pourFall: 0.55,
};

const plans = new Map();
/** Everything that happens in the minute starting at epoch second M. */
function plan(ctx, M) {
  if (plans.has(M)) return plans.get(M);
  const d = new Date(M * 1000), dp = new Date((M - 60) * 1000);
  const h = d.getHours(), m = d.getMinutes(), hp = dp.getHours(), mp = dp.getMinutes();
  const P = { M, h, m };

  // base: keep, lick, drop
  const now = MINS[m], old = MINS[mp];
  P.keep = now.filter((q) => MINKEYS[mp].has(q.key)).map((q) => ({ ...q, col: flavour(q.key, bornMin(q.key, M)) }));
  const lick = old.filter((q) => !MINKEYS[m].has(q.key)).map((q) => ({ ...q, col: flavour(q.key, bornMin(q.key, M - 60)) }));
  const drop = now.filter((q) => !MINKEYS[mp].has(q.key)).map((q) => ({ ...q, col: flavour(q.key, M) }));
  // the tongue's path: from the mouth, always to the nearest gumball left
  const path = [{ x: MOUTH[0], y: MOUTH[1], s: 0 }];
  const left = lick.slice();
  while (left.length) {
    const a = path[path.length - 1];
    let k = 0;
    left.forEach((q, j) => { if (Math.hypot(q.x - a.x, q.y - a.y) < Math.hypot(left[k].x - a.x, left[k].y - a.y)) k = j; });
    const q = left.splice(k, 1)[0];
    path.push({ x: q.x, y: q.y, s: a.s + Math.hypot(q.x - a.x, q.y - a.y), ball: q });
  }
  P.path = path; P.lickLen = path[path.length - 1].s;
  // bottom first, so each new gumball lands on the ones before it
  drop.sort((a, b) => b.r - a.r || Math.abs(a.x) - Math.abs(b.x));
  const gap = Math.min(0.16, 1.6 / Math.max(1, drop.length));
  drop.forEach((q, j) => { q.t0 = T.drop + j * gap; q.sx = NECK[0] + (kit.hash(j, M) - 0.5) * 3; });
  P.drop = drop;

  // globe
  const st = stockOf(ctx, h);
  P.hourTurn = h !== hp;
  P.hour = HOURS[h].map((q) => ({ ...q, col: flavour(q.key, bornHour(q.key, M - m * 60)) }));
  P.stock = st.slice(0, stockCount(st.length, m)).map((q) => ({ ...q, col: flavour(q.key, 7) }));
  P.stockGone = [];
  if (!P.hourTurn) {
    P.stockGone = st.slice(stockCount(st.length, m), stockCount(st.length, mp)).map((q) => ({ ...q, col: flavour(q.key, 7) }));
  } else {
    // the pour: the old hour's spare balls collapse out through the neck,
    // the new ones and the refilled stock fall from the lid, lowest first
    const oldStock = stockOf(ctx, hp), nOld = stockCount(oldStock.length, 59);
    const oldSet = new Set(oldStock.slice(0, nOld).map((q) => q.key));
    const stockSet = new Set(P.stock.map((q) => q.key));
    const oldHour = HOURS[hp].map((q) => ({ ...q, col: flavour(q.key, bornHour(q.key, M - 3600)) }));
    P.sink = oldHour.filter((q) => !HOURKEYS[h].has(q.key));
    P.fade = oldStock.slice(0, nOld).filter((q) => !stockSet.has(q.key)).map((q) => ({ ...q, col: flavour(q.key, 7) }));
    // the new hour first, quickly, so it reads again within a second or so;
    // then the stock floods in behind it
    const low = (a, b) => b.r - a.r || Math.abs(a.c - 7.5) - Math.abs(b.c - 7.5);
    const lit = P.hour.filter((q) => !HOURKEYS[hp].has(q.key)).map((q) => ({ ...q, bright: true })).sort(low);
    const heap = P.stock.filter((q) => !oldSet.has(q.key)).map((q) => ({ ...q, bright: false })).sort(low);
    const g1 = Math.min(0.04, 0.6 / Math.max(1, lit.length)), g2 = Math.min(0.04, 1.7 / Math.max(1, heap.length));
    lit.forEach((q, j) => { q.t0 = T.pour + j * g1; });
    heap.forEach((q, j) => { q.t0 = T.pour + 0.5 + j * g2; });
    const pour = [...lit, ...heap];
    pour.forEach((q, j) => { q.sx = LID[0] + (kit.hash(j, M, 3) - 0.5) * 8; });
    P.pour = pour;
    P.pourKeys = new Set(pour.map((q) => q.key));
  }
  if (plans.size > 6) plans.delete(plans.keys().next().value);
  plans.set(M, P);
  return P;
}
// ------------------------------------------------------------- drawing
const STOCKA = 0.04;                              // the stock: dim, deep in the globe

/** A gumball at (x, y) mm: one LED when it rests on a site, glides between them. */
const ball = (ctx, x, y, c, a) => kit.splat(ctx, x, y, pitchAt(y), c, a);

/** Every second the clockwork thumps: a small bounce running up from the base. */
function jig(now, y, amp) {
  const tau = kit.fract(now - (-10 - y) * 0.0035);
  return -amp * Math.exp(-tau * 7) * Math.abs(Math.sin(tau * Math.PI * 4));
}
/** Light catching the glass: a soft diagonal band sweeps the globe every 11 s. */
function glint(now, x, y) {
  const u = (x + y + 44.2) / Math.SQRT2;
  const u0 = kit.lerp(-62, 62, kit.ease.inOut(kit.clamp(kit.fract(now / 11) / 0.4)));
  return Math.exp(-(((u - u0) / 6) ** 2));
}
const WHITE = [1, 0.95, 0.9];

/** The loose gumball rolling in the bottom of the bowl: one pass a second. */
function marble(now) {
  const x = 19 * Math.sin(Math.PI * (now - 0.5));
  const y = -14.2 - Math.max(0, Math.abs(x) - 10);
  return [x, y];
}

/** A landing bounce, tau seconds after touching down. */
const bounce = (tau, amp) => (tau < 0 || tau > 0.8 ? 0 : -amp * Math.exp(-tau * 7) * Math.abs(Math.sin(tau * Math.PI * 5)));

function pathAt(path, s) {
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k];
    if (s <= b.s) { const u = (s - a.s) / ((b.s - a.s) || 1); return [kit.lerp(a.x, b.x, u), kit.lerp(a.y, b.y, u)]; }
  }
  const z = path[path.length - 1];
  return [z.x, z.y];
}
function pathSegs(path, s) {
  const segs = [];
  for (let k = 1; k < path.length && path[k - 1].s < s; k++) {
    const a = path[k - 1], [bx, by] = pathAt(path, Math.min(s, path[k].s));
    segs.push([a.x, a.y, bx, by, 0]);
  }
  return segs;
}
const phase = (age, [a, b]) => kit.clamp((age - a) / (b - a));

// The frog, 8 x 8 on the base (columns 24-31), facing the room. g glasses,
// e eyes, G skin (rainbow), D shade, B throat, m mouth.
const FROG = [
  '.gg..gg.',
  'geeggeeg',
  'gpeGGpeg',
  'GGGGGGGG',
  'GmmmmmmG',
  'GGBBBBGG',
  '.GBBBBG.',
  'GG....GG',
];

function drawFrog(ctx, now, age, P, dim, hop) {
  const blink = kit.fract(now / 4.7 + 0.3) < 0.035 || ctx.night > 0.5;
  const tongueOut = P.lickLen > 0 && age > T.out[0] && age < T.back[1];
  const gulp = Math.sin(Math.PI * phase(age, T.gulp));
  const breath = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(now * kit.TAU));
  const lookUp = age > T.drop - 0.2 && age < 3 && P.drop.length > 0;
  FROG.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '.') return;
    const x = STR.x0 + STR.p * (24 + c), y = STR.y0 + STR.p * r + hop;
    const hue = kit.fract(c * 0.14 - now * 0.08);  // a rainbow belly that slowly cycles
    let col;
    if (lookUp && (c === 1 || c === 5) && r <= 2) ch = r === 1 ? 'p' : 'e';
    if (ch === 'g') col = kit.scale(GOLD, 0.16);
    else if (ch === 'e') col = blink ? kit.scale(SKIN, 0.07) : [0.22, 0.22, 0.2];
    else if (ch === 'p') { if (!blink) return; col = kit.scale(SKIN, 0.07); }
    else if (ch === 'G') col = kit.scale(SKIN, 0.07 * (r === 5 || r === 6 ? 1 + 0.6 * gulp : 1));
    else if (ch === 'B') col = kit.scale(kit.hsv(hue, 0.8), 0.06 * breath * (1 + 1.5 * gulp));
    else if (ch === 'm') { if (!tongueOut) return; col = kit.scale(TONGUE, 0.06); }
    ball(ctx, x, y, col, dim);
  }));
}

/** The crank: the coin unlocks it with a jolt, then half a turn per gumball dispensed. */
function drawCrank(ctx, rel, P, dim) {
  let th = 0.35 * Math.sin(Math.PI * phase(rel, [T.coin[1], T.coin[1] + 0.4]));
  const step = P.drop.length ? kit.TAU * Math.ceil(P.drop.length / 2) / P.drop.length : 0;   // ends on whole turns
  if (rel > -1) for (const q of P.drop) th += step * kit.ease.inOut(phase(rel, [q.t0 - 0.16, q.t0]));
  const [cx, cy] = CRANK, ux = Math.cos(th), uy = Math.sin(th);
  for (const i of ctx.layout.index.near(cx, cy, 12)) {
    const l = ctx.leds[i], d = Math.hypot(l.x - cx, l.y - cy);
    const plate = 1 - kit.smoothstep(0.5, 1.6, Math.abs(d - 10));     // the faceplate's rim
    kit.add(ctx, i, CHROME, 0.035 * plate * dim);
    const bar = kit.segDist(l.x, l.y, cx - 7 * ux, cy - 7 * uy, cx + 7 * ux, cy + 7 * uy);
    kit.add(ctx, i, CHROME, 0.07 * (1 - kit.smoothstep(0.6, 1.8, bar)) * dim);
  }
  ball(ctx, cx, cy, CHROME, 0.12 * dim);                              // the hub
  ball(ctx, cx + 7 * ux, cy + 7 * uy, [1, 0.9, 0.8], 0.3 * dim);       // the knob
}

function drawCoin(ctx, rel, dim) {
  if (rel < T.coin[0] || rel > T.coin[1] + 0.2) return;
  const p = phase(rel, T.coin);
  const x = kit.lerp(MOUTH[0], SLOT[0], p), y = kit.lerp(MOUTH[1], SLOT[1], p) - 16 * 4 * p * (1 - p);
  const spin = 0.6 + 0.4 * Math.abs(Math.cos(rel * 30));
  const fade = 1 - kit.clamp((rel - T.coin[1]) / 0.2);
  ball(ctx, x, y, GOLD, 1.0 * spin * fade * dim);
}
export default {
  name: 'Gumball',
  blurb: 'a gumball machine: the hour stands in the globe, a frog licks up each old minute and the globe drops in the new one',
  layouts: ['oct-strip'], look: { look: 'opal', gap: 1.5 }, fps: 60, brightness: 0.6, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, age = now - M;
    const rel = age > 58 ? age - 60 : age;       // time relative to the nearest minute turn
    const P = plan(ctx, M);
    const dim = 1 - 0.75 * ctx.night;
    const deep = dim * (1 - ctx.night);           // the enamel and the stock go dark at night

    // the red enamel base
    for (const l of ctx.leds) if (l.panel === 1) kit.set(ctx, l.i, ENAMEL, 0.035 * deep);

    // ---- globe: stock behind, hour in front
    const pouring = P.hourTurn && age < 4;
    for (const q of P.stock) {
      if (pouring && P.pourKeys.has(q.key)) continue;
      ball(ctx, q.x, q.y + jig(now, q.y, 1.0), q.col, STOCKA * deep * (1 + 2.5 * glint(now, q.x, q.y)));
    }
    for (const q of P.stockGone) {                // the pile settles: its top slides out the neck
      const p = kit.ease.in(phase(age, [0.15, 1.1]));
      if (p >= 1) continue;
      ball(ctx, kit.lerp(q.x, NECK[0], p), kit.lerp(q.y, NECK[1], p), q.col, STOCKA * deep * (1 - p * p));
    }
    for (const q of P.hour) {
      if (pouring && P.pourKeys.has(q.key)) continue;
      const g = glint(now, q.x, q.y);
      ball(ctx, q.x, q.y, kit.mix(q.col, WHITE, 0.4 * g), dim * (1 + 0.4 * g));
    }
    const [mx, my] = marble(now);
    ball(ctx, mx, my, kit.hex('#ffe0f0'), 0.3 * dim);
    if (pouring) {
      for (const q of P.sink) {                   // the old digit collapses and drains out the neck
        const tau = Math.max(0, age - 0.05 - (15 - q.r) * 0.025);
        const y = q.y + 70 * tau * tau;
        const a = 1 - kit.smoothstep(-24, -15, y);
        if (a <= 0) continue;
        ball(ctx, kit.lerp(q.x, NECK[0], kit.smoothstep(-34, -18, y) * 0.8), y, q.col, a * dim);
      }
      for (const q of P.fade) {
        const p = phase(age, [0, 0.5]);
        if (p < 1) ball(ctx, q.x, q.y + 3 * p, q.col, STOCKA * (1 - p) * deep);
      }
      for (const q of P.pour) {                   // the cascade from the lid
        const p = (age - q.t0) / T.pourFall;
        if (p < 0) continue;
        if (p < 1) {
          ball(ctx, kit.lerp(q.sx, q.x, kit.ease.inOut(p)), kit.lerp(LID[1], q.y, p * p), q.col, (q.bright ? 1 : 0.22) * dim);
        } else {
          const tau = age - q.t0 - T.pourFall;
          const a = q.bright ? dim : kit.lerp(0.22 * dim, STOCKA * deep, kit.smoothstep(0, 0.4, tau));
          ball(ctx, q.x, q.y + bounce(tau, 1.6) + jig(now, q.y, 0.6), q.col, a);
        }
      }
    }

    // ---- base: the minute
    for (const q of P.keep) ball(ctx, q.x, q.y + jig(now, q.y, 0.35), q.col, dim);
    const pOut = kit.ease.out(phase(age, T.out)), pBack = kit.ease.in(phase(age, T.back));
    const reel = pBack * P.lickLen;
    for (const n of P.path) {
      if (!n.ball) continue;
      if (pBack <= 0) { ball(ctx, n.x, n.y, n.ball.col, dim); continue; }
      const s = n.s - reel;
      if (s <= 0) continue;                       // swallowed
      const [x, y] = pathAt(P.path, s);           // riding the tongue home, shrinking into the mouth
      ball(ctx, x, y, n.ball.col, 0.7 * kit.smoothstep(0, 12, s) * dim);
    }
    if (P.lickLen > 0 && age > T.out[0] && age < T.back[1]) {
      const tip = pBack > 0 ? P.lickLen - reel : pOut * P.lickLen;
      kit.drawStrokes(ctx, pathSegs(P.path, tip), { width: 1.4, soft: 1.0, color: kit.scale(TONGUE, 0.35 * dim) });
    }
    for (const q of P.drop) {                     // new gumballs from the globe
      const p = (age - q.t0) / T.fall;
      if (p < 0) continue;
      if (p < 1) ball(ctx, kit.lerp(q.sx, q.x, kit.ease.inOut(p)), kit.lerp(NECK[1], q.y, p * p), q.col, dim);
      else ball(ctx, q.x, q.y + bounce(age - q.t0 - T.fall, 1.2) + jig(now, q.y, 0.35), q.col, dim);
    }

    drawCrank(ctx, rel, rel < 0 ? plan(ctx, M + 60) : P, dim);
    const hop = pouring ? -4.5 * Math.abs(Math.sin(3 * Math.PI * kit.clamp((age - 0.4) / 2.1))) : 0;
    drawFrog(ctx, now, age, P, dim, hop);
    drawCoin(ctx, rel, dim);
  },
};
