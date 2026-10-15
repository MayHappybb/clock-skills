// Flipbook: the two parallelograms are an open book lying on a desk, seen in
// perspective. The seam between the boards is the spine; the top board is
// the far page, the bottom board the near page. The lattice's lean is not
// italic: it is the page receding.
//
// The time is the place in the book: the far page carries the chapter (the
// hour), the near page the page number (the minute), pencilled by hand in
// graphite that a slow sheen of lamp light slides across. A doodled frog
// in round glasses lives in the right margin.
//
// Seconds: all minute long he tugs the page's bottom corner up, a dog-ear
// that grows with every tug. Once a minute his tongue zips over the spine
// for the fly in the far margin.
// Minute: he lets the corner drop, grabs the page and rides it over the
// spine. The leaf turns in perspective: its pencil goes dark as it tilts
// off the lamp, it flares as it stands up (and loses the lean), casts its
// shadow and settles on the far page carrying the hour on its back; the
// next page number was under it all along.
// Hour: he thumbs the stack and the book riffles to the next chapter. Ten
// leaves snap up and float over, and they are a flipbook: frame by frame
// the old minute and hour are rubbed out and the new ones drawn, until the
// chapter's title page lands, inked in green with a dotted rule.
//
// Look: opal at 1.3 mm. The diffuser is the paper: the LEDs merge into a
// soft lit sheet while single-LED pencil strokes stay crisp.
//
// Stateless: every leaf, fold, hop and tongue is a closed-form function of
// the wall clock; page contents are cached per minute.
import * as kit from '../js/kit.js';

// ---------------------------------------------------------------- geometry
const P = 2.55, A61 = (61 * Math.PI) / 180, CA = Math.cos(A61), SA = Math.sin(A61);
const VX = -CA, VY = SA;                  // unit vector down the slant, toward the reader
const S0 = (9.55 - 3.5 * P * SA) / SA;    // spine to the first row, along the slant (mm)
const D = 19.1 / SA;                      // page depth: spine to the page's edge
const HALF = 42.275 / 2;                  // half a page along a row
const K = 0.5 * SA;                       // height scale: seen from above, an upright leaf looks short

/** Screen position of page point (a along the spine, s from the spine; s > 0 near). */
const scr = (a, s) => [a + s * VX, s * VY];

// ------------------------------------------------------------------ colour
// Lamp-lit cream paper. Its blue sits at 4-7/255, below the clean range;
// dithering keeps it smooth, and a blue-free paper read as mustard.
const PAPER = kit.hex('#ffd9a0');
const LEAD = kit.hex('#c9d6ea');          // graphite catching the lamp
const INK = kit.hex('#4cff6a');           // the one accent: the frog's green
const FROG = kit.hex('#2fd44a'), BELLY = kit.hex('#c8ff6a'), EYE = kit.hex('#fff6dc');
const PAPER_LV = 0.08, LEAD_LV = 0.36;
const TONGUE = kit.hex('#ff5a7a');

// ------------------------------------------------------------------ digits
// Pencilled numerals, 4 x 7 on the page lattice: narrow, as a hand writes. The lattice is nearly
// triangular: its straight lines are the rows, the leaning columns, and the
// "\" diagonal (one right, one down). Acute corners are cut along that
// diagonal and come out round; obtuse ones keep their corner. '#' is a
// pressed stroke, '+' a light pencil pass where a hand would round a turn or
// start a hook. Handwritten forms: the 1 is a flagged stem, the 7 is
// crossed, the 4 open, the 5's flag lifted off its stem.
const G = {
  0: ['###.', '#..#', '#..#', '#..#', '#..#', '#..#', '.###'],
  1: ['..#.', '.##.', '..#.', '..#.', '..#.', '..#.', '..#.'],
  2: ['+##.', '#..#', '...#', '..#+', '.#+.', '#+..', '####'],
  3: ['+##.', '...#', '...#', '.##+', '...#', '+..#', '###+'],
  4: ['#.#.', '#.#.', '#.#.', '###+', '..#.', '..#.', '..#.'],
  5: ['.###', '#...', '#...', '###.', '...#', '+..#', '###+'],
  6: ['+##.', '#...', '#...', '###.', '#..#', '#..#', '.###'],
  7: ['###.', '..#.', '..#.', '.###', '..#.', '..#.', '..#.'],
  8: ['###.', '#..#', '#..#', '+##+', '#..#', '#..#', '.###'],
  9: ['###.', '#..#', '#..#', '.###', '...#', '...#', '...#'],
};
const PRESS = { '#': 1, '+': 0.45, '.': 0 };
const HOUR_C = [1, 6], MIN_C = [1, 6];     // glyph columns on each page
const HOUR_J = 0, MIN_J = 1;               // glyph top row: far page from its top, near page under the gutter row

