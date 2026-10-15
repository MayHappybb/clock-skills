// Departures: a Solari split-flap board hung in a station hall at frog scale.
// The station clock is two big flap modules, a 24-flap hour drum and a
// 60-flap minute drum, so a turn is always exactly one flap: the old top half
// falls forward on its hinge (perspective, light catching it, its printed back
// landing as the new bottom half, a bounce). Beside it the departures board:
// one train leaves every minute, so the rows ARE the next minutes, row one
// counts the seconds down on its own little drum, and when it reaches 00 the
// train goes, the clock drops a flap and every row rattles up through the
// letter drums. On the hour the whole board re-homes in a rolling wave, the
// pigeon on the board's rim takes fright and swoops across the clock, and the
// commuters rush past as shadows.
import * as kit from '../js/kit.js';
import { bigCardTex, smallTex, DRUM } from './splitflap-glyphs.js';

const GW = 256, GH = 64, PI = Math.PI;
const img = new Float32Array(GW * GH * 3);

// ------------------------------------------------------------------ palette (linear)
const FACE = [0.052, 0.053, 0.060];            // charcoal flap
const INK = kit.hex('#f6ecd4');                // cream print, big clock
const ROWINK = kit.scale(kit.hex('#eee3c6'), 0.82);
const AMBER = kit.hex('#ffb13b');
const LINE_COL = [kit.hex('#1f8f3a'), kit.hex('#c23222'), kit.hex('#2860c8'), kit.hex('#d08a14')].map((c) => kit.scale(c, 0.8));
const RIM = [0.05, 0.075, 0.06], FRAME = [0.022, 0.034, 0.028], ROD = [0.03, 0.03, 0.032];

// ------------------------------------------------------------------ geometry
// Card: { x0, y0, w, h, hg (hinge row), D (perspective distance px), slit, tex(idx), ink(idx) }
const HOUR = { x0: 1, y0: 3, w: 52, h: 58, hg: 29, D: 88, slit: 0.22, glint: 1.4 };
const MIN = { ...HOUR, x0: 56 };
const bigCache = new Map();
function bigTex(str) {
  let t = bigCache.get(str);
  if (!t) { t = bigCardTex(str, 52, 58, [3.5, 27.5], 8, 1.05); bigCache.set(str, t); }
  return t;
}
const pad2 = (n) => String(n).padStart(2, '0');
HOUR.tex = (i) => bigTex(pad2(i)); MIN.tex = (i) => bigTex(pad2(i));
HOUR.ink = MIN.ink = () => INK;

const CW = 7, CH = 14, ROWY = [13, 30, 47], CELLX0 = 111, NCELL = 18;
const smallCache = new Map();
function letterTex(ch) {
  let t = smallCache.get(ch);
  if (!t) { t = smallTex(ch, CW, CH, 1, 2); smallCache.set(ch, t); }
  return t;
}
const FULL = (() => { const t = new Float32Array(CW * CH); for (let y = 1; y < CH - 1; y++) for (let x = 1; x < CW - 1; x++) t[y * CW + x] = 1; return t; })();
const EMPTY = new Float32Array(CW * CH);
const DESC = '9876543210';
// drums: letters, colours (blank + 4 lines), countdown digits (descending, so it only ever turns forward)
const DR_LET = { n: DRUM.length, tex: (i) => letterTex(DRUM[i]), ink: () => ROWINK };
const DR_COL = { n: 5, tex: (i) => (i ? FULL : EMPTY), ink: (i) => LINE_COL[(i + 3) % 4] };
const DR_CNT = { n: 10, tex: (i) => letterTex(DESC[i]), ink: () => AMBER };
const cells = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < NCELL; c++) {
  const drum = c === 0 ? DR_COL : r === 0 && c >= 16 ? DR_CNT : DR_LET;
  cells.push({ r, c, drum, x0: CELLX0 + c * 8, y0: ROWY[r], w: CW, h: CH, hg: 7, D: 40, slit: 0.6, glint: 0.6, tex: drum.tex, ink: drum.ink });
}

// ------------------------------------------------------------------ the trains
const DEST = ['LILYPAD', 'TADPOLE', 'BOGSIDE', 'FENWICK', 'PONDHAM', 'FROGTON', 'TOADLEY', 'MOSSLEY',
  'REEDHAM', 'HOPWELL', 'NEWTOWN', 'CROAKER', 'MARSHAM', 'SPAWNEY', 'DUCKSEY', 'RIBBITT'];
