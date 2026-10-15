// Metamorphosis: the glass is a woodcut strip after Escher, a regular
// division of the plane into interlocking creatures, one per 10 x 10 cell,
// drifting slowly right. In the paper "sky" they are light birds flying
// right (wing raised, beak in the next bird's forked tail). Inside a numeral
// the same tiles are dark fish ("Sky and Water"): the plane flips figure and
// ground there. The numeral is a clean mask with open counters and a crisp
// ink keyline and a pale moat round it, so the creatures are cut by the
// digit, never the digit by the creatures. Hours 70 px tall at the left,
// minutes 52 px set lower right.
//
// Always alive: the plane drifts (6 px/s, quarter-pixel tables, every edge
// AA); a wave of wing-beats rolls through the flock; a slow morph wave
// flattens birds back to Escher's chessboard and lets them grow again; eyes
// blink; every 15 s one bird works itself free, leaving its bird-shaped
// hole, flies once round the band (out right, back in left: the strip is a
// loop) and drops back into its hole as it drifts by.
//
// Minute ("Liberation"): from :58.4 the fish of the old numeral lift out of
// the plane tile by tile in a wave, turn into birds as they rise and fly off
// up and right; the slot is plain sky by :59.9. After :00 a new flock comes
// down from above; each bird turns into a fish as it lands in its tile, and
// the new numeral is whole by 0:02. Never a wrong digit: old tiles only
// leave, new ones only arrive after :00.
//
// Hour: a metamorphosis front crosses the strip. At the front every tile
// flattens to a chessboard whose squares take the new ink; behind it the
// creatures grow back in the next hour's ink (teal, madder, ochre, indigo in
// turn) while the changed numerals do their Liberation. Night comes and goes
// the same way, the strip turning into "Day and Night".
//
// Palette, woodcut: every tile a solid two-tone fill with a thin keyline.
// Sky: paper and straw birds with brown eyes. Numerals: two darks of the
// hour's ink, fish with pale eyes, a near-black keyline and a pale moat. At
// night the sky is a deep indigo (the dark is deliberate) and the numerals
// turn to pale bone fish, the lightest thing on a 45 % backlight.
//
// Cost: one integer pass over the glass (a distance-table lookup for the
// mask, two tile-table lookups, a parity and a few blends per pixel, charged
// to g.cost.box), ~130 AA eyes, and at a turn up to ~90 free tiles drawn from
// the same tables. Flash: tile tables 41 levels x 40 x 10 x 2 B = 33 KB, digit
// masks 10 x (48 x 82 + 40 x 64) int8 = 65 KB: ~98 KB. Nothing is redrawn per
// minute outside the canvas.

import { hex, R, G, B, rand, sin, cos, clockFields } from '../js/kit.js';
import { PX, PY, W, H, SUB, LAB, DST, TABLE_W, STEPS, CHAIN, levelOf, flapLevel, drawTile, EYE_BIRD, EYE_FISH } from './escher-tiles.js';
import { SLOTS, GM } from './escher-glyphs.js';

// integer floor / min / max: shifts and compares in C (fixed point), not library calls
const ifloor = (v) => { const t = v | 0; return t > v ? t - 1 : t; };
const imin = (a, b) => (a < b ? a : b), imax = (a, b) => (a > b ? a : b);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const DAY = 86400;
const OMEGA = (n) => (2 * Math.PI * n) / DAY;   // slow phases that close over a day (no jump at midnight)
const SPEED = 6;                                 // the plane drifts right, px/s
const cellX = (i, tt) => i * PX + SPEED * tt;   // canvas x of tile column i's corner at day-time tt