/** Glyph nodes in writing order (top to bottom, left to right): [x, y, press]. */
const nodesOf = (ch) => {
  const out = [];
  G[ch].forEach((r, y) => [...r].forEach((m, x) => { if (PRESS[m]) out.push([x, y, PRESS[m]]); }));
  return out;
};

const pad = (n) => String(n).padStart(2, '0');

/**
 * A page side: per board node (c * 8 + j), lead (graphite) and ink (green).
 * `draw(n)` gives, per glyph n, the fraction of its nodes drawn (for the
 * flipbook frames): 1 = whole, a negative value -f = erased up to f.
 */
function pageOf(text, cols, j0, { green = 0, draw = null, swash = false } = {}) {
  const lead = new Float32Array(128), ink = new Float32Array(128);
  [...text].forEach((ch, n) => {
    const nodes = nodesOf(ch), f = draw ? draw(n) : 1;
    // drawing goes in writing order; rubbing out is scattered, like an
    // eraser, so a half-erased numeral never looks like another one
    const rub = nodes.map((_, q) => q).sort((p, q) => kit.hash(p, n, 3) - kit.hash(q, n, 3));
    nodes.forEach(([x, y, p], q) => {
      const u = f >= 0 ? (q + 0.5) / nodes.length : (rub.indexOf(q) + 0.5) / nodes.length;
      if (f >= 0 ? u > f : u < -f) return;
      const c = cols[n] + x, j = j0 + y, i = c * 8 + j;
      // pressure wanders along the stroke, as a hand's does
      const v = p * (0.68 + 0.32 * kit.noise2(c * 0.8 + n * 5.3, j * 0.8 + ch.charCodeAt(0)));
      if (green) ink[i] = Math.max(ink[i], v); else lead[i] = Math.max(lead[i], v);
    });
  });
  if (swash) {
    // the title page's flourish: a dotted green rule under the chapter
    // number, in the gutter row (dots, so it never joins the numerals' feet),
    // with a curl at its end
    for (let c = 1; c <= 9; c += 2) ink[c * 8 + 7] = Math.max(ink[c * 8 + 7], 0.2 + 0.35 * Math.sin((c / 10) * Math.PI));
    ink[10 * 8 + 6] = 0.45; ink[11 * 8 + 5] = 0.3;
  }
  return { lead, ink };
}

const cache = new Map();
function memo(key, fn) {
  if (cache.has(key)) return cache.get(key);
  const v = fn();
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  cache.set(key, v);
  return v;
}
const hourOf = (M) => pad(new Date(M * 1000).getHours());
const minOf = (M) => pad(new Date(M * 1000).getMinutes());
/** The far page during minute M: the chapter; at :00 its title page. */
const farPage = (M) => memo('f' + M, () => {
  const title = new Date(M * 1000).getMinutes() === 0;
  return pageOf(hourOf(M), HOUR_C, HOUR_J, { green: title, swash: title });
});
const nearPage = (M) => memo('n' + M, () => pageOf(minOf(M), MIN_C, MIN_J));

/** A flipbook frame at progress f (0..1): `from` rubbed out (quickly), then `to` drawn; digits that stay are kept. */
const RUB = 0.28;
function morph(from, to, cols, j0, f) {
  const keep = [0, 1].filter((n) => from[n] === to[n]);
  const old = pageOf(from, cols, j0, { draw: (n) => (keep.includes(n) ? 1 : -kit.clamp(f / RUB)) });
  if (f > RUB) {
    const neu = pageOf(to, cols, j0, { draw: (n) => (keep.includes(n) ? 0 : Math.max(1e-6, kit.clamp((f - RUB) / (1 - RUB)))) });
    for (let i = 0; i < 128; i++) old.lead[i] = Math.max(old.lead[i], neu.lead[i]);
  }
  return old;
}
/**
 * The riffled leaves at hour M are a flipbook: on their backs the old hour
 * is rubbed out and the new one drawn, on their fronts the old minute and
 * the new. The minute is whole again by the 8th front (about 0.9 s in),
 * after the first back has landed and begun rubbing out the old hour, so a
 * whole old hour never sits over a whole new minute, nor the reverse.
 */