const trainCache = new Map();
/** Drum indices for the 18 cells of the train leaving at absolute minute m (row r). */
function trainRow(m, r) {
  const key = m * 4 + r;
  let row = trainCache.get(key);
  if (row) return row;
  const d = new Date(m * 60000);
  const txt = ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' ' + DEST[Math.floor(kit.hash(m, 11) * DEST.length)].padEnd(9) + (r ? ' ' + (1 + Math.floor(kit.hash(m, 12) * 9)) : '  ');
  row = [...txt].map((ch) => DRUM.indexOf(ch));
  row[0] = 1 + Math.floor(kit.hash(m, 13) * 4);
  if (trainCache.size > 64) trainCache.clear();
  trainCache.set(key, row);
  return row;
}

// ------------------------------------------------------------------ flap motion
const BOUNCE = [[1, 1], [0.3, 0.55], [0.09, 0.32]];
function bounceAngle(tl, A, T) {
  for (const [a, f] of BOUNCE) { const d = T * f; if (tl < d) return A * a * Math.sin(PI * tl / d); tl -= d; }
  return -1;
}
/**
 * A module turning `steps` flaps forward from drum index `from`, starting at
 * `start` (s), `dur` s a flap, ending with a bounce (A rad, T s). Fills st:
 * top/bot = what the halves behind show, fa/fb = falling flap's front/back
 * (fa < 0: none), ths = flap angles for motion blur.
 */
function turn(st, n, from, steps, t, start, dur, A, T, power = 2) {
  st.fa = -1;
  const e = t - start;
  if (steps <= 0 || e < 0) { st.top = st.bot = from; return st; }
  const k = Math.floor(e / dur);
  if (k >= steps) {
    const to = (from + steps) % n, tl = e - steps * dur;
    st.top = st.bot = to;
    const b = bounceAngle(tl, A, T);
    if (b > 0) {
      st.bot = (to + n - 1) % n; st.fa = to; st.fb = to;
      st.ths.length = 1; st.ths[0] = PI - b;
    }
    return st;
  }
  const a = (from + k) % n, b = (a + 1) % n;
  st.top = b; st.bot = a; st.fa = a; st.fb = b;
  const u = (e - k * dur) / dur, du = 1 / 120 / dur;
  st.ths.length = 3;
  for (let j = 0; j < 3; j++) st.ths[j] = PI * Math.max(0, u - j * du) ** power;
  return st;
}
const mkState = () => ({ top: 0, bot: 0, fa: -1, fb: 0, ths: [0] });

// ------------------------------------------------------------------ drawing
function drawBase(C, st, light) {
  const { x0, y0, w, h, hg } = C;
  // the falling flap's shadow on the bottom half (light from above)
  let sy = 0, sa = 0;
  if (st.fa >= 0) { const th = st.ths[0]; if (th > 0.15) { sy = (h - hg) * (1 - Math.cos(th)) * 0.5 + 1; sa = 0.42 * Math.min(1, th) * (th > 2.6 ? (PI - th) / (PI - 2.6) : 1); } }
  for (let y = 0; y < h; y++) {
    const gy = y0 + y;
    if (gy < 0 || gy >= GH) continue;
    const top = y < hg, idx = top ? st.top : st.bot, tex = C.tex(idx), ink = C.ink(idx);
    let sh = top ? 1.06 - 0.1 * (1 - (hg - y) / hg) * 1 : 0.74 * (1 - 0.16 * (y - hg) / (h - hg));
    if (top) sh = 0.96 + 0.1 * ((hg - y) / hg);
    if (y === hg) sh *= C.slit;
    if (!top && sy > 0) { const k = (y - hg) / sy; if (k < 1.3) sh *= 1 - sa * (k < 1 ? 1 : (1.3 - k) / 0.3); }
    sh *= light;
    const r0 = y * w;
    for (let x = 0; x < w; x++) {
      const gx = x0 + x;
      if (gx < 0 || gx >= GW) continue;
      const cv = tex[r0 + x], p = 3 * (gy * GW + gx);
      img[p] = (FACE[0] + (ink[0] - FACE[0]) * cv) * sh;
      img[p + 1] = (FACE[1] + (ink[1] - FACE[1]) * cv) * sh;
      img[p + 2] = (FACE[2] + (ink[2] - FACE[2]) * cv) * sh;
    }
  }
}

