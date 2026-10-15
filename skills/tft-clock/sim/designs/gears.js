// Gears: the glass is an open watch movement, and the numerals are its
// drive chains.
//
// Every digit is a roller-chain drive (gears-glyphs.js): its strokes are
// runs of chain between two side plates, with a toothed sprocket at every
// stroke end and corner. The chain runs, so the time itself is always
// moving: on every beat of the escapement the chains jump one link forward
// (with the recoil of a real escapement), every sprocket turns one tooth,
// neighbouring digits run in opposite directions like meshed wheels. In the
// middle, where a colon would be, the balance wheel swings with its
// hairspring breathing; the pallet fork above it flicks on each beat and the
// escape wheel ticks round; a third wheel turns below. The plate behind is
// engraved with Geneva stripes, and a sheen slides over them as if the watch
// were tilted in the hand.
//
// Every 15 s the mainspring gives a winding surge: all chains run four links
// in a smooth rush, the wheels whirl, a bright sheen sweeps the plate.
// Minute turn: the old digit's chain runs back into its sprockets (evenly,
// from every stroke's middle at once), the bare sprockets roll across the
// plate to the new digit's corners (splitting or merging when the counts
// differ), and the new chain threads out of them. Hour: the great wheel of
// the going train rises from below the glass, its rim and teeth arcing
// across the whole strip behind the numerals; after the turn it strikes the
// hour, one jolt of a tooth per stroke, each strike sending a ring of sound
// up across the plate, then sinks again.
//
// Two colours, as a 1-bit display: brass #e0b048 on oxblood #2a0c10. Brass
// is what a movement is made of; oxblood is the lacquered case and the
// shadow inside it. Every frame is built as a 1-bit mask and written out in
// those two values; grey exists only as engraving (stripe and hatch
// density). Night dims the backlight only.
//
// Cost: per frame, a pass over the plate (a table lookup and a compare per
// pixel), the chains and wheels from byte tables (a few integer ops a
// pixel), and the 1-bit mask written out as RGB565. In the hour show the
// great wheel adds a pass with an integer square root and an arctangent
// from small tables. All charged to the estimate as box work.

import { to565, hex, sin, clockFields } from '../js/kit.js';
import { buildGlyph, polarSprite, PITCH, ANG, K_MOAT, K_RAILO, K_ROLL } from './gears-glyphs.js';

const W = 160, H = 80, N = W * H;
const INK = to565(hex('#e0b048')), GROUND = to565(hex('#2a0c10'));
const MASK = new Uint8Array(N);
const TAU = Math.PI * 2;
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const prog = (v, a, b) => (v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a));

// ------------------------------------------------------------ the numerals
const PAD = 3;
const SIZE = { H: { w: 32, h: 72, R: 5.5 }, M: { w: 26, h: 56, R: 4.5 } };
const GL = { H: [], M: [] };
for (const k of ['H', 'M']) for (let d = 0; d <= 9; d++) GL[k].push(buildGlyph(d, SIZE[k].w, SIZE[k].h, SIZE[k].R, PAD));
// silhouette origins per slot
const SLOT = [[2, 4, 'H'], [37, 4, 'H'], [100, 20, 'M'], [131, 20, 'M']];
const TEETH = 8, TP = ANG / TEETH;         // sprocket: one link = one tooth = 15 angle steps

// ------------------------------------------------------------ the plate: Geneva stripes
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const TONE = new Uint8Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const r = Math.hypot(x + 0.5 + 30, y + 0.5 - 170) / 9;    // arcs round a far pivot, 9 px a stripe
  const f = r - Math.floor(r);
  TONE[y * W + x] = Math.round(Math.max(0, 1 - f * 3.2) * 4);
}
const LIFT = new Uint8Array(512);

function plate(sheenQ, sheenA, flourQ, flourA) {
  for (let q = 0; q < 512; q++) {
    const d1 = Math.abs(q - sheenQ), d2 = Math.abs(q - flourQ);
    let v = d1 < 56 ? (1 - d1 / 56) * sheenA : 0;
    if (d2 < 34) v = Math.max(v, (1 - d2 / 34) * flourA);
    LIFT[q] = Math.round(v);
  }
  for (let y = 0; y < H; y++) {
    const row = y * W, qy = (y * 154) >> 8, by = (y & 3) * 8;
    for (let x = 0; x < W; x++) MASK[row + x] = TONE[row + x] + LIFT[x + qy] > BAYER[by + (x & 3)] ? 1 : 0;
  }
}