const riffleBack = (M, j, N) => memo(`rb${M}:${j}`, () => (j === N - 1 ? farPage(M) : morph(hourOf(M - 60), hourOf(M), HOUR_C, HOUR_J, (j + 1) / (N - 1))));
const riffleFront = (M, j, N) => memo(`rf${M}:${j}`, () => (j === 0 ? nearPage(M - 60) : morph(minOf(M - 60), minOf(M), MIN_C, MIN_J, kit.clamp(j / 7))));

/** Bilinear sample of a node map at fractional board coordinates. */
function sample(map, c, j) {
  if (c < -0.6 || c > 15.6 || j < -0.6 || j > 7.6) return 0;
  const c0 = Math.max(0, Math.min(14, Math.floor(c))), j0 = Math.max(0, Math.min(6, Math.floor(j)));
  const fc = kit.clamp(c - c0), fj = kit.clamp(j - j0), m = (cc, jj) => map[cc * 8 + jj];
  return kit.lerp(kit.lerp(m(c0, j0), m(c0 + 1, j0), fc), kit.lerp(m(c0, j0 + 1), m(c0 + 1, j0 + 1), fc), fj);
}

// ------------------------------------------------------------------ leaves
// A leaf turned by theta about the spine: its point at depth d is at
// spine(a) + d * w. theta 0 lies on the near page, pi on the far page; at
// pi/2 it stands upright and loses the lean. Below theta = 45 deg we see its
// front (the recto), above it its back.
const leafW = (th) => [Math.cos(th) * VX, Math.cos(th) * VY - K * Math.sin(th)];
/** Lamp from above the reader: how lit each face is (flat = 1). */
const EDGE_ON = Math.atan2(VY, K);       // the angle at which a leaf is seen edge-on
// The lamp is low, in front of the book: a rising recto turns away from it
// and darkens; the back of the leaf faces it as it stands up and flares,
// then settles to the flat page's light.
const rectoLit = (th) => 0.25 + 0.75 * kit.clamp(Math.cos(th) - 0.8 * Math.sin(th));
const PEAK = 1.8;
const versoLit = (th) => (th < PEAK ? 0.25 + 1.75 * kit.smoothstep(EDGE_ON, PEAK, th) : kit.lerp(2.0, 1.0, kit.smoothstep(PEAK, Math.PI, th)));
/** How far (slant mm from the spine) the shadow of a leaf at theta falls on the far page. */
const shadowOf = (th) => (th > EDGE_ON ? Math.min(D, 1.3 * D * Math.sin(th)) : 0);

const TURN = 2.2;                          // the minute's leaf
const RN = 10, RD = 0.15, RT = 0.85;       // the hour's riffle: leaves, stagger, each leaf's time
const turnEase = (p) => Math.PI * (0.5 - 0.5 * Math.cos(Math.PI * kit.clamp(p)));
// a riffled leaf slips off the thumb: it snaps up, then floats down
const riffleEase = (p) => Math.PI * (1 - (1 - kit.clamp(p)) ** 2.2);

/** The leaves in the air at `age` into minute M, plus what lies under them. */
function book(M, age) {
  const hour = new Date(M * 1000).getMinutes() === 0;
  const leaves = [];
  let far = farPage(M), near = nearPage(M);
  if (!hour) {
    if (age < TURN) {
      leaves.push({ th: turnEase(age / TURN), front: nearPage(M - 60), back: farPage(M) });
      far = farPage(M - 60);
    }
  } else if (age < (RN - 1) * RD + RT) {
    far = farPage(M - 60);
    let top = RN;                                     // the first leaf still lying on the near page
    for (let j = 0; j < RN; j++) {
      const p = (age - j * RD) / RT;
      const back = riffleBack(M, j, RN);
      if (p >= 1) { far = back; continue; }          // landed: the newest frame on the far page
      if (p <= 0) { top = Math.min(top, j); continue; }
      leaves.push({ th: riffleEase(p), front: riffleFront(M, j, RN), back, riffle: j > 0 });
    }
    if (top < RN) near = riffleFront(M, top, RN);
  }
  return { hour, leaves, far, near };
}