// ------------------------------------------------------------ the numerals
// Per column: the nearest slot, and x inside its padded table.
const SLOT_OF = new Int8Array(W).fill(-1), LX = new Int16Array(W);
for (let x = 0; x < W; x++) {
  let best = -1, bd = 1e9;
  for (let k = 0; k < 4; k++) {
    const S = SLOTS[k], d = Math.abs(x + 0.5 - (S.x + S.S.w / 2));
    if (d < bd && x >= S.x - GM && x < S.x + S.S.w + GM) { bd = d; best = k; }
  }
  SLOT_OF[x] = best;
  if (best >= 0) LX[x] = x - SLOTS[best].x + GM;
}
const gS = new Int8Array(4), gC = new Int8Array(4);   // the steady and the changing digit per slot (-1 none)
/** The mask's signed distance at pixel (x, y) for a digit set; 8 = far outside. */
function sdAt(x, y, set) {
  if (x < 0 || x >= W || y < 0 || y >= H) return 8;
  const k = SLOT_OF[x];
  if (k < 0) return 8;
  const d = set[k];
  if (d < 0) return 8;
  const S = SLOTS[k], ly = y - S.y + GM;
  if (ly < 0 || ly >= S.S.th) return 8;
  return S.S.sd[d][ly * S.S.tw + LX[x]];
}
const covOf = (sd) => (sd >= 0.5 ? 0 : sd <= -0.5 ? 1 : 0.5 - sd);
/** The ink keyline, just inside the mask's edge. */
const keyOf = (sd) => (sd >= 0.5 || sd <= -2.3 ? 0 : imin(0.5 - sd, sd + 2.3 > 1 ? 1 : sd + 2.3));
/** The pale moat, just outside it. */
const moatOf = (sd) => (sd <= -0.5 || sd >= 2.6 ? 0 : imin(sd + 0.5, 2.6 - sd > 1 ? 1 : 2.6 - sd) * 0.8);
/** How far the tile shapes have turned into fish: inside the mask, never in a counter. */
const morphOf = (sd) => (sd >= 0.5 ? 0 : sd <= -4 ? 1 : (0.5 - sd) * 0.2222);

// ------------------------------------------------------------ palettes
const rgb3 = (c) => [R(c), G(c), B(c)];
function pal(g0, g1, gl, ge, f0, f1, fl, fe, key, moat, hole) {
  return {
    g: [rgb3(hex(g0)), rgb3(hex(g1))], gl: rgb3(hex(gl)), ge: hex(ge), g0: hex(g0), g1: hex(g1), gli: hex(gl),
    f: [rgb3(hex(f0)), rgb3(hex(f1))], fl: rgb3(hex(fl)), fe: hex(fe), f0: hex(f0), f1: hex(f1), fli: hex(fl),
    key: rgb3(hex(key)), moat: rgb3(hex(moat)), hole: rgb3(hex(hole)),
  };
}
// four inks, one per hour in turn: teal, madder, ochre, indigo
const DAY_INK = [['0f2b30', '2b6c72'], ['3a130e', '8c3826'], ['2e2008', '7c5c18'], ['121732', '36488f']];
const NIGHT_INK = [['ece0bc', 'a7d3c4'], ['ece0bc', 'e6ae98'], ['ece0bc', 'e6cd8c'], ['ece0bc', 'b5c3ea']];
const PALS = [];
for (let k = 0; k < 4; k++) PALS.push(pal('f0e6c8', 'dccc9c', '9a8664', '5a4a36', DAY_INK[k][0], DAY_INK[k][1], '08090c', 'f4ead0', '0a0b0e', 'fbf6e4', '2e281f'));
for (let k = 0; k < 4; k++) PALS.push(pal('141b31', '1f2948', '070a14', 'a8b4d8', NIGHT_INK[k][0], NIGHT_INK[k][1], '3a4266', '141a2e', '05070f', '0a0e1e', '04060c'));

// ------------------------------------------------------------ the flock jobs
// A job is one minute turn: the slots that change, and for each tile over
// them when it lifts out of the plane (old numeral) or lands in it (new).
const LIFT = 58.4, LAND = 0.1, WAVE = 1.0, JIT = 0.25, FADE = 0.25, INFLIGHT = 1.4, SPAN = WAVE + JIT + FADE;
function job(fromStr, toStr) {
  const slots = [];
  for (let k = 0; k < 4; k++) if (fromStr[k] !== toStr[k]) slots.push(k);
  if (!slots.length) return null;
  const a = SLOTS[slots[0]], b = SLOTS[slots[slots.length - 1]];
  return { slots, x0: a.x, ww: imax(30, b.x + b.S.w - a.x), from: fromStr, to: toStr };
}
/** When tile column i starts to move (seconds of the job's minute), the plane frozen at day-time tRef: a wave left to right. */
function tileTime(J, i, j, base, tRef) {
  const u = clamp01((cellX(i, tRef) + PX / 2 - J.x0) / J.ww);
  return base + WAVE * u + JIT * rand(i, j, base > 30 ? 7 : 9);
}
/** Share of tile (i, j), placed as at day-time tRef, inside the job's digits. */
const tmpSet = new Int8Array(4);
function coverage(J, digits, i, j, tRef) {
  for (let k = 0; k < 4; k++) tmpSet[k] = J.slots.includes(k) ? +digits[k] : -1;
  const ox = cellX(i, tRef), oy = j * PY;
  let n = 0;
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (sdAt(ifloor(ox + 1.5 + a * 2.4), ifloor(oy + 1.5 + b * 2.4), tmpSet) < 0) n++;
  return n / 16;
}