// ------------------------------------------------------------ the great wheel (hour)
// integer square root and arctangent from small tables, as on the device
const SQ = new Uint8Array(4096);                // sqrt(i * 16)
for (let i = 0; i < 4096; i++) SQ[i] = Math.min(255, Math.round(Math.sqrt(i * 16)));
const AT = new Uint16Array(1281);               // atan(i / 1024) in great-wheel angle units
const GT = 96, GU = 16, GA = GT * GU;           // 96 teeth, 16 units a tooth
for (let i = 0; i <= 1280; i++) AT[i] = Math.round((Math.atan(i / 1024) / TAU) * GA);

// distance of every pixel from the great wheel's arbor when it is up, for the strike fronts
const GCX = 80, GCY = 152;
const DG = new Uint8Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) DG[y * W + x] = Math.min(255, Math.round(Math.hypot(x + 0.5 - GCX, y + 0.5 - GCY)));
const INV = new Uint8Array(256);
const WARN = -1.6, STRIKE0 = 0.9, STRIKE_DT = 0.45, FRONT_V = 130, BAND = 5;
const strikeT = (k) => STRIKE0 + STRIKE_DT * k;

/**
 * The hour strikes as fronts from the great wheel's arbor. Like a striking
 * clock's warning run, a front opens the negative before the turn (the turn
 * happens in it); then every strike of the new hour sends a ring of the
 * opposite through, and half a second after the last one a closing front
 * sweeps the glass back to positive.
 */
function strikeFronts(t, n) {
  INV.fill(0);
  let active = false;
  const front = (t0, filled) => {
    const r = (t - t0) * FRONT_V + 70;
    if (t < t0) return;
    active = true;
    if (filled) { for (let d = 0; d < 256 && d < r; d++) INV[d] ^= 1; }
    else for (let d = Math.max(0, Math.ceil(r - BAND)); d < 256 && d < r; d++) INV[d] ^= 1;
  };
  front(WARN, true);
  for (let k = 0; k < n; k++) front(strikeT(k), false);
  front(strikeT(n - 1) + 0.55, true);
  if (!active) return 0;
  for (let i = 0; i < N; i++) MASK[i] ^= INV[DG[i]];
  return N;
}

function greatWheel(cy, phi) {
  const ph = ((Math.round(phi * GU) % GA) + GA) % GA;
  let n = 0;
  for (let y = 0; y < H; y++) {
    const dy = cy - y - 0.5;
    if (dy < 60) continue;
    const row = y * W, inv = Math.round(1024 * 1024 / dy);
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - 80, r2 = dx * dx + dy * dy, ri = r2 >> 4;
      if (ri >= 4096) continue;
      const r = SQ[ri];
      n++;
      if (r > 119) continue;
      const ax = Math.abs(dx), q = Math.min(1280, (ax * inv) >> 10);
      let a = dx < 0 ? GA - AT[q] : AT[q];
      a = (a + ph) % GA;
      const u = a % GU;
      let v;
      if (r >= 118) v = 0;
      else if (r >= 112) v = u >= 3 + ((r - 112) >> 1) && u <= 13 - ((r - 112) >> 1) ? 1 : 0;   // teeth
      else if (r >= 106) v = 1;                                                                   // rim
      else if (r >= 104) v = 0;
      else if (r >= 101) v = (x + y) % 3 === 0 ? 1 : 0;                                           // engraved band inside the rim
      else {
        // the dark of the wheel's well, six spokes outlined and hatched across it
        const sa = a % (GA / 6), da = Math.abs(sa - GA / 12), wpx = (da * r) / 244;
        v = wpx < 6 ? (wpx >= 4.5 ? 1 : ((x + y) % 3 === 0 ? 1 : 0)) : 0;
      }
      MASK[row + x] = v;
    }
  }
  return n;
}

// ------------------------------------------------------------ wheels
const SPR = { H: polarSprite(9), M: polarSprite(8) };

/**
 * A toothed wheel from a polar sprite. Radii in half pixels. `teeth` must
 * divide ANG; `spokes` likewise. `rot` in angle steps. `club` slants the
 * teeth like an escape wheel's.
 */