// ---------------------------------------------------------------- dog-ear
// The frog peels up the near page's bottom-right corner through the minute.
// Page coordinates (a, s); the corner is folded flat about the perpendicular
// bisector of corner and tip, so the flap is the corner mirrored.
const CORNER = [HALF, D];
const PEEL = [-0.45, -0.893];                 // the tip's way into the page (unit, page coords)
const TAU_MAX = 15;
const tipOf = (tau) => [CORNER[0] + PEEL[0] * tau, CORNER[1] + PEEL[1] * tau];
const HOLD_AT = 4.6, LET_GO = 58.3, DROP = 0.4;
const TUGS = 9;
function peel(age) {
  if (age < HOLD_AT) return [0, 0];
  if (age >= LET_GO) {                      // let go: the corner falls flat with a little bounce
    const u = kit.clamp((age - LET_GO) / DROP);
    const t0 = TAU_MAX;
    return [t0 * (1 - u * u) + (u >= 1 ? 0 : 0), 0];
  }
  const span = (LET_GO - 0.6 - HOLD_AT) / TUGS, q = (age - HOLD_AT) / span;
  const k = Math.min(TUGS - 1, Math.floor(q)), f = q - k;
  // each tug: lean back and pull (0.55 of a step), then hold
  const pull = kit.ease.inOut(kit.clamp(f / 0.55));
  const tau = TAU_MAX * Math.min(1, (k + pull) / TUGS);
  const lean = Math.sin(Math.PI * kit.clamp(f / 0.55));
  return [tau, lean];
}

// ------------------------------------------------------------------- frog
const A_GRIP = 13, D_GRIP = 0.55 * D;      // where he holds a leaf to haul it over
const ridePt = (th) => { const [wx, wy] = leafW(th); return [A_GRIP + D_GRIP * wx, D_GRIP * wy - 1.2]; };
const holdPt = (tau) => { const [a, s] = tipOf(tau + 4), [x, y] = scr(a, s); return [x - 2.5 * (1 - tau / TAU_MAX), y - 0.6]; };
const SEAM_STEP = [14.5, 1.0];

/** A hop from p to q over [t0, t0+dur]: position and squash. */
function hop(p, q, t0, dur, h, t) {
  const u = kit.clamp((t - t0) / dur), e = kit.ease.inOut(u);
  const x = kit.lerp(p[0], q[0], e), y = kit.lerp(p[1], q[1], e) - h * 4 * u * (1 - u);
  const sq = u <= 0 || u >= 1 ? 0 : 0.25 * Math.sin(u * Math.PI);   // stretch in the air
  return [x, y, -sq];
}

/** The frog at `age` into the minute: [x, y, squash (+ squashed, - stretched)]. */
function frogAt(age, hour) {
  const land = hour ? RT : TURN, back = hour ? (RN - 1) * RD + RT + 0.1 : land + 0.1;
  if (age < land) return [...ridePt((hour ? riffleEase : turnEase)(age / land)), 0];
  const L = ridePt(Math.PI), H0 = holdPt(0);
  if (age < back) return [L[0], L[1], 0.12 * Math.max(0, Math.sin((age - land) * 9))];  // bobs as the riffle flies
  if (age < back + 0.8) return hop(L, SEAM_STEP, back, 0.8, 5, age);
  if (age < back + 1.6) return hop(SEAM_STEP, H0, back + 0.8, 0.8, 4, age);
  if (age < LET_GO) { const [tau, lean] = peel(age); const [x, y] = holdPt(tau); return [x + 0.6 * lean, y + 0.5 * lean, 0.18 * lean]; }
  const G0 = holdPt(TAU_MAX);
  if (age < 58.75) return [G0[0], G0[1], 0];
  if (age < 59.35) return hop(G0, ridePt(0), 58.75, 0.6, 3, age);
  return [...ridePt(0), 0.22 * kit.smoothstep(59.35, 59.9, age)];         // crouch, ready to haul
}