// Per frame, per visible tile: how much of the changing numeral it still
// (or already) holds, and its palette.
const WI = 20, WJ = 10;
const TWT = new Float32Array(WI * WJ), TPAL = new Uint8Array(WI * WJ);
let wI0 = 0;
const wk = (i, j) => (j + 1) * WI + (i - wI0);

// ------------------------------------------------------------ the plane
const gm = new Float32Array(W), fm = new Float32Array(W), band = new Float32Array(W), flapL = new Int16Array(W);

function plane(g, scroll, trans, fwC, holeK) {
  const buf = g.buf;
  let nC = 0;
  for (let y = 0; y < H; y++) {
    const cy = ifloor(y / PY), row = (y - cy * PY) * TABLE_W;
    for (let x = 0; x < W; x++) {
      const sdS = sdAt(x, y, gS), sdC = trans ? sdAt(x, y, gC) : 8;
      const Ds = morphOf(sdS), Dc = morphOf(sdC) * fwC, D = Ds > Dc ? Ds : Dc;
      const m = gm[x] + (fm[x] - gm[x]) * D;
      let L;
      if (m > 0.97 && m < 1.03) L = flapL[x];
      else { L = (m * STEPS + 0.5) | 0; if (L >= CHAIN) L = CHAIN - 1; }
      const X = x + 0.5 - scroll, cx = ifloor(X / PX), q = row + (((X - cx * PX) * SUB) | 0);
      const lab = LAB[L][q], d = DST[L][q] * 0.0625;
      const i = cx + (lab % 3) - 1, j = cy + ((lab / 3) | 0) - 1, tk = wk(i, j);
      const P = PALS[TPAL[tk]], p = (i + j) & 1;
      // the tile as sky (bird) and as numeral (fish), each with its keyline
      const e = d < 0.9 ? (d < 0.35 ? 0.9 : (0.9 - d) * 1.636) : 0;
      const gc = tk === holeK ? P.hole : P.g[p], gl = P.gl;
      let r = gc[0] + (gl[0] - gc[0]) * e, gg = gc[1] + (gl[1] - gc[1]) * e, b = gc[2] + (gl[2] - gc[2]) * e;
      if (p && band[x] > 0) { const li = P.f[1], u = band[x] * 0.7; r += (li[0] - r) * u; gg += (li[1] - gg) * u; b += (li[2] - b) * u; }
      // the numeral: mask coverage, its keyline and moat (the changing one weighted by its tile)
      let c = covOf(sdS), k = keyOf(sdS), mo = moatOf(sdS);
      if (sdC < 8) {
        nC++;
        const w = TWT[tk];
        const cc = covOf(sdC) * w, kc = keyOf(sdC) * w, mc = moatOf(sdC) * w;
        if (cc > c) c = cc;
        if (kc > k) k = kc;
        if (mc > mo) mo = mc;
      }
      if (mo > 0) { const t = P.moat; r += (t[0] - r) * mo; gg += (t[1] - gg) * mo; b += (t[2] - b) * mo; }
      if (c > 0) {
        const fc = P.f[p], fl = P.fl, ef = e * 0.6;
        const fr = fc[0] + (fl[0] - fc[0]) * ef, fg = fc[1] + (fl[1] - fc[1]) * ef, fb = fc[2] + (fl[2] - fc[2]) * ef;
        r += (fr - r) * c; gg += (fg - gg) * c; b += (fb - b) * c;
      }
      if (k > 0) { const t = P.key; r += (t[0] - r) * k; gg += (t[1] - gg) * k; b += (t[2] - b) * k; }
      buf[y * W + x] = (((r + 0.5) | 0) >> 3 << 11) | (((gg + 0.5) | 0) >> 2 << 5) | (((b + 0.5) | 0) >> 3);
    }
  }
  g.cost.box += W * H * (trans ? 20 : 18) + nC * 6;
}