function wheel(sp, cx, cy, tip, root, rimIn, hub, teeth, spokes, rot, club, moat) {
  const { E, S, rad, ang } = sp;
  const x0 = Math.round(cx - 0.5) - E, y0 = Math.round(cy - 0.5) - E;
  const tp = ANG / teeth, spp = ANG / spokes;
  const r0 = ((Math.round(rot) % ANG) + ANG) % ANG;
  let n = 0;
  for (let y = 0; y < S; y++) {
    const yy = y0 + y; if (yy < 0 || yy >= H) continue;
    for (let x = 0; x < S; x++) {
      const xx = x0 + x; if (xx < 0 || xx >= W) continue;
      const i = y * S + x, r2 = rad[i];
      if (r2 > tip + moat) continue;
      n++;
      const a = (ang[i] + ANG - r0) % ANG, m = yy * W + xx;
      let v;
      if (r2 > tip) v = 0;
      else if (r2 > root) {
        const u = a % tp;
        v = club ? (u < tp * (0.25 + 0.5 * (tip - r2) / (tip - root)) ? 1 : 0) : (u < tp / 2 ? 1 : 0);
      } else if (r2 > rimIn) v = 1;
      else if (r2 > hub) v = (a % spp) < 6 ? 1 : 0;
      else v = r2 > 1 ? 1 : 0;
      MASK[m] = v;
    }
  }
  return n;
}

// ------------------------------------------------------------ the chains
function chain(gl, ox, oy, off, vis) {
  if (vis <= 0) return 0;
  const { W: BW, H: BH, pos, code } = gl;
  const lim = Math.round(vis * 31);
  const o = ((Math.round(off) % 240) + 240) % 240;
  for (let y = 0; y < BH; y++) {
    const yy = oy + y; if (yy < 0 || yy >= H) continue;
    const row = yy * W, gr = y * BW;
    for (let x = 0; x < BW; x++) {
      const xx = ox + x; if (xx < 0 || xx >= W) continue;
      const c = code[gr + x], k = c & 7;
      if (!k) continue;
      const rv = c >> 3;
      if (k === K_MOAT) { if (rv <= lim + 2) MASK[row + xx] = 0; continue; }
      if (rv > lim) continue;
      const m = row + xx;
      if (k === K_RAILO) { MASK[m] = 1; continue; }
      const u = (pos[gr + x] + 240 - o) % PITCH;
      MASK[m] = k === K_ROLL ? (u < 4 ? 1 : 0) : (u === 0 || u === 4 ? 1 : 0);   // rollers; plates swell at the pins
    }
  }
  return BW * BH;
}

function sprocket(k, cx, cy, rot) {
  const R = SIZE[k].R;
  return wheel(SPR[k], cx, cy, (R + 1.9) * 2, (R + 0.4) * 2, (R - 1.6) * 2, 3, TEETH, 4, rot, false, 2);
}

// pairing of sprockets between two digits: nearest first, leftovers to their nearest
const PAIRS = new Map();
function pairs(k, a, b) {
  const key = `${k}${a}${b}`;
  if (PAIRS.has(key)) return PAIRS.get(key);
  const A = GL[k][a].nodes, B = GL[k][b].nodes, cand = [];
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) cand.push([Math.hypot(A[i][0] - B[j][0], A[i][1] - B[j][1]), i, j]);
  cand.sort((p, q) => p[0] - q[0]);
  const ua = new Set(), ub = new Set(), out = [];
  for (const [, i, j] of cand) if (!ua.has(i) && !ub.has(j)) { ua.add(i); ub.add(j); out.push([i, j]); }
  for (const [, i, j] of cand) {
    if (!ua.has(i) && ub.size === B.length) { ua.add(i); out.push([i, j]); }
    else if (!ub.has(j) && ua.size === A.length) { ub.add(j); out.push([i, j]); }
  }
  const res = out.map(([i, j]) => [A[i][0], A[i][1], B[j][0], B[j][1]]);
  PAIRS.set(key, res);
  return res;
}

// ------------------------------------------------------------ the escapement
const BAL = polarSprite(15), ESC = polarSprite(10), THIRD = polarSprite(11), TRAIN = polarSprite(9);
const BX = 84, BY = 42, EX = 84, EY = 6;