/** Draw the frog doodle at (x, y): green body, pale belly, bright round eyes (his glasses). */
function drawFrog(ctx, col, x, y, sq, blink, gaze, dim) {
  const sx = 1 + 0.5 * sq, sy = 1 - sq;
  for (const i of ctx.layout.index.near(x, y, 10.5)) {
    const l = ctx.leds[i], dx = (l.x - x) / sx, dy = (l.y - y) / sy;
    const body = 1 - kit.smoothstep(0.8, 1.15, Math.hypot(dx / 5.6, (dy - 0.4) / 3.8));
    const feet = Math.max(...[-1, 1].map((s) => 1 - kit.smoothstep(0.7, 1.2, Math.hypot((dx - s * 5.2) / 2.0, (dy - 3.2) / 1.3))));
    const eyes = Math.max(...[-1, 1].map((s) => 1 - kit.smoothstep(0.6, 1.1, Math.hypot((dx - s * 3.0 - gaze[0]) / 1.8, (dy + 3.3 - gaze[1]) / 1.7))));
    const belly = 1 - kit.smoothstep(0.5, 1.1, Math.hypot(dx / 2.8, (dy - 1.9) / 1.6));
    const mouth = (1 - kit.smoothstep(0.3, 0.9, Math.abs(dy + 0.1 - 0.06 * dx * dx) / 1.1)) * (1 - kit.smoothstep(2.5, 4.2, Math.abs(dx)));
    const halo = 1 - kit.smoothstep(0.95, 1.3, Math.hypot(dx / 6.0, (dy - 0.2) / 4.6));
    const o = 3 * i;
    // a dark margin round him so he never reads as part of a numeral
    const keep = 1 - 0.85 * halo;
    col[o] *= keep; col[o + 1] *= keep; col[o + 2] *= keep;
    const g = Math.max(body, feet, eyes);
    if (g <= 0) continue;
    let c = kit.scale(FROG, 0.22);
    c = kit.mix(c, kit.scale(BELLY, 0.16), belly * body);
    c = kit.scale(c, 1 - 0.75 * mouth * body);                                  // the wide frog grin
    c = kit.mix(c, kit.scale(EYE, 0.42), eyes * (1 - blink));
    col[o] += c[0] * g * dim; col[o + 1] += c[1] * g * dim; col[o + 2] += c[2] * g * dim;
  }
}

// -------------------------------------------------------------------- fly
// A pencil-dot fly buzzes over the far page's margin. Once a minute the
// frog's tongue zips across the spine and takes it; a new one wanders in.
const FLY_HOME = [19.5, -9.5];             // the far page's empty margin
const catchAt = (M) => 22 + 18 * kit.hash(M, 7);
const TONGUE_OUT = 0.16, TONGUE_IN = 0.22;
function flyAt(now, M, age) {
  const t = now;
  const x = FLY_HOME[0] + 2.6 * Math.sin(t * 0.83) + 1.4 * Math.sin(t * 2.3 + 1) + 0.4 * Math.sin(t * 31);
  const y = FLY_HOME[1] + 3.6 * Math.sin(t * 1.21 + 2) + 1.4 * Math.cos(t * 2.9) + 0.4 * Math.cos(t * 27);
  const c = catchAt(M);
  if (age < c + TONGUE_OUT) return [x, y, 1];
  if (age < c + TONGUE_OUT + TONGUE_IN) return [x, y, -1];       // stuck to the tongue
  return [x, y, kit.smoothstep(c + 7, c + 9, age)];               // the next fly drifts in
}
/** The tongue: 0..1 how far out, at `age`. */
function tongueAt(M, age) {
  const c = catchAt(M);
  if (age < c || age > c + TONGUE_OUT + TONGUE_IN) return 0;
  return age < c + TONGUE_OUT ? kit.ease.out((age - c) / TONGUE_OUT) : 1 - kit.ease.in((age - c - TONGUE_OUT) / TONGUE_IN);
}
function splatCol(ctx, col, x, y, r, c, a) {
  for (const i of ctx.layout.index.near(x, y, r)) {
    const l = ctx.leds[i], d = Math.hypot(l.x - x, l.y - y) / r, f = a * (1 - d * d) ** 2;
    col[3 * i] += c[0] * f; col[3 * i + 1] += c[1] * f; col[3 * i + 2] += c[2] * f;
  }
}