let accA = new Float32Array(4096), accC = new Float32Array(3 * 4096);
/** The falling flap: a hinged rectangle rotated th about the hinge, in perspective. */
function drawFlap(C, st, light) {
  if (st.fa < 0) return;
  const { x0, y0, w, h, hg, D } = C, L = hg;
  const pad = Math.ceil(w * 0.3) + 1, rx0 = x0 - pad, rw = w + 2 * pad, ry0 = y0 - 2, rh = h + 4;
  if (rw * rh > accA.length) { accA = new Float32Array(rw * rh); accC = new Float32Array(3 * rw * rh); }
  accA.fill(0, 0, rw * rh); accC.fill(0, 0, 3 * rw * rh);
  const cx = x0 + w / 2, hy = y0 + hg, ths = st.ths, wt = 1 / ths.length;
  for (const th of ths) {
    const c = Math.cos(th), s = Math.sin(th);
    const ye = (-L * c * D) / (D - L * s);
    const lo = Math.min(0, ye), hi = Math.max(0, ye);
    const front = th < PI / 2, idx = front ? st.fa : st.fb, tex = C.tex(idx), ink = C.ink(idx);
    const phi = (th - PI / 2) / (PI / 2);
    for (let ry = 0; ry < rh; ry++) {
      const a = ry0 + ry - hy, b = a + 1;
      const top = Math.min(b, hi), bot = Math.max(a, lo), ov = top - bot;
      const isEdge = ye >= a && ye < b;
      if (ov <= 0 && !isEdge) continue;
      let yp = ov > 0 ? (top + bot) / 2 : ye;
      if (Math.abs(yp) < 1e-4) yp = ye >= 0 ? 1e-4 : -1e-4;
      let sp = (yp * D) / (L * (yp * s - D * c));
      if (!(sp >= 0)) sp = 0; if (sp > 1) sp = 1;
      const f = D / (D - L * sp * s);
      // front catches the hall lamp as it tips toward horizontal: a glint band runs down the flap
      const g = C.glint * Math.exp(-(((th + 0.5 * sp - 1.25) / 0.2) ** 2));
      const sh = light * (front ? 0.96 + 0.1 * sp + 0.2 * s + g : 0.74 * (1 - 0.16 * sp) * (0.32 + 0.68 * phi ** 1.3));
      const ty = (front ? hg - sp * L : hg + sp * L) - 0.5;
      let t0 = Math.floor(ty); const fy = ty - t0; let t1 = t0 + 1;
      if (t0 < 0) t0 = 0; if (t1 > h - 1) t1 = h - 1; if (t0 > h - 1) t0 = h - 1;
      const half = (w / 2) * f, left = cx - half, right = cx + half;
      const edgeK = isEdge ? 0.10 * Math.abs(s) * light * (front ? 1 : 0.5) : 0;
      const ovr = ov > 0 ? Math.min(1, ov) : 0;
      for (let rx = 0; rx < rw; rx++) {
        const px = rx0 + rx;
        const ox = Math.min(px + 1, right) - Math.max(px, left);
        if (ox <= 0) continue;
        const kx = ox > 1 ? 1 : ox, q = ry * rw + rx;
        const rim = px < left + 1 || px + 1 > right ? 0.45 : 1;   // the flap's own edges read against its neighbour
        if (edgeK) { accC[3 * q] += edgeK * kx * wt * 1.0; accC[3 * q + 1] += edgeK * kx * wt * 0.95; accC[3 * q + 2] += edgeK * kx * wt * 0.85; }
        if (!ovr) continue;
        let tx = (px + 0.5 - cx) / f + w / 2 - 0.5;
        let u0 = Math.floor(tx); const fx = tx - u0; let u1 = u0 + 1;
        if (u0 < 0) u0 = 0; if (u1 > w - 1) u1 = w - 1; if (u0 > w - 1) u0 = w - 1;
        const cv = (tex[t0 * w + u0] * (1 - fx) + tex[t0 * w + u1] * fx) * (1 - fy) + (tex[t1 * w + u0] * (1 - fx) + tex[t1 * w + u1] * fx) * fy;
        const k = kx * ovr * wt;
        accA[q] += k;
        const shr = sh * rim;
        accC[3 * q] += (FACE[0] + (ink[0] - FACE[0]) * cv) * shr * k;
        accC[3 * q + 1] += (FACE[1] + (ink[1] - FACE[1]) * cv) * shr * k;
        accC[3 * q + 2] += (FACE[2] + (ink[2] - FACE[2]) * cv) * shr * k;
      }
    }
  }
  for (let ry = 0; ry < rh; ry++) {
    const gy = ry0 + ry;
    if (gy < 0 || gy >= GH) continue;
    for (let rx = 0; rx < rw; rx++) {
      const gx = rx0 + rx;
      if (gx < 0 || gx >= GW) continue;
      const q = ry * rw + rx, A = accA[q] > 1 ? 1 : accA[q], p = 3 * (gy * GW + gx);
      if (A === 0 && accC[3 * q] === 0) continue;
      img[p] = img[p] * (1 - A) + accC[3 * q];
      img[p + 1] = img[p + 1] * (1 - A) + accC[3 * q + 1];
      img[p + 2] = img[p + 2] * (1 - A) + accC[3 * q + 2];
    }
  }
}