// ------------------------------------------------------------ eyes
const ER = 1.3;   // one bold eye per creature
function eyeX(m) { const u = clamp01(m - 1); return EYE_BIRD[0] + (EYE_FISH[0] - EYE_BIRD[0]) * u; }
function eyeY(m) { const u = clamp01(m - 1); return EYE_BIRD[1] + (EYE_FISH[1] - EYE_BIRD[1]) * u; }
const clampX = (x) => imax(0, imin(W - 1, ifloor(x))), clampY = (y) => imax(0, imin(H - 1, ifloor(y)));

function eyes(g, tod, trans, fwC, holeK) {
  for (let j = -1; j <= 7; j++)
    for (let i = wI0 + 1; i < wI0 + WI - 1; i++) {
      const tk = wk(i, j);
      if (tk === holeK) continue;                                   // its bird is out
      const ox = cellX(i, tod), oy = j * PY;
      if (ox < -PX - 2 || ox > W + 2) continue;
      const xc = clampX(ox + PX / 2), yc = clampY(oy + PY / 2);
      const D = imax(morphOf(sdAt(xc, yc, gS)), trans ? morphOf(sdAt(xc, yc, gC)) * fwC : 0);
      const m = gm[xc] + (fm[xc] - gm[xc]) * D;
      if (m < 0.45) continue;                                       // squares have no eyes
      if ((tod + rand(i, j, 3) * 7) % 7 < 0.13) continue;           // a blink
      const ex = ox + eyeX(m), ey = oy + eyeY(m);
      if (ex < -2 || ex > W + 2 || ey < -2 || ey > H + 2) continue;
      const xe = clampX(ex), ye = clampY(ey);
      const sE = sdAt(xe, ye, gS), cE = trans ? sdAt(xe, ye, gC) : 8, w = TWT[tk];
      if ((sE > -2.8 && sE < 3.2) || (w > 0 && cE > -2.8 && cE < 3.2)) continue;   // never on a keyline or moat
      const fig = sE < 0 || (w > 0.5 && cE < 0);
      const P = PALS[TPAL[tk]];
      g.fillCircle(ex, ey, ER, fig ? P.fe : P.ge, { aa: true, a: imin(1, (m - 0.45) / 0.3) });
    }
}

/** Palette index for something at canvas x, given the fronts. */
const palAt = (S, x) => (x < S.nightFront ? 4 : 0) + (x < S.hourFront ? S.hNew : S.hOld);

// ------------------------------------------------------------ free birds
function flock(g, S, J, sJob, kind, todMin) {
  let probes = 0;
  // kind 'out': the old numeral's fish lift off; 'in': the new numeral's land.
  // sJob: seconds into the job's minute (can be < 0 or > 60); todMin: day-time of that minute's start.
  const digits = kind === 'out' ? J.from : J.to, base = kind === 'out' ? LIFT : LAND, tRef = todMin + base;
  const iA = ifloor((J.x0 - 8 - SPEED * tRef) / PX) - 1, iB = ifloor((J.x0 + J.ww + 8 - SPEED * tRef) / PX) + 1;
  for (let i = iA; i <= iB; i++)
    for (let j = -1; j <= 7; j++) {
      const t0 = tileTime(J, i, j, base, tRef);
      let x, y, L, a = 1, lift = 0;
      if (kind === 'out') {
        if (sJob < t0 || sJob > t0 + 3.2) continue;
        probes++;
        if (coverage(J, digits, i, j, todMin + t0) < 0.25) continue;
        const oy = j * PY;
        if (sJob < t0 + FADE) { const u = (sJob - t0) / FADE; a = u; lift = u; x = cellX(i, todMin + sJob); y = oy - 1.5 * u; L = levelOf(2); }
        else {
          const tau = sJob - t0 - FADE;
          lift = 1;
          x = cellX(i, todMin + t0 + FADE) + 24 * tau + 50 * tau * tau;
          y = oy - 1.5 - 12 * tau - 46 * tau * tau;
          L = tau < 0.4 ? levelOf(2 - tau / 0.4) : flapLevel(0.5 - 0.5 * cos(2 * Math.PI * 3.2 * (tau - 0.4)));
        }
      } else {
        if (sJob > t0 + FADE || sJob < t0 - INFLIGHT) continue;
        probes++;
        if (coverage(J, digits, i, j, todMin + t0) < 0.25) continue;
        const ox = cellX(i, todMin + sJob), oy = j * PY;
        if (sJob >= t0) { const u = (sJob - t0) / FADE; a = 1 - u; lift = 1 - u; x = ox; y = oy; L = levelOf(2); }
        else {
          const tau = t0 - sJob;
          lift = 1;
          x = ox - 14 * tau - 12 * tau * tau;
          y = oy - 1.5 * imin(1, tau / 0.2) - 22 * tau - 22 * tau * tau;
          L = tau < 0.4 ? levelOf(2 - tau / 0.4) : flapLevel(0.5 - 0.5 * cos(2 * Math.PI * 3.2 * (tau - 0.4)));
          a = imin(1, (INFLIGHT - tau) / 0.15);
        }
      }
      if (x > W + 6 || y < -20 || x < -30) continue;
      const P = PALS[palAt(S, x + PX / 2)], p = (i + j) & 1;
      if (lift > 0 && lift < 1) drawTile(g, L, x + 2 * lift, y + 2 * lift, 0x000000, 0.22 * a);
      drawTile(g, L, x, y, p ? P.f1 : P.f0, a, P.fli, lift >= 1);
      const mm = L <= 2 * STEPS ? L / STEPS : 1;
      g.fillCircle(x + eyeX(mm), y + eyeY(mm), ER, P.fe, { aa: lift < 1, a });   // flyers move several px a frame: a hard eye
    }
  g.cost.box += probes * 16 * 5;   // the coverage samples (table lookups)
}