function balance(theta) {
  const { E, S, rad, ang } = BAL;
  const x0 = BX - E, y0 = BY - E;
  const r0 = ((Math.round((theta / TAU) * ANG) % ANG) + ANG) % ANG;
  for (let y = 0; y < S; y++) {
    const row = (y0 + y) * W + x0;
    for (let x = 0; x < S; x++) {
      const i = y * S + x, r2 = rad[i];
      if (r2 > 30) continue;
      const a = (ang[i] + ANG - r0) % ANG;
      let v = 0;
      if (r2 >= 27) v = (a % 30) < 5 ? 1 : 0;              // four timing screws
      else if (r2 >= 23) v = 1;                            // rim
      else if (r2 >= 21) v = 0;
      else if (r2 <= 4) v = r2 > 1 ? 1 : 0;                // staff and roller
      else if (((a + 1) % 60) < 3) v = 1;                  // the crossing arm
      else if (r2 >= 19) v = 0;
      else {
        // the hairspring: the inner end turns with the balance, the outer is pinned
        const rr = r2 / 2, tw = theta * (1 - (rr - 2) / 7.5);
        let ph = rr / 3 - ang[i] / ANG + tw / TAU;
        ph -= Math.floor(ph);
        v = ph < 0.3 ? 1 : 0;
      }
      MASK[row + x] = v;
    }
  }
  return S * S;
}

/** A 2-px brush line into MASK. */
function bar(x0, y0, x1, y1, v) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 1.5));
  for (let i = 0; i <= n; i++) {
    const x = Math.floor(x0 + ((x1 - x0) * i) / n), y = Math.floor(y0 + ((y1 - y0) * i) / n);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) MASK[yy * W + xx] = v;
    }
  }
  return n * 4;
}

function pallet(psi) {
  // the anchor pivots at (84, 21): two arms whose pallets dip into the escape wheel, a fork down to the balance
  const px = 84, py = 21, c = Math.cos(psi), s = Math.sin(psi);
  const P = (dx, dy) => [px + dx * c - dy * s - 0.5, py + dx * s + dy * c - 0.5];
  let n = 0;
  const [lx, ly] = P(-8, -3), [rx, ry] = P(8, -3), [lt, lu] = P(-6, -6), [rt, ru] = P(6, -6), [fx, fy] = P(0, 5);
  for (const [a, b, cc, d] of [[px - 0.5, py - 0.5, lx, ly], [px - 0.5, py - 0.5, rx, ry], [lx, ly, lt, lu], [rx, ry, rt, ru], [px - 0.5, py - 0.5, fx, fy]]) n += bar(a, b, cc, d, 1);
  return n;
}

// ------------------------------------------------------------ time

const WIND = [15, 30, 45];
/** Chain travel in links since the start of the minute: a beat a second, three winding surges. */
function links(sec) {
  const n = Math.floor(sec), fr = sec - n;
  const e = fr < 0.24 ? fr / 0.24 : 1;
  let L = n + 1 + 2.4 * (e - 1) ** 3 + 1.4 * (e - 1) ** 2;        // fast, with a little recoil
  for (const q of WIND) L += 4 * sm(prog(sec, q + 0.3, q + 1.5));
  return L;
}
const flourAt = (sec) => { for (const q of WIND) if (sec >= q && sec < q + 2) return sec - q; return -1; };

// the minute turn: the old chain runs off for T_OFF, the bare sprockets roll for
// T_ROLL (across :00), the new chain threads on for T_ON
const T_OFF = 0.35, T_ROLL = 0.5, T_ON = 0.4, T_ALL = T_OFF + T_ROLL + T_ON, T_PRE = T_OFF + 0.3;
const digitsOf = (f) => [+f.hh[0], +f.hh[1], +f.mm[0], +f.mm[1]];