// ------------------------------------------------------------------ the hall (static)
let hall = null;
function buildHall() {
  hall = new Float32Array(GW * GH * 3);
  const put = (x, y, c, a = 1) => { if (x < 0 || y < 0 || x >= GW || y >= GH) return; const p = 3 * (y * GW + x); hall[p] = c[0] * a; hall[p + 1] = c[1] * a; hall[p + 2] = c[2] * a; };
  const rect = (x0, y0, x1, y1, c) => { for (let x = x0; x <= x1; x++) { put(x, y0, c); put(x, y1, c); } for (let y = y0; y <= y1; y++) { put(x0, y, c); put(x1, y, c); } };
  rect(0, 1, 108, 62, FRAME);                       // clock case
  for (let x = 1; x < 108; x++) put(x, 1, RIM);
  rect(109, 10, 255, 63, FRAME);                    // departures case
  for (let x = 109; x <= 255; x++) put(x, 10, RIM, 1.3);
  for (const x of [128, 236]) for (let y = 0; y < 10; y++) put(x, y, ROD);   // hanging rods
  // hinge pins either side of every module
  const pin = [0.07, 0.068, 0.06];
  for (const C of [HOUR, MIN]) { put(C.x0 - 1, C.y0 + C.hg, pin); put(C.x0 + C.w, C.y0 + C.hg, pin); }
}

// ------------------------------------------------------------------ pigeon
const PAL = { h: kit.hex('#8d97ad'), e: kit.hex('#ff8a2a'), k: kit.hex('#d8c4b4'), n: kit.hex('#3fa889'), g: kit.hex('#6f798f'),
  w: kit.hex('#9aa4b8'), d: kit.hex('#3a4152'), t: kit.hex('#4a5163'), f: kit.hex('#d0584e'), m: kit.hex('#a05cb0') };
const HEAD = ['.hh.', 'hhek', 'hhh.'];
const BODY = ['......nm.....', '..ttgggnnn...', 'tttgwwdgggg..', '...gwwdggggg.', '.....gggggg..', '......f..f...'];
const FLY = [
  ['...ww....ww..', '....ww.ww....', '.....www..hh.', 'tttgggggghhek', '...gggggg....'],
  ['.............', '..........hh.', 'tttgggggghhek', '...ggwwwgg...', '....ww..ww...', '...w.....w...'],
];
const SW = 48, SH = 32;
const sprC = new Float32Array(3 * SW * SH), sprA = new Float32Array(SW * SH), sprH = new Float32Array(SW * SH);
/**
 * Paint pixel-art parts ([rows, ox, oy]) with top-left at (x, y), each art
 * pixel an sc x sc square, by area coverage (glides between LEDs), mirrored
 * if flip. halo > 0 lays a dark rim first so it reads over bright print.
 */