// ------------------------------------------------------------ the wanderer
// Every WANDER seconds one bird of the sky works itself free, leaving its
// bird-shaped hole in the plane, flies once round the band (out on the right,
// back in on the left: the strip is a loop) and drops back into its hole,
// which has drifted on with the plane meanwhile.
const WANDER = 15, WT = 6.5, WLIFT = 0.45, WRAP = 200;
const groundAt = (x, t) => 0.8 + 0.5 * sin(x * 0.03 - OMEGA(2888) * t);
function clearOfDigits(ox, oy) {
  for (let a = 0; a <= 2; a++) for (let b = 0; b <= 2; b++) if (sdAt(clampX(ox + a * PX / 2), clampY(oy + b * PY / 2), gS) < 4) return false;
  return true;
}
function wanderer(tod, sec) {
  const w = ifloor(tod / WANDER), t0 = w * WANDER + 4, tau = tod - t0;
  if (tau < 0 || tau > WT) return null;
  const st0 = sec - tau;
  if (st0 < 3 || st0 + WT > 57) return null;
  for (let at = 0; at < 24; at++) {
    const i = ifloor((8 + rand(w, at, 1) * 100 - SPEED * t0) / PX), j = ifloor(rand(w, at, 2) * 7) + 0;
    const xs = cellX(i, t0), xe = cellX(i, t0 + WT), oy = j * PY;
    if (xs < 4 || xe > W - PX - 4) continue;
    if (groundAt(xs + PX / 2, t0) < 0.97 || groundAt(xe + PX / 2, t0 + WT) < 0.97) continue;
    if (!clearOfDigits(xs, oy) || !clearOfDigits(xe, oy) || !clearOfDigits((xs + xe) / 2, oy)) continue;
    return { i, j, tau };
  }
  return null;
}
function drawWanderer(g, S, Wd, tod) {
  const { i, j, tau } = Wd, hx = cellX(i, tod), hy = j * PY;
  let ox = 0, oy = 0, lift = 1, L;
  if (tau < WLIFT || tau > WT - WLIFT) {
    lift = tau < WLIFT ? tau / WLIFT : (WT - tau) / WLIFT;
    lift = lift * lift * (3 - 2 * lift);
    oy = -1.5 * lift;
    L = flapL[clampX(hx + PX / 2)];
  } else {
    const v = (tau - WLIFT) / (WT - 2 * WLIFT);
    ox = WRAP * (1 - cos(Math.PI * v)) / 2;
    oy = -1.5 - imax(8, hy - 14) * sin(Math.PI * v) + 3 * sin(2 * Math.PI * 2 * v);
    L = flapLevel(0.5 - 0.5 * cos(2 * Math.PI * 2.6 * (tau - WLIFT)));
  }
  const P = PALS[palAt(S, hx + PX / 2)], p = (i + j) & 1;
  for (let q = 0; q < 2; q++) {
    const x = hx + ox - q * WRAP, y = hy + oy;
    if (x > W + 4 || x < -30) continue;
    drawTile(g, L, x + 2.5 * lift, y + 2.5 * lift, 0x000000, 0.25 * lift);
    drawTile(g, L, x, y, p ? P.g1 : P.g0, 1, P.gli);
    g.fillCircle(x + EYE_BIRD[0], y + EYE_BIRD[1], ER, P.ge, { aa: true });
  }
}

