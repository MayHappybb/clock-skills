// Atelier: a rainbow frog in round glasses paints the time on its easel.
//
// The time is a painting. Each digit is a brush-script numeral laid down
// stroke by stroke in stroke order by the frog's brush (the tip you see is
// where the paint is going on). Wet paint glistens under the studio lamp and
// dries over the following minute. At a minute turn the frog paints over the
// old digit with ground colour, then paints the new one. Before the hour it
// steps back, admires, signs the canvas, flings the finished painting off
// the easel and a fresh canvas in a new colour scheme drops in; then it
// paints the whole time anew. Between turns it breathes, blinks, taps its
// brush, pushes up its glasses, stirs its palette and hunts fireflies.
import * as kit from '../js/kit.js';
import { GLYPHS, pointAt } from './atelier-glyphs.js';
import { W, H, img, over, ellipse, capsule, ring, paintGlyph, pool, drips, LIGHT } from './atelier-paint.js';

const hx = kit.hex;
// six canvases, one per hour in turn: ground, hour paint, minute paint, accent (signature)
const SCHEMES = [
  { ground: hx('#2c3466'), hour: hx('#ffc23a'), min: hx('#ff7a3c'), acc: hx('#9fe8ff') },   // nocturne
  { ground: hx('#5a1c38'), hour: hx('#ffd9a0'), min: hx('#ff6fa8'), acc: hx('#7dffc4') },   // rose
  { ground: hx('#173f30'), hour: hx('#e6ff5a'), min: hx('#ffb03a'), acc: hx('#ff8d7a') },   // forest
  { ground: hx('#3f2160'), hour: hx('#5ff2d6'), min: hx('#ff7ad9'), acc: hx('#fff07a') },   // plum
  { ground: hx('#4a3214'), hour: hx('#7ab0ff'), min: hx('#fff0d2'), acc: hx('#ff5a3c') },   // ochre
  { ground: hx('#22323e'), hour: hx('#ff5a3c'), min: hx('#ffd23a'), acc: hx('#c9f0ff') },   // slate
];
for (const S of SCHEMES) S.ground = kit.scale(S.ground, 1.5);   // lift the grounds out of the stepping dim end
const schemeOf = (hour) => SCHEMES[hour % SCHEMES.length];

// ------------------------------------------------------------------ scene
const CANVAS = [23.6, 1.4, 63.4, 46];                    // x0, y0, x1, y1 (px)
const SLOT = [[25.4, 4.0], [43.4, 4.0], [25.4, 23.5], [43.4, 23.5]];   // glyph box origins
const WOOD = hx('#4a2a12'), WOOD_LIT = hx('#7a4a22'), HANDLE = hx('#c0783a'), PALW = hx('#b8834a'), STEEL = hx('#8a8f9a');
const SCLERA = [0.8, 0.8, 0.74], GOLD = hx('#ffcf6a'), INK = [0, 0, 0], TONGUE = hx('#ff6f86'), FLY = hx('#d8ff6a');
const SIGN = [[0, 1.4], [0.8, 0], [1.3, 1.6], [2.1, 0.3], [2.6, 1.7], [3.5, 0.5], [4.4, 1.3], [5.6, 0.9]];
const SIGN_AT = [55.6, 42.6];

// rainbow frog skin by pixel row, and its pale belly
const SKIN = new Float32Array(3 * H), BELLY = new Float32Array(3 * H);
for (let y = 0; y < H; y++) {
  const hue = kit.clamp((y - 27) / 36) * 0.78;
  const c = kit.hsv(hue, 0.8, 0.72), b = kit.hsv(hue, 0.3, 0.84);
  for (let k = 0; k < 3; k++) { SKIN[3 * y + k] = c[k]; BELLY[3 * y + k] = b[k]; }
}
const ARM = [SKIN[3 * 47], SKIN[3 * 47 + 1], SKIN[3 * 47 + 2]];
const PALM = [SKIN[3 * 52], SKIN[3 * 52 + 1], SKIN[3 * 52 + 2]];
// the canvas ground: an uneven wash, fixed
const WASH = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) WASH[y * W + x] = 0.86 + 0.24 * kit.fbm(x * 0.13, y * 0.13, 3.1, 3) + 0.04 * ((x + y) & 1);

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());