// ------------------------------------------------------------------ frame
let geo = null;                              // per-LED page coordinates, once per layout
function geometry(leds) {
  if (geo && geo.n === leds.length) return geo;
  geo = { n: leds.length, a: new Float32Array(leds.length), s: new Float32Array(leds.length) };
  for (const l of leds) {
    const k = l.panel === 0 ? 7 - l.row : l.row, s = S0 + k * P;
    geo.s[l.i] = l.panel === 0 ? -s : s;     // signed: far negative
    geo.a[l.i] = (l.col - 7.5) * P;
  }
  return geo;
}
let col = new Float32Array(0);

export default {
  name: 'Flipbook',
  blurb: 'an open book: chapter = hour, page = minute; a frog dog-ears the page as the seconds pass, hauls it over, and riffles to each new chapter',
  layouts: ['para-stack'], look: { look: 'opal', gap: 1.3 }, fps: 60, brightness: 1, dither: true,
  frame(ctx) {
    const { leds, date } = ctx;
    const Gm = geometry(leds);
    if (col.length !== 3 * leds.length) col = new Float32Array(3 * leds.length);
    const now = date.getTime() / 1000, M = Math.floor(now / 60) * 60, age = now - M;
    const dim = 1 - 0.55 * ctx.night, pdim = 1 - 0.3 * ctx.night;   // at night the graphite dims more than the page
    const B = book(M, age);
    const [tau] = B.leaves.length ? [0] : peel(age);
    const tip = tipOf(tau), mid = [(CORNER[0] + tip[0]) / 2, (CORNER[1] + tip[1]) / 2], nrm = [-PEEL[0], -PEEL[1]];
    // leaves sorted back to front: the one nearest edge-on to the eye is in front
    const ls = B.leaves.map((L) => ({ ...L, w: leafW(L.th), lit: rectoLit(L.th) })).sort((p, q) => Math.abs(q.th - EDGE_ON) - Math.abs(p.th - EDGE_ON));
    const sweep = -55 + 110 * kit.fract(now / 11);       // the lamp's sheen sliding over the graphite

    for (const l of leds) {
      const i = l.i, c = l.col, j = l.row, far = l.panel === 0;
      const a = Gm.a[i], s = Math.abs(Gm.s[i]);
      const pg = far ? B.far : B.near;
      let lead = pg.lead[c * 8 + j], ink = pg.ink[c * 8 + j];
      let shade = 0.62 + 0.38 * kit.smoothstep(0, 8, s - S0);      // pages dip into the gutter
      // the dog-ear (near page)
      if (!far && tau > 0.5) {
        const e = (a - mid[0]) * nrm[0] + (s - mid[1]) * nrm[1];
        if (e > 0) { lead = 0; ink = 0; shade *= 0.2; }               // lifted: the page beneath, in its shadow
        else {
          const ra = a - 2 * e * nrm[0], rs = s - 2 * e * nrm[1];        // mirrored back onto the corner
          if (ra <= HALF && rs <= D) {
            const cov = kit.clamp(Math.min(HALF - ra, D - rs) / 1.2 + 0.5);
            lead *= 1 - cov; ink *= 1 - cov;
            shade = kit.lerp(shade, 8 - 3 * kit.smoothstep(0, 3, -e), cov);   // the flap catches the lamp; crease bright
          } else {
            // the flap's shadow just beyond its edge
            const ex = Math.min(ra - HALF, rs - D);
            shade *= 1 - 0.5 * (1 - kit.smoothstep(0, 2.2, ex)) * kit.smoothstep(-0.2, 0.8, -e);
          }
        }
      }
      // shadows of leaves in the air (lamp above the reader)
      for (const L of ls) {
        const ext = D * (L.lit);                                       // > 0: on the near page, < 0: on the far
        if ((ext > 0 && !far && s < ext) || (ext < 0 && far && s < -ext)) shade *= 0.3;
      }
      // the leaves themselves
      for (const L of ls) {
        const [wx, wy] = L.w;
        if (Math.abs(wy) < 1e-3) continue;
        const d = l.y / wy, aa = l.x - d * wx;
        if (d < 0 || d > D + 1 || Math.abs(aa) > HALF + 1) continue;
        const cov = kit.clamp(((D - d) * Math.abs(wy)) / 1.1 + 0.5) * kit.clamp((HALF - Math.abs(aa)) / 1.1 + 0.5);
        if (cov <= 0) continue;
        const recto = wy > 0, kk = (d - S0) / P, cc = aa / P + 7.5;
        const face = recto ? L.front : L.back, jj = recto ? kk : 7 - kk;
        // a rising page's graphite goes dark as it tilts off the lamp, so a
        // foreshortened minute never doubles up with the one beneath into
        // another number. The back carries the hour (still right) and shows
        // it as it opens; riffled backs keep theirs throughout.
        const gl = recto ? 1 - kit.smoothstep(0.04, 0.42, L.th) : L.riffle ? 1 : kit.smoothstep(EDGE_ON + 0.1, EDGE_ON + 0.7, L.th);
        const fl = gl * sample(face.lead, cc, jj), fi = gl * sample(face.ink, cc, jj);
        const edge = 1.4 * (1 - kit.smoothstep(0, 1.6, (D - d) * Math.abs(wy)));      // the free edge glints
        const sh = (recto ? L.lit : versoLit(L.th)) + edge;
        lead = kit.lerp(lead, fl, cov); ink = kit.lerp(ink, fi, cov); shade = kit.lerp(shade, sh, cov);
      }
      // compose: paper, then graphite glinting in a slow sweep of lamp light, then green ink
      const g = 0.72 + 0.75 * Math.exp(-(((0.8 * l.x + 0.6 * l.y - sweep) / 5) ** 2));
      const pv = PAPER_LV * shade * (1 - Math.max(lead, ink)) * pdim;
      const lv = LEAD_LV * lead * (0.5 + 0.5 * Math.min(shade, 1.2)) * g * dim;
      const iv = 0.36 * ink * (0.5 + 0.5 * Math.min(shade, 1.2)) * dim;
      const o = 3 * i;
      col[o] = PAPER[0] * pv + LEAD[0] * lv + INK[0] * iv;
      col[o + 1] = PAPER[1] * pv + LEAD[1] * lv + INK[1] * iv;
      col[o + 2] = PAPER[2] * pv + LEAD[2] * lv + INK[2] * iv;
    }

    const [fx, fy, sq] = frogAt(age, B.hour);
    const bl = kit.fract(now / 4.3 + 0.37 * kit.hash(M)) < 0.04 ? 1 : 0;
    const [qx, qy, qa] = flyAt(now, M, age), tg = tongueAt(M, age);
    const fy2 = fy + 0.25 * Math.sin(now * 2.4);
    // he watches the fly
    const gd = Math.hypot(qx - fx, qy - fy2) || 1, gaze = [0.35 * (qx - fx) / gd, 0.3 * (qy - fy2) / gd];
    const gulp = tg > 0 ? 0 : 0.2 * Math.max(0, Math.sin(Math.PI * kit.clamp((age - catchAt(M) - 0.38) / 0.5)));
    drawFrog(ctx, col, fx, fy2, sq + 0.04 * Math.sin(now * 2.4) + gulp, bl, gaze, dim);
    // the tongue, from his mouth to the fly
    if (tg > 0) {
      const mx = fx + 0.4 * gaze[0], my = fy2 - 0.2, tx = kit.lerp(mx, qx, tg), ty = kit.lerp(my, qy, tg);
      const n = Math.ceil(Math.hypot(tx - mx, ty - my) / 1.2);
      for (let k = 0; k <= n; k++) splatCol(ctx, col, kit.lerp(mx, tx, k / n), kit.lerp(my, ty, k / n), 1.7, TONGUE, 0.3 * dim);
    }
    // the fly: a pencil dot with a shimmer of wings
    if (qa !== 0) {
      const tg2 = qa < 0 ? tg : 1;
      const px = qa < 0 ? kit.lerp(fx, qx, tg2) : qx, py = qa < 0 ? kit.lerp(fy2, qy, tg2) : qy;
      const A = Math.abs(qa) * dim;
      splatCol(ctx, col, px, py, 2.0, LEAD, 0.42 * A);
      splatCol(ctx, col, px + 0.8 * Math.sin(now * 90), py - 1.4, 1.8, [0.5, 0.6, 0.8], 0.12 * A * (0.5 + 0.5 * Math.sin(now * 70)));
    }

    for (let i = 0; i < leds.length; i++) kit.set(ctx, i, [col[3 * i], col[3 * i + 1], col[3 * i + 2]]);
  },
};