export default {
  name: 'Metamorphosis',
  blurb: 'An Escher woodcut strip: inside the numerals the birds become fish; each minute they fly off as birds and a new flock lands.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, tod = f.h * 3600 + f.m * 60 + s, todMin = tod - s;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, P = prv.hh + prv.mm, N = nxt.hh + nxt.mm;
    const jOut = job(cur, N), jIn = job(P, cur);
    const scroll = SPEED * tod;

    // the steady numerals, and the changing ones with their per-tile weights
    for (let k = 0; k < 4; k++) { gS[k] = +cur[k]; gC[k] = -1; }
    let trans = false, fwC = 1, J = null, out = false;
    if (jOut && s >= LIFT - 0.05) { J = jOut; out = true; fwC = 1 - clamp01((s - LIFT) / SPAN); }
    else if (jIn && s < LAND + SPAN + 0.05) { J = jIn; fwC = clamp01((s - LAND) / SPAN); }
    if (J) { trans = true; for (const k of J.slots) { gC[k] = gS[k]; gS[k] = -1; } }

    // The hour: a metamorphosis front crosses the strip, carrying the next
    // hour's ink. Night comes and goes the same way ("Day and Night").
    let hourFront = 1e9, hNew = f.h % 4, hOld = f.h % 4;
    const th = f.m === 59 ? s - 57 : f.m === 0 ? s + 3 : -1;
    if (th >= 0 && th < 9) {
      hourFront = -30 + (th - 0.5) * 31;
      if (f.m === 59) { hNew = (f.h + 1) % 24 % 4; hOld = f.h % 4; } else { hNew = f.h % 4; hOld = (f.h + 23) % 24 % 4; }
    }
    const nt = ctx.night;
    const nightFront = nt <= 0 ? -1e9 : nt >= 1 ? 1e9 : -PX + nt * (W + 2 * PX);
    const S = { hNew, hOld, hourFront, nightFront };

    wI0 = ifloor((0 - scroll) / PX) - 2;
    for (let j = -1; j < WJ - 1; j++)
      for (let i = wI0; i < wI0 + WI; i++) {
        const tk = wk(i, j);
        TPAL[tk] = palAt(S, cellX(i, tod) + PX / 2);
        let w = 0;
        if (J) {
          const base = out ? LIFT : LAND, t0 = tileTime(J, i, j, base, todMin + base);
          w = out ? 1 - clamp01((s - t0) / FADE) : clamp01((s - t0) / FADE);
        }
        TWT[tk] = w;
      }

    // per column: the sky's morph (chessboard <-> birds, a slow wave), its
    // wing-beat, and the numerals' fish; both flatten at a front
    for (let x = 0; x < W; x++) {
      let gv = groundAt(x, tod);
      if (gv > 1) gv = 1;
      let fl = 1;
      for (let q = 0; q < 2; q++) {
        const u = Math.abs(x + 0.5 - (q ? nightFront : hourFront)) / 22;
        if (u < 1) { const sm = u * u * (3 - 2 * u); if (sm < fl) fl = sm; }
      }
      gm[x] = gv * fl; fm[x] = 2 * fl; band[x] = 1 - fl;
      flapL[x] = flapLevel(0.5 - 0.5 * cos(2 * Math.PI * (tod * 0.55 - x / 90)));
    }

    const Wd = wanderer(tod, s), holeK = Wd ? wk(Wd.i, Wd.j) : -1;
    plane(g, scroll, trans, fwC, holeK);
    eyes(g, tod, trans, fwC, holeK);
    if (Wd) drawWanderer(g, S, Wd, tod);
    // flocks: this turn's lift-off, the last turn's leavers, this minute's arrivals, the next minute's early ones
    if (jOut && s >= LIFT) flock(g, S, jOut, s, 'out', todMin);
    if (jIn && s < 4) flock(g, S, jIn, s + 60, 'out', todMin - 60);
    if (jIn && s < 3) flock(g, S, jIn, s, 'in', todMin);
    if (jOut && s > 58) flock(g, S, jOut, s - 60, 'in', todMin + 60);
  },
};