// --------------------------------------------------- stroke-order painting
const LIFT = 3.2;                                  // px-equivalents of a brush lift between strokes
const PROG = new Float32Array(4), FULL = new Float32Array([999, 999, 999, 999]), NONE = new Float32Array(4);
let TX = 0, TY = 0, TLIFT = 0;
/** Progress u (0..1) through digit d: fills PROG, puts the tip in TX, TY. */
function paintProg(d, u) {
  const g = GLYPHS[d], n = g.strokes.length;
  let e = kit.clamp(u) * (g.len + LIFT * (n - 1));
  PROG.fill(0); TLIFT = 0;
  for (let k = 0; k < n; k++) {
    const st = g.strokes[k];
    if (e <= st.L || k === n - 1) {
      PROG[k] = Math.min(e, st.L);
      [TX, TY] = pointAt(st, PROG[k]);
      return PROG;
    }
    PROG[k] = st.L; e -= st.L;
    if (e < LIFT) {                                  // in the air, travelling to the next stroke
      const a = pointAt(st, st.L), b = pointAt(g.strokes[k + 1], 0), f = kit.smoothstep(0, 1, e / LIFT);
      TX = kit.lerp(a[0], b[0], f); TY = kit.lerp(a[1], b[1], f); TLIFT = Math.sin(Math.PI * f);
      return PROG;
    }
    e -= LIFT;
  }
  return PROG;
}
const easeStroke = (u) => u - Math.sin(2 * Math.PI * u) / (2 * Math.PI) * 0.55;

// ------------------------------------------------------------ the brush track
// A minute's choreography: segments in seconds-of-minute with a pose kind.
// Between segments the brush travels, eased, on a little arc.
const REST = [30.5, 46.2, 0.06];                  // resting on the easel ledge, under the minute digits
function buildTrack(sec0, minute, cur, prev, catchAt) {
  const T = [];
  const isHour = minute === 0, isPre = minute === 59;
  if (isHour) {
    T.push({ a: -1, b: 0.02, kind: 'tada' });
    for (let j = 0; j < 4; j++) T.push({ a: 0.42 + j * 0.78, b: 0.42 + j * 0.78 + 0.62, kind: 'paint', slot: j, d: +cur[j] });
  } else {
    T.push({ a: -1, b: 0.02, kind: 'rest' });
    // paint out every changed digit first, then paint the new ones: never a wrong mix
    let t0 = 0.05;
    const ch = [0, 1, 2, 3].filter((j) => cur[j] !== prev[j]);
    for (const j of ch) { T.push({ a: t0 + 0.2, b: t0 + 0.56, kind: 'scrub', slot: j, d: +prev[j] }); t0 += 0.56; }
    for (const j of ch) { T.push({ a: t0 + 0.2, b: t0 + 0.92, kind: 'paint', slot: j, d: +cur[j] }); t0 += 0.92; }
  }
  const after = T[T.length - 1].b + 0.4;
  T.push({ a: after, b: 1e9, kind: 'rest' });
  // idle business, placed where nothing else is happening
  const g = 9 + 5 * kit.hash(sec0, 2);               // push up the glasses
  const dp = 44 + 4 * kit.hash(sec0, 3);             // stir the palette
  const idle = [{ a: g, b: g + 0.7, kind: 'glasses' }, { a: dp, b: dp + 1.4, kind: 'dip' }];
  if (isPre) idle.push({ a: 55.6, b: 57.1, kind: 'admire' }, { a: 57.45, b: 58.95, kind: 'sign' }, { a: 59.25, b: 61, kind: 'tada' });
  // split the final rest around the idle segments
  const out = T.slice(0, -1);
  let from = after;
  for (const s of idle) {
    if (catchAt && Math.abs(s.a - catchAt) < 2.5) s.a += 5, s.b += 5;
    out.push({ a: from, b: s.a - 0.45, kind: 'rest' }, s);
    from = s.b + 0.45;
  }
  out.push({ a: from, b: 1e9, kind: 'rest' });
  return out;
}