function sprite(parts, x, y, flip, a, sc = 1, halo = 0) {
  const x0 = Math.floor(x) - 2, y0 = Math.floor(y) - 2;
  sprA.fill(0); sprC.fill(0);
  for (const [rows, ox, oy] of parts) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.') continue;
        const c = PAL[ch], col = flip ? 12 - (ox + i) : ox + i, rr = oy + j;
        const X0 = x + col * sc - x0, X1 = X0 + sc, Y0 = y + rr * sc - y0, Y1 = Y0 + sc;
        for (let py = Math.floor(Y0); py < Y1; py++) {
          const wy = Math.min(py + 1, Y1) - Math.max(py, Y0);
          if (wy <= 0 || py < 0 || py >= SH) continue;
          for (let px = Math.floor(X0); px < X1; px++) {
            const wx = Math.min(px + 1, X1) - Math.max(px, X0);
            if (wx <= 0 || px < 0 || px >= SW) continue;
            const q = py * SW + px, wgt = wx * wy;
            sprA[q] += wgt; sprC[3 * q] += c[0] * wgt; sprC[3 * q + 1] += c[1] * wgt; sprC[3 * q + 2] += c[2] * wgt;
          }
        }
      }
    }
  }
  if (halo) {
    for (let j = 1; j < SH - 1; j++) for (let i = 1; i < SW - 1; i++) {
      const q = j * SW + i;
      sprH[q] = Math.min(1, Math.max(sprA[q - 1], sprA[q + 1], sprA[q - SW], sprA[q + SW]));
    }
  }
  for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) {
    const q = j * SW + i, A0 = sprA[q], Hh = halo ? sprH[q] * halo : 0;
    if (!A0 && !Hh) continue;
    const gx = x0 + i, gy = y0 + j;
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
    const p = 3 * (gy * GW + gx);
    if (Hh) { const k = 1 - Hh; img[p] *= k; img[p + 1] *= k; img[p + 2] *= k; }
    if (!A0) continue;
    const A = Math.min(1, A0), s = a / Math.max(1, A0);
    img[p] = img[p] * (1 - A) + sprC[3 * q] * s; img[p + 1] = img[p + 1] * (1 - A) + sprC[3 * q + 1] * s; img[p + 2] = img[p + 2] * (1 - A) + sprC[3 * q + 2] * s;
  }
}
const walkF = (u) => 184 + 52 * Math.sin(u * 0.37) + 12 * Math.sin(u * 1.13 + 2);
function walkAt(T) {
  const k = Math.floor(T / 5), e = T - 5 * k, p = kit.ease.inOut(kit.clamp(e / 3));
  const u = k + p, x = walkF(u);
  const dir = walkF(k + 1) >= walkF(k) ? 1 : -1;
  return { x, dir, moving: e < 3, e };
}
function drawPigeon(T, H, light) {
  const hs = Math.floor(T / 3600) * 3600, th = T - hs;
  const day = (h) => h >= 7 && h <= 22;
  const prevDay = day((H + 23) % 24), today = day(H);
  if (th < 4.0 && th >= 0.4) {                                       // startled by the clatter: swoop across the clock
    if (!prevDay) return;
    const w = walkAt(hs + 0.4), tau = (th - 0.4) / 3.6;
    const x = w.x - 330 * tau ** 1.25, y = 1 + 22 * Math.sin(PI * tau) - 40 * tau ** 3;
    const sc = 1 + 1.3 * Math.sin(PI * Math.min(1, tau * 1.3));             // swoops toward you, grows
    sprite([[FLY[Math.floor(th * 9) % 2], 0, 0]], x - 6 * sc, y - 2 * sc, true, light, sc, 0.8);
    return;
  } else if (th >= 0.4 && th < 40) return;
  if (th < 0.4 ? !prevDay : !today) return;
  if (th >= 40 && th < 44) {                                 // glide back in from the right and land
    const w = walkAt(hs + 44), tau = kit.ease.out((th - 40) / 4);
    const x = kit.lerp(300, w.x, tau), y = kit.lerp(-14, 3, tau);
    const fr = th > 43.3 ? 1 : Math.floor(th * 8) % 2;
    sprite([[FLY[fr], 0, 0]], x - 6, y, x > w.x ? true : false, light);
    return;
  }
  const w = walkAt(T);
  let hx = 7, hy = 0;
  if (w.moving) hx += Math.sin(T * 2 * PI * 2.2) > 0 ? 1 : 0;              // head bob with each step
  else { const pk = w.e - 3; if ((pk > 0.3 && pk < 0.6) || (pk > 1.1 && pk < 1.4)) { hx += 2; hy += 3; } }
  sprite([[BODY, 0, 3], [HEAD, hx, hy]], w.x - 6, 1, w.dir < 0, light);
}