export default {
  name: 'Gears',
  blurb: 'An open watch movement: the numerals are roller-chain drives that jump a link on every beat; the great wheel rises and strikes the hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    let work = 0, hourFx = null;

    // ---- the plate, with the sheen and the winding sweep
    const ft = flourAt(sec);
    plate(-70 + ((sec % 3) / 3) * 360, 5, ft >= 0 ? -60 + ft * 170 : -999, 10);
    work += N * 5;

    // ---- hour show: the great wheel
    const hourT = f.m === 59 && sec >= 55 ? sec - 60 : f.m === 0 && sec < 9 ? sec : null;
    if (hourT !== null) {
      const t = hourT, strikes = f.m === 0 ? f.h12 : (f.h + 1) % 12 || 12;
      const up = sm(prog(t, -4, -1.8)), down = sm(prog(t, 7, 8.8));
      const cy = 252 - 100 * up + 100 * down;
      // it turns as it rises, stops, then jolts one tooth on every strike
      let phi = 6 * (1 - up) - 6 * down;
      for (let k = 0; k < strikes; k++) {
        const tk = strikeT(k);
        if (t < tk) break;
        const e = Math.min(1, (t - tk) / 0.14);
        phi += 1 - (1 - e) ** 3 + 0.2 * Math.sin(Math.PI * e);
      }
      work += greatWheel(cy, phi) * 25;
      hourFx = [t, strikes];
    }

    // ---- the escapement and the train
    const L = (f.minuteKey % 600) * 72 + links(sec);   // continuous across minutes (43200 links wraps seamlessly)
    const theta = 2.2 * sin(Math.PI * sec + Math.PI) * (1 + 0.25 * (ft >= 0 ? sm(1 - ft / 2) : 0));
    work += balance(theta) * 12;
    const side = Math.floor(sec) & 1 ? 1 : -1, fr = sec - Math.floor(sec);
    const psi = 0.16 * side * (fr < 0.1 ? 2 * (fr / 0.1) - 1 : 1);
    // escape wheel: 15 club teeth, one tooth a beat; third wheel and train above the minutes
    work += wheel(ESC, EX, EY, 19, 14, 11, 4, 15, 3, L * 8, true, 1) * 8;
    work += pallet(psi);
    work += wheel(THIRD, 84, 76, 21, 17, 14, 4, 20, 4, -L * 6, false, 1) * 8;
    work += wheel(TRAIN, 121, 5, 17, 13, 10, 3, 12, 3, -L * 10, false, 1) * 8;

    // ---- the numerals
    const cur = digitsOf(f);
    let old = null, nu = null, u = -1;
    if (sec >= 60 - T_PRE) { old = cur; nu = digitsOf(clockFields(new Date(ctx.date.getTime() + 60000))); u = sec - (60 - T_PRE); }
    else if (sec < T_ALL - T_PRE) { old = digitsOf(clockFields(new Date(ctx.date.getTime() - 60000))); nu = cur; u = sec + T_PRE; }
    for (let s = 0; s < 4; s++) {
      const [sx, sy, k] = SLOT[s], ox = sx - PAD, oy = sy - PAD, dir = s & 1 ? -1 : 1;
      const off = L * PITCH * dir, rot = L * TP * dir;
      if (u < 0 || old[s] === nu[s]) {
        const gl = GL[k][cur[s]];
        work += chain(gl, ox, oy, off, 1) * 6;
        for (const [nx, ny] of gl.nodes) work += sprocket(k, ox + nx, oy + ny, rot) * 8;
        continue;
      }
      // the turn: run off, roll, thread on
      if (u < T_OFF) {
        const gl = GL[k][old[s]];
        work += chain(gl, ox, oy, off, 1 - sm(u / T_OFF)) * 6;
        for (const [nx, ny] of gl.nodes) work += sprocket(k, ox + nx, oy + ny, rot) * 8;
      } else if (u < T_OFF + T_ROLL) {
        const e = sm((u - T_OFF) / T_ROLL), R = SIZE[k].R;
        for (const [ax, ay, bx, by] of pairs(k, old[s], nu[s])) {
          const d = Math.hypot(bx - ax, by - ay);
          const roll = (d * e) / (TAU * (R + 1.8)) * ANG * (bx >= ax ? 1 : -1);
          work += sprocket(k, ox + ax + (bx - ax) * e, oy + ay + (by - ay) * e, rot + roll) * 8;
        }
      } else {
        const gl = GL[k][nu[s]], R = SIZE[k].R;
        work += chain(gl, ox, oy, off, sm((u - T_OFF - T_ROLL) / T_ON)) * 6;
        for (const [ax, ay, bx, by] of pairs(k, old[s], nu[s])) {
          const d = Math.hypot(bx - ax, by - ay);
          const roll = d / (TAU * (R + 1.8)) * ANG * (bx >= ax ? 1 : -1);
          work += sprocket(k, ox + bx, oy + by, rot + roll) * 8;
        }
      }
    }

    // ---- the strikes of the hour, as negative fronts over everything
    if (hourFx) work += strikeFronts(hourFx[0], hourFx[1]) * 6;

    // ---- out: the 1-bit mask in two colours
    const buf = g.buf;
    for (let i = 0; i < N; i++) buf[i] = MASK[i] ? INK : GROUND;
    g.cost.px += N;
    g.cost.box += Math.round(work / 3);
  },
};