let PA = 0;                                          // brush angle out of pose()
let SCRUB = { slot: -1, y: -1e9 }, PAINTING = { slot: -1, u: 0 };
function pose(s, t) {
  const u = kit.clamp((t - s.a) / (s.b - s.a));
  switch (s.kind) {
    case 'rest': {
      const tap = Math.max(0, Math.sin(t * Math.PI * 2 / 2.6)) ** 10;
      TX = REST[0]; TY = REST[1] + 0.9 * tap; PA = REST[2]; return;
    }
    case 'glasses': TX = 11.3; TY = 26.0 + 1.2 * Math.sin(Math.PI * u); PA = -1.75; return;
    case 'dip': TX = 8.4 + 1.0 * Math.cos(t * 8); TY = 55.4 + 0.5 * Math.sin(t * 8); PA = -0.55; return;
    case 'admire': TX = 24.2 + 0.4 * Math.sin(t * 3); TY = 43.6; PA = -0.35; return;
    case 'tada': TX = 20.5; TY = 13 + 0.8 * Math.sin(t * 7); PA = -1.15; return;
    case 'sign': {
      const e = kit.ease.inOut(u) * (SIGN.length - 1), k = Math.min(SIGN.length - 2, Math.floor(e)), f = e - k;
      TX = SIGN_AT[0] + kit.lerp(SIGN[k][0], SIGN[k + 1][0], f); TY = SIGN_AT[1] + kit.lerp(SIGN[k][1], SIGN[k + 1][1], f); PA = -0.8; return;
    }
    case 'scrub': {
      const gb = GLYPHS[s.d].bbox, [ox, oy] = SLOT[s.slot];
      const x0 = ox + gb[0] + 1, x1 = ox + gb[2] - 1, y0 = oy + gb[1] + 1, y1 = oy + gb[3];
      const q = kit.ease.inOut(u), zz = Math.abs(((q * 4.5) % 2) - 1);
      TX = kit.lerp(x0, x1, 1 - zz); TY = kit.lerp(y0, y1, q); PA = -0.8;
      SCRUB = { slot: s.slot, y: u <= 0 ? -1e9 : TY + 1 };
      return;
    }
    case 'paint': {
      paintProg(s.d, easeStroke(u));
      TX += SLOT[s.slot][0]; TY += SLOT[s.slot][1] - 0.8 * TLIFT; PA = -0.8;
      PAINTING = { slot: s.slot, u };
      return;
    }
  }
}
/** Brush tip and angle at second t of the minute along track T. */
function brushAt(T, t) {
  let i = 0;
  while (i < T.length - 1 && t >= T[i + 1].a) i++;
  const s = T[i];
  if (t <= s.b || i === T.length - 1) { pose(s, t); return s; }
  // travelling from the end of s to the start of the next
  const n = T[i + 1];
  pose(s, s.b); const ax = TX, ay = TY, aa = PA;
  pose(n, n.a); const bx = TX, by = TY, ba = PA;
  const f = kit.ease.inOut(kit.clamp((t - s.b) / (n.a - s.b)));
  const arc = Math.sin(Math.PI * f) * Math.min(5, Math.hypot(bx - ax, by - ay) * 0.25);
  TX = kit.lerp(ax, bx, f); TY = kit.lerp(ay, by, f) - arc; PA = kit.lerp(aa, ba, f);
  SCRUB = { slot: -1, y: -1e9 }; PAINTING = { slot: -1, u: 0 };
  return f < 0.5 ? s : n;
}

// ---------------------------------------------------------------- fireflies
function flyPath(t) {
  return [31 + 25 * Math.sin(0.23 * t) + 4 * Math.sin(1.3 * t + 1), 19 + 12 * Math.sin(0.17 * t + 2) + 3 * Math.cos(1.1 * t)];
}
// when, in a minute, the firefly strays close enough to the frog to be caught (0 = it doesn't)
const MOUTH = [21, 40];
const catches = new Map();
function catchTime(M) {
  if (catches.has(M)) return catches.get(M);
  let best = 0, bd = 15;
  for (let s = 14; s <= 42; s += 0.1) {
    const [x, y] = flyPath(M + s);
    const d = Math.hypot(x - MOUTH[0], y - MOUTH[1]);
    if (x < 25 && y < 34 && d < bd) { bd = d; best = s; }
  }
  if (catches.size > 8) catches.clear();
  catches.set(M, best);
  return best;
}

// ------------------------------------------------------------------ drawing
function rect(x0, y0, x1, y1, col, wash, a = 1) {
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
    const cy = kit.clamp(Math.min(y - y0 + 0.5, y1 - y + 0.5));
    if (cy <= 0) continue;
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) {
      const c = cy * kit.clamp(Math.min(x - x0 + 0.5, x1 - x + 0.5));
      if (c <= 0) continue;
      const k = wash ? WASH[y * W + x] : 1;
      over(x, y, col[0] * k, col[1] * k, col[2] * k, c * a);
    }
  }
}