// ------------------------------------------------------------------ commuters' shadows
function shadowShape(type, x, y) {
  const circ = (cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
  const box = (cx, cy, hw, hh, r) => { const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
  const body = box(0, -9, 12.5, 11, 7);
  if (type === 0) return Math.min(body, circ(0, -26, 5.8));
  if (type === 1) return Math.min(body, circ(0, -26, 5.6), box(0, -35, 4.5, 4.5, 0.5), box(0, -31, 8, 0.9, 0.5));
  if (type === 2) return Math.min(body, box(0, -23, 9.5, 6.8, 6.5), circ(-5.5, -30, 3.8), circ(5.5, -30, 3.8));
  if (type === 3) return Math.min(box(0, -4, 8, 7, 5), circ(0, -17, 4.6));    // a child
  return Math.min(box(0, -7, 11, 7, 7), circ(-5, -14.5, 3.6), circ(5, -14.5, 3.6));   // a frog, late, hopping
}
const peds = [];
const RIMC = kit.hex('#ffd9a8'), FROGRIM = kit.hex('#9fe07a');
// now and then a frog in round glasses, late for the train, hops for it as the countdown runs out
Object.assign(PAL, { G: kit.hex('#45c040'), D: kit.hex('#23802c'), Y: kit.hex('#cfe67a'), W: kit.hex('#f2f2ea'), K: kit.hex('#101010'), R: kit.hex('#e8b84a') });
const FROG = [
  ['...RRR.RRR...', '..RWWKRWWKR..', '..RWWWRWWWR..', '..GRRRGRRRG..', '.GGGGGGGGGGG.', 'GGGGGGGGGDDGG', 'GGGYYYYYGGGG.', '.GGYYYYYGGG..', 'DDG.....GDD..', 'DD.......DD..'],
  ['...RRR.RRR...', '..RWWKRWWKR..', '..RWWWRWWWR..', '..GRRRGRRRG..', '.GGGGGGGGGGG.', '.GGGGGGGDDG..', '..GYYYYYGG...', '..GGYYYGG....', '.DD.....DD...', 'DD.......DD..'],
];
function drawFrog(T, night) {
  const M = Math.floor(T / 60), e = T - M * 60 - 53;
  if (e < 0 || night > 0.5 || kit.hash(M, 41) > 0.4) return;
  const x = -16 + 46 * e, ph = kit.fract(e * 1.5), up = Math.sin(PI * ph);
  if (x > GW + 4) return;
  sprite([[FROG[up > 0.25 ? 1 : 0], 0, 0]], x, 53 - 10 * up, false, 0.9, 1, 0.85);
}
function commuters(T, night, light = 1) {
  peds.length = 0;
  const SL = 13, j0 = Math.floor(T / SL), p = night > 0.5 ? 0.15 : 0.55;
  for (let j = j0 - 2; j <= j0; j++) {
    if (kit.hash(j, 1) > p) continue;
    const dir = kit.hash(j, 2) < 0.5 ? 1 : -1, v = 20 + 16 * kit.hash(j, 3), t0 = j * SL + 4 * kit.hash(j, 4);
    peds.push({ e: T - t0, dir, v, type: Math.floor(kit.hash(j, 5) * 4), sc: 0.9 + 0.2 * kit.hash(j, 6) });
  }
  const hs = Math.floor(T / 3600) * 3600, th = T - hs;
  if (th < 16 && night < 0.5) for (let i = 0; i < 6; i++)     // the rush for the departing train
    peds.push({ e: th - 0.8 - i * 1.4, dir: 1, v: 42 + 14 * kit.hash(hs, i), type: (i * 3 + 1) % 4, sc: 0.9 + 0.2 * kit.hash(hs, i, 2) });
  for (const q of peds) {
    if (q.e < 0) continue;
    const xc = q.dir > 0 ? -30 + q.v * q.e : GW + 30 - q.v * q.e;
    if (xc < -30 || xc > GW + 30) continue;
    const bob = q.hop ? -11 * Math.abs(Math.sin(PI * q.e * 1.5)) : -1.2 * Math.abs(Math.sin(q.e * q.v * 0.11));
    const x0 = Math.max(0, Math.floor(xc - 16 * q.sc)), x1 = Math.min(GW - 1, Math.ceil(xc + 16 * q.sc));
    const y0 = Math.max(0, Math.floor(GH + bob - 42 * q.sc));
    for (let y = y0; y < GH; y++) for (let x = x0; x <= x1; x++) {
      const lx = (x + 0.5 - xc) / q.sc, ly = (y + 0.5 - GH - bob - 3) / q.sc;
      const d = shadowShape(q.type, lx, ly) * q.sc;
      if (d > 2) continue;
      // a silhouette passing in front of the board, rim-lit by the hall lamps
      const cov = kit.smoothstep(0.9, -0.9, d), rim = Math.exp(-(((d + 0.7) / 0.7) ** 2)) * kit.smoothstep(0, -30, ly) * 0.5;
      const pp = 3 * (y * GW + x), k = 1 - 0.85 * cov, fr = q.type === 4;
      const rc = fr ? FROGRIM : RIMC, rk = fr ? 1.6 : 1, fill = fr ? 0.035 : 0.006;
      img[pp] = img[pp] * k + (rc[0] * rim * rk + fill * 0.35 * cov) * light;
      img[pp + 1] = img[pp + 1] * k + (rc[1] * rim * rk + fill * cov) * light;
      img[pp + 2] = img[pp + 2] * k + (rc[2] * rim * rk + fill * 0.3 * cov) * light;
    }
  }
}

// ------------------------------------------------------------------ the train behind you
// A train stands at the platform behind the viewer; its lit windows throw warm
// patches across the board. At the minute it pulls out (accelerating), the
// next one runs in and stops. Light adds, so it can only ever brighten.
const WARM = kit.hex('#ffcf8a'), CAR = 64, TRAIN = 5 * CAR, XS = GW + 24, ACC = 60;
const winRow = new Float32Array(GW + 64);
function trainX(tm) {
  if (tm < 0.6) return XS;                                      // standing
  const dep = XS + 0.5 * ACC * (tm - 0.6) ** 2;                 // pulling out
  if (dep < GW + TRAIN + 10) return dep;
  const arr = 22, stop = 30;                                    // the next one runs in and stops
  if (tm < arr) return null;
  if (tm < stop) return XS - 0.5 * (2 * (XS + 40) / 64) * (stop - tm) ** 2;
  return XS;
}
function trainLight(tm, night) {
  const xt = trainX(tm);
  if (xt === null) return;
  const v = tm < 0.6 ? 0 : tm < 22 ? ACC * (tm - 0.6) : (2 * (XS + 40) / 64) * Math.max(0, 30 - tm), soft = 1.2 + v / 90;
  const amt = 0.6 * (1 - 0.6 * night) * (0.4 + 0.6 * Math.min(1, v / 40));
  for (let y = 14; y < GH; y++) {
    const vy = kit.smoothstep(14, 24, y) * (1 - kit.smoothstep(52, 62, y));
    if (vy <= 0) continue;
    const sk = 0.35 * (y - 38);
    for (let x = 0; x < GW; x++) {
      const u = xt - (x + 0.5 + sk);                            // distance back from the engine's nose
      if (u < 0 || u > TRAIN) continue;
      const c = u % CAR;
      let w = 0;
      for (let k = 0; k < 4; k++) { const a = 7 + 13 * k, b = a + 8; w = Math.max(w, kit.smoothstep(a - soft, a + soft, c) * (1 - kit.smoothstep(b - soft, b + soft, c))); }
      if (w <= 0) continue;
      const k = w * vy * amt, p = 3 * (y * GW + x);
      img[p] += WARM[0] * k * (0.09 + 0.45 * img[p]); img[p + 1] += WARM[1] * k * (0.09 + 0.45 * img[p + 1]); img[p + 2] += WARM[2] * k * (0.09 + 0.45 * img[p + 2]);
    }
  }
}

// ------------------------------------------------------------------ the face
const stH = mkState(), stM = mkState(), stC = mkState();
const cnt = (sec) => 59 - sec;                       // seconds to departure
export default {
  name: 'Departures',
  blurb: 'a Solari split-flap station board: the clock drops one hinged flap a minute, a train leaves every minute and the rows rattle up',
  layouts: ['hub-x4'], look: 'smoke', fps: 60, brightness: 0.42, dither: false,
  frame(ctx) {
    if (!hall) buildHall();
    img.set(hall);
    const d = ctx.date, T = d.getTime() / 1000, M = Math.floor(T / 60), tm = T - M * 60;
    const H = d.getHours(), mi = d.getMinutes(), hourTurn = mi === 0;
    const light = 1;

    // the station clock: one flap per minute; hour and minute fall together at the hour
    const FALL = 0.9;
    const pH = (H + 23) % 24, pM = (mi + 59) % 60;
    if (tm > 59.25) {                                       // the latch lets go: the next flap trembles
      const w = 0.05 * Math.sin((tm - 59.25) * 2 * PI * 7) * kit.smoothstep(59.25, 59.6, tm);
      for (const [st, cur, will] of [[stM, mi, true], [stH, H, mi === 59]]) {
        st.top = st.bot = cur; st.fa = -1;
        if (will) { st.top = st.top; st.fa = cur; st.fb = (cur + 1) % (st === stM ? 60 : 24); st.ths.length = 1; st.ths[0] = Math.abs(w); st.top = st.fb; }
      }
    } else {
      turn(stM, 60, pM, 1, tm, 0, FALL, 0.34, 0.26, 1.7);
      turn(stH, 24, hourTurn ? pH : H, hourTurn ? 1 : 0, tm, 0, FALL, 0.34, 0.26, 1.7);
    }
    // at rest a big flap sometimes stirs in the draught and re-seats with a clack
    for (const [st, k, n] of [[stM, 0, 60], [stH, 1, 24]]) {
      const tw = tm - (12 + 34 * kit.hash(M, 51 + k));
      if (st.fa < 0 && kit.hash(M, 61 + k) < 0.45 && tw > 0 && tw < 0.7) {
        const b = bounceAngle(tw, 0.3, 0.42);
        if (b > 0) { st.fa = st.top; st.fb = (st.top + 1) % n; st.top = st.fb; st.ths.length = 1; st.ths[0] = b; }
      }
    }
    drawBase(HOUR, stH, light); drawBase(MIN, stM, light);

    // departures: row r is the train leaving at minute M + 1 + r
    for (const C of cells) {
      const { r, c, drum } = C;
      let st;
      if (drum === DR_CNT) {
        const s = Math.floor(tm), fr = tm - s, prev = s === 0 ? 0 : cnt(s - 1), now = cnt(s);
        const dig = (v) => 9 - (c === 16 ? Math.floor(v / 10) : v % 10);
        const from = dig(prev), steps = (dig(now) - from + 10) % 10;
        st = turn(stC, 10, from, steps, fr, s === 0 ? 0.35 : 0, 0.09, 0.3, 0.1, 1.6);
      } else {
        const from = trainRow(M + r, r)[c], to = trainRow(M + 1 + r, r)[c], n = drum.n;
        let steps = (to - from + n) % n, start = 0.35 + 0.035 * c + 0.12 * r, dur = 0.06;
        if (hourTurn) { steps += n; start = 0.45 + 0.085 * c + 0.06 * r; dur = 0.034; }
        st = turn(stC, n, from, steps, tm, start, dur, 0.28, 0.1, 1.6);
        // a stray flap now and then lifts and re-seats
        if (st.fa < 0 && tm > 6) {
          const wdx = Math.floor(T / 7), we = T - wdx * 7 - 2;
          if (we > 0 && we < 0.55 && Math.floor(kit.hash(wdx, 31) * cells.length) === r * NCELL + c) {
            const b = bounceAngle(we, 0.42, 0.3);
            if (b > 0) { st.fa = st.top; st.fb = (st.top + 1) % n; st.ths.length = 1; st.ths[0] = b; st.top = st.fb; }
          }
        }
      }
      drawBase(C, st, light);
      drawFlap(C, st, light);
    }
    drawFlap(HOUR, stH, light); drawFlap(MIN, stM, light);

    drawPigeon(T, H, 1);
    trainLight(tm, ctx.night);
    commuters(T, ctx.night);
    drawFrog(T, ctx.night);

    // night: the hall lamps go down, so the bright print dims but the dark flap faces keep their level
    const n = ctx.night;
    if (n > 0) for (let p = 0; p < img.length; p++) { const v = img[p]; img[p] = v * (1 - 0.55 * n) + 0.55 * n * (v < 0.055 ? v : 0.055); }
    kit.blitGrid(ctx, img);
  },
};