/** Ground-colour overpaint over slot j's old digit: zigzag passes, glossy while wet. */
function overpaint(j, P, ground, dx, dy, t) {
  const gb = GLYPHS[P.d].bbox, ox = SLOT[j][0] + dx, oy = SLOT[j][1] + dy;
  const x0 = ox + gb[0] + 0.5, x1 = ox + gb[2] - 0.5, y0 = oy + gb[1] + 0.5, y1 = Math.min(oy + gb[3], P.y);
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
    const pass = Math.floor((y - y0) / 2.2);
    const cy = kit.clamp(Math.min(y - y0 + 0.5, y1 - y + 0.5));
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) {
      // ragged ends to each pass, and bristle streaks along it
      const e = 0.8 * kit.hash(pass, j, 1) + 0.5 * kit.hash(y, j, 2);
      const c = cy * kit.clamp(Math.min(x - x0 + 0.5 - e, x1 - x + 0.5 - e * 0.7));
      if (c <= 0) continue;
      const st = 0.75 + 0.5 * kit.hash(y, Math.floor(x / 3), j);
      const sheen = P.wet * (0.55 + 0.45 * Math.sin(x * 0.7 - t * 2 + y));
      const k = WASH[y * W + x] * (1.08 + P.wet * 0.3 * st);
      const hl = 0.07 * sheen * ((y - y0) % 2.2 < 0.9 ? 1 : 0.3);    // wet ridge along each pass
      over(x, y, ground[0] * k + hl, ground[1] * k + hl, ground[2] * k + hl * 0.8, c);
    }
  }
}

/** One canvas on the easel, offset (dx, dy), with its four slots. */
function drawCanvas(dx, dy, sch, slots, signU, t) {
  const [x0, y0, x1, y1] = CANVAS;
  const X0 = x0 + dx, Y0 = y0 + dy, X1 = x1 + dx, Y1 = y1 + dy;
  rect(X0 - 0.4, Y0 - 0.4, X1 + 0.4, Y1 + 0.4, kit.scale(sch.ground, 1.9), false);   // stretched edge, lit
  rect(X0 + 0.6, Y0 + 0.6, X1, Y1, sch.ground, true);
  const clip = [Math.floor(X0), Math.floor(Y0), Math.ceil(X1) + 1, Math.ceil(Y1) + 1];
  for (let j = 0; j < 4; j++) {
    const s = slots[j];
    if (!s) continue;
    if (s.patch && s.patch.wet > 0.01) overpaint(j, s.patch, sch.ground, dx, dy, t);
    if (s.d < 0) continue;
    const col = j < 2 ? sch.hour : sch.min;
    paintGlyph(j, s.d, s.prog, SLOT[j][0] + dx, SLOT[j][1] + dy, col, s.wet, t, clip, s.scrubY ?? -1e9);
    if (s.dripAge > 0 && s.scrubY === undefined) drips(j, s.d, SLOT[j][0] + dx, SLOT[j][1] + dy, kit.scale(col, 0.9), s.dripAge, j < 2 ? 1.4 : 3.2, clip);
  }
  if (signU > 0) {
    const e = signU * (SIGN.length - 1);
    for (let k = 0; k + 1 < SIGN.length && k < e; k++) {
      const f = Math.min(1, e - k);
      const ax = SIGN_AT[0] + SIGN[k][0] + dx, ay = SIGN_AT[1] + SIGN[k][1] + dy;
      capsule(ax, ay, kit.lerp(ax, SIGN_AT[0] + SIGN[k + 1][0] + dx, f), kit.lerp(ay, SIGN_AT[1] + SIGN[k + 1][1] + dy, f), 0.5, sch.acc, 0.9);
    }
  }
}

function drawFrog(F) {
  const { dx, dy, br } = F;
  const hy = dy + 0.25 * br;
  // a dark outline round the whole silhouette, so the frog stands off the canvas
  ellipse(5.5, 62.4, 4.9, 2.4, INK); ellipse(17.6, 62.4, 4.9, 2.4, INK);
  ellipse(11.5 + dx, 52.8 + dy, 10.4 + 0.25 * br, 10.0, INK);
  ellipse(12.6 + dx, 39.6 + hy, 12.4, 8.4, INK);
  ellipse(7.6 + dx, 33.4 + hy, 6.0, 5.8, INK); ellipse(18.0 + dx, 33.4 + hy, 6.0, 5.8, INK);
  // feet stay planted
  ellipse(5.5, 62.4, 3.9, 1.5, SKIN, 1, 0.5); ellipse(17.6, 62.4, 3.9, 1.5, SKIN, 1, 0.5);
  // body and belly
  ellipse(11.5 + dx, 52.8 + dy, 9.4 + 0.25 * br, 9.0 + 0.15 * br, SKIN, 1, 0.55);
  ellipse(13.4 + dx, 54.6 + dy, 5.8 + 0.3 * br, 6.4, BELLY, 0.85, 0.3);
  // palette arm and palette
  const px = dx * 0.6, py = dy * 0.6 - F.palLift;
  capsule(4.2 + dx, 49 + dy, 3.4 + px, 56.6 + py, 1.4, PALM);
  ellipse(5.6 + px, 57.6 + py, 8.5, 4.0, INK);
  ellipse(5.6 + px, 57.6 + py, 7.6, 3.2, PALW, 1, 0.5);
  ellipse(1.6 + px, 57.9 + py, 1.0, 0.8, [0, 0, 0], 1);
  const S = F.sch, blobs = [[kit.scale(S.ground, 2.6), 4.7, 55.7], [S.hour, 8.0, 55.4], [S.min, 10.9, 56.6], [S.acc, 7.6, 58.6]];
  for (const [c, bx, by] of blobs) ellipse(bx + px, by + py, 1.5, 1.15, c, 1, 0.6);
  ellipse(3.2 + px, 57.6 + py, 1.3, 1.2, PALM, 1, 0.4);    // thumb through the hole
  // throat pouch, glowing after a firefly
  ellipse(14.6 + dx, 46.0 + hy, 4.6 + 0.6 * br, 2.2 + 0.5 * br, BELLY, 1, 0.3);
  if (F.glow > 0) ellipse(14.6 + dx, 46.0 + hy, 4.2, 2.4, FLY, 0.55 * F.glow, 0, true);
  // reaching up past its head, the painting arm goes behind it
  if (F.armBehind) {
    F.armBehind();
    ellipse(12.6 + dx, 38.6 + hy, 12.4, 7.4, INK);
    ellipse(7.6 + dx, 33.4 + hy, 6.0, 5.8, INK); ellipse(18.0 + dx, 33.4 + hy, 6.0, 5.8, INK);
  }
  // head
  ellipse(12.6 + dx, 39.6 + hy, 11.4, 7.4, SKIN, 1, 0.5);
  // eye bumps, eyes, glasses
  const gx = F.gaze[0], gy = F.gaze[1];
  for (const ex of [7.6, 18.0]) {
    const cx = ex + dx, cy = 33.4 + hy;
    ellipse(cx, cy, 5.0, 4.8, SKIN, 1, 0.6);
    const lid = F.lid;
    if (lid < 0.92) {
      ellipse(cx, cy + 0.3, 3.4, 3.4 * (1 - lid), SCLERA, 1, 0.25);
      const ox = kit.clamp(gx - cx, -1, 1) * 1.3, oy = kit.clamp(gy - cy, -1, 1) * 1.1 * (1 - lid);
      ellipse(cx + ox, cy + 0.3 + oy, 1.8, 1.9 * (1 - lid), [0, 0, 0], 1);
      ellipse(cx + ox - 0.6, cy - 0.3 + oy, 0.55, 0.55, [1, 1, 1], 0.9 * (1 - lid));
    } else capsule(cx - 3, cy + 0.6, cx + 3, cy + 0.6, 0.5, [0, 0, 0]);
  }
  const gl = -F.glasses;
  // round black frames, the owner's own
  ring(7.6 + dx, 33.6 + hy + gl, 4.1, 0.75, INK);
  ring(18.0 + dx, 33.6 + hy + gl, 4.1, 0.75, INK);
  capsule(11.4 + dx, 33.0 + hy + gl, 14.2 + dx, 33.0 + hy + gl, 0.6, INK);
  capsule(3.3 + dx, 33.4 + hy + gl, 1.6 + dx, 35.0 + hy, 0.6, INK);
  if (F.shine > 0) for (const ex of [7.6, 18.0]) capsule(ex - 2 + dx + F.shine * 4, 31 + hy + gl, ex - 3 + dx + F.shine * 4, 32.5 + hy + gl, 0.4, [1, 1, 1], 0.6 * Math.sin(Math.PI * F.shine));
  // smile, open at the front when the tongue is out
  for (let k = 0; k < 8; k++) {
    const u0 = k / 8, u1 = (k + 1) / 8;
    const y = (u) => 41.0 + 1.4 * Math.sin(Math.PI * u) - 0.8 * u;
    capsule(4.4 + 17.5 * u0 + dx, y(u0) + hy, 4.4 + 17.5 * u1 + dx, y(u1) + hy, 0.7, INK);
  }
  if (F.mouth > 0) ellipse(20.6 + dx, 41.2 + hy, 1.6, 1.3 * F.mouth, [0, 0, 0], 1);
  ellipse(20.2 + dx, 43.0 + hy, 1.5, 1.0, TONGUE, 0.35);   // cheek blush
  return [20.8 + dx, 41.2 + hy];                           // the mouth, for the tongue
}

function drawArm(F, tx, ty, ang, col) {
  const dxr = Math.cos(ang), dyr = Math.sin(ang);
  const hx0 = tx - 7.4 * dxr, hy0 = ty - 7.4 * dyr;
  const sx = 19.6 + F.dx, sy = 47.6 + F.dy;
  const L = Math.hypot(hx0 - sx, hy0 - sy) || 1;
  const bend = 1.5 + Math.max(0, 10 - L) * 0.35;
  const mx = (sx + hx0) / 2 + ((hy0 - sy) / L) * bend, my = (sy + hy0) / 2 - ((hx0 - sx) / L) * bend * -1 + bend * 0.6;
  for (let pass = 0; pass < 2; pass++) {
    let px = sx, py = sy;
    for (let k = 1; k <= 8; k++) {
      const u = k / 8, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      const qx = a * sx + b * mx + c * hx0, qy = a * sy + b * my + c * hy0;
      if (pass) capsule(px, py, qx, qy, 1.2, ARM, 1); else if (k > 2) capsule(px, py, qx, qy, 2.1, INK, 1);
      px = qx; py = qy;
    }
    if (!pass) { capsule(hx0 - 3 * dxr, hy0 - 3 * dyr, tx, ty, 1.4, INK); ellipse(hx0, hy0, 2.4, 2.4, INK); }
  }
  capsule(hx0 - 3 * dxr, hy0 - 3 * dyr, hx0 + 4 * dxr, hy0 + 4 * dyr, 0.6, HANDLE);
  capsule(hx0 + 4 * dxr, hy0 + 4 * dyr, hx0 + 5.2 * dxr, hy0 + 5.2 * dyr, 0.7, STEEL);
  capsule(hx0 + 5.2 * dxr, hy0 + 5.2 * dyr, tx, ty, 0.8, col);
  ellipse(tx, ty, 0.8, 0.8, kit.mix(col, [1, 1, 1], 0.2), 1);
  ellipse(hx0, hy0, 1.6, 1.6, ARM, 1, 0.5);
}

// ------------------------------------------------------------------- frame
export default {
  name: 'Atelier',
  blurb: 'a rainbow frog in round glasses paints the time stroke by stroke; a fresh canvas every hour',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx);
    if (!G) return;
    img.fill(0);
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, sec = now - M;
    const curD = ctx.date, prevD = new Date((M - 60) * 1000);
    const cur = digitsOf(curD), prev = digitsOf(prevD);
    const minute = curD.getMinutes(), hour = curD.getHours();
    const rel = minute === 59 ? sec - 60 : minute === 0 ? sec : null;   // seconds from the hour
    const catchAt = catchTime(M);

    // -------- brush
    SCRUB = { slot: -1, y: -1e9 }; PAINTING = { slot: -1, u: 0 };
    const T = buildTrack(M / 60, minute, cur, prev, catchAt);
    const seg = brushAt(T, sec);
    const tipX = TX, tipY = TY, tipA = PA;
    const scrub = SCRUB, painting = PAINTING;
    const sch = schemeOf(hour), nextSch = schemeOf(hour + 1);
    const brushCol = seg.kind === 'scrub' ? kit.scale(sch.ground, 2.6) : seg.kind === 'sign' ? sch.acc : seg.kind === 'paint' && seg.slot < 2 ? sch.hour : sch.min;

    // -------- the firefly: a wandering light, and sometimes supper
    let crouch = 0;
    // firefly and its fate
    let fly = flyPath(now), flyOn = true, tongue = 0, glow = 0, gulp = 0;
    if (catchAt) {
      const c = sec - catchAt;
      if (c >= 0 && c < 0.12) tongue = c / 0.12;
      else if (c >= 0.12 && c < 0.17) tongue = 1;
      else if (c >= 0.17 && c < 0.42) { tongue = 1 - kit.ease.inOut((c - 0.17) / 0.25); }
      if (c >= 0) {
        const at = flyPath(M + catchAt);
        fly = at; if (c >= 0.42 && c < 4) flyOn = false;
        glow = c >= 0.3 ? Math.exp(-(c - 0.3) / 2.2) * kit.clamp((c - 0.3) / 0.2) : 0;
        gulp = c >= 0.42 && c < 0.9 ? Math.sin(Math.PI * (c - 0.42) / 0.48) : 0;
        if (c >= 4 && c < 7) {
          const f = kit.ease.inOut((c - 4) / 3), live = flyPath(now);
          fly = [kit.lerp(-4, live[0], f), kit.lerp(live[1] + 6, live[1], f)];
        } else if (c >= 7) fly = flyPath(now);
      }
      if (c > -1.1 && c < 0) crouch = 0.8 * kit.smoothstep(-1.1, -0.2, c);   // crouch to spring
    }
    const pulse = 0.35 + 0.65 * Math.sin(now * 2.1) ** 2;
    LIGHT.x = fly[0]; LIGHT.y = fly[1]; LIGHT.a = flyOn ? 0.9 * pulse : 0; LIGHT.col = FLY;

    // -------- the canvas(es)
    // how long ago each slot was painted (closed form: ones every minute, tens every ten, the hour once)
    const paintedAgo = (j) => {
      const age = j === 3 ? sec : j === 2 ? (minute % 10) * 60 + sec : minute * 60 + sec;
      const pt = T.find((s) => s.kind === 'paint' && s.slot === j);
      return pt && age < 60 ? sec - pt.b : age;
    };
    const wetFor = (j) => Math.exp(-Math.max(0, paintedAgo(j)) / 22);
    const slots = [0, 1, 2, 3].map((j) => {
      const changed = minute === 0 ? true : cur[j] !== prev[j];
      if (!changed) return { d: +cur[j], prog: FULL, wet: wetFor(j), dripAge: paintedAgo(j) };
      const sc = T.find((s) => s.kind === 'scrub' && s.slot === j), pt = T.find((s) => s.kind === 'paint' && s.slot === j);
      // the band of fresh ground colour laid over the old digit, wet then drying
      const patch = sc && sec >= sc.a ? { y: sec < sc.b ? scrub.y : 1e9, wet: sec < sc.b ? 1 : Math.exp(-(sec - sc.b) / 5), d: +prev[j] } : null;
      if (sc && sec < sc.b) return { d: +prev[j], prog: FULL, wet: 0.2, scrubY: scrub.slot === j ? scrub.y : -1e9, dripAge: 0, patch };
      if (sec >= pt.b) return { d: +cur[j], prog: FULL, wet: wetFor(j), dripAge: sec - pt.b, patch };
      if (sec < pt.a) return { d: -1, patch };
      return { d: +cur[j], prog: paintProg(+cur[j], easeStroke((sec - pt.a) / (pt.b - pt.a))).slice(), wet: 1, patch };
    });
    // easel legs behind
    capsule(43.2, 0, 27.6, 63.5, 0.8, WOOD); capsule(43.2, 0, 59.4, 63.5, 0.8, WOOD);
    if (rel !== null && rel < 0) {
      // the finished painting is signed, then flung off to the right; a fresh canvas drops in
      const signU = kit.clamp((sec - 57.45) / 1.5);
      if (rel > -0.45) drawCanvas(0, -46 * (1 - kit.ease.outBack(kit.clamp((rel + 0.45) / 0.6))), nextSch, [null, null, null, null], 0, now);
      const ox = 44 * kit.ease.in(kit.clamp((rel + 0.75) / 0.65));
      if (rel < -0.1) drawCanvas(ox, -3 * Math.sin(Math.PI * kit.clamp((rel + 0.75) / 0.65)), sch, slots, kit.ease.inOut(signU), now);
      if (rel > -0.45) drawCanvas(0, -46 * (1 - kit.ease.outBack(kit.clamp((rel + 0.45) / 0.6))), nextSch, [null, null, null, null], 0, now);
    } else if (rel !== null && rel < 0.15) {
      drawCanvas(0, -46 * (1 - kit.ease.outBack(kit.clamp((rel + 0.45) / 0.6))), sch, slots, 0, now);
    } else drawCanvas(0, 0, sch, slots, 0, now);
    capsule(23.2, 46.9, 63.5, 46.9, 0.9, WOOD_LIT);           // the easel's ledge
    if (flyOn) pool(fly[0], fly[1], 8, FLY, 0.035 * pulse);    // its glow on whatever is near

    // -------- the frog
    let leanX = kit.clamp((tipX - 28) / 30) * 1.4, leanY = -kit.clamp((40 - tipY) / 36) * 3 + crouch;
    const br = Math.sin(now * Math.PI * 2 / 3.4);
    if (seg.kind === 'admire' || seg.kind === 'tada') { leanX = -1.3; leanY = -0.6; }
    // blink every few seconds, squeeze shut on a gulp
    const bb = Math.floor(now / 4.3), bu = (now - bb * 4.3 - 4.3 * 0.8 * kit.hash(bb, 9)) / 0.2;
    let lid = bu > 0 && bu < 1 ? Math.sin(Math.PI * bu) : 0;
    lid = Math.max(lid, gulp);
    if (seg.kind === 'admire') lid = Math.max(lid, 0.35);
    // glasses slide down slowly and are pushed back up
    const gp = T.find((s) => s.kind === 'glasses');
    // (positive = slid down the nose)
    const glasses = sec < gp.a + 0.25 ? 0.9 : sec < gp.b ? kit.lerp(0.9, -0.3, kit.smoothstep(gp.a + 0.25, gp.b, sec)) : -0.3 + 1.2 * kit.clamp((sec - gp.b - 4) / 30);
    const gaze = seg.kind === 'paint' || seg.kind === 'scrub' || seg.kind === 'sign' ? [tipX, tipY]
      : seg.kind === 'admire' || seg.kind === 'tada' ? [43, 22] : flyOn ? fly : [43, 22];
    const F = {
      dx: leanX, dy: leanY - 0.7 * gulp, br, sch: rel !== null && rel > -0.45 && rel < 0 ? nextSch : sch,
      palLift: seg.kind === 'dip' ? 0.8 : 0, glow, lid, glasses, gaze, mouth: tongue > 0 ? 1 : 0,
      shine: kit.clamp((sec - 31) / 1.2) * (sec < 32.2 ? 1 : 0),
    };
    // the hand goes behind the head when it is up beside it (but not when it pushes the glasses)
    const handY = tipY - 7.4 * Math.sin(tipA), handX = tipX - 7.4 * Math.cos(tipA);
    const behind = seg.kind !== 'glasses' && handY < 40 && handX < 26;
    if (behind) F.armBehind = () => drawArm(F, tipX, tipY, tipA, brushCol);
    const mouth = drawFrog(F);
    if (!behind) drawArm(F, tipX, tipY, tipA, brushCol);
    if (tongue > 0) {
      const ex = kit.lerp(mouth[0], fly[0], tongue), ey = kit.lerp(mouth[1], fly[1], tongue);
      capsule(mouth[0], mouth[1], ex, ey, 0.7, TONGUE);
      ellipse(ex, ey, 1.2, 1.2, TONGUE, 1, 0.4);
      if (sec - catchAt >= 0.12) fly = [ex, ey];
    }
    if (flyOn) {
      ellipse(fly[0], fly[1], 2.4, 2.4, FLY, 0.3 * pulse, 0, true);
      ellipse(fly[0], fly[1], 1.0, 1.0, kit.mix(FLY, [1, 1, 1], 0.35), 0.7 * pulse + 0.3, 0, true);
      // wings: two faint flickers either side
      const wf = 0.25 * Math.abs(Math.sin(now * 40));
      ellipse(fly[0] - 1.2, fly[1] - 1.0, 0.7, 0.5, [0.6, 0.65, 0.7], wf, 0, true);
      ellipse(fly[0] + 1.2, fly[1] - 1.0, 0.7, 0.5, [0.6, 0.65, 0.7], wf, 0, true);
    }

    // -------- out
    const dim = 1 - 0.55 * ctx.night, idx = G.idx, o = ctx.out;
    for (let p = 0; p < idx.length; p++) {
      const i = idx[p];
      if (i < 0) continue;
      o[3 * i] = img[3 * p] * dim; o[3 * i + 1] = img[3 * p + 1] * dim; o[3 * i + 2] = img[3 * p + 2] * dim;
    }
  },
};
