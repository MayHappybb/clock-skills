// Frogzilla. A night harbour; the time is the skyline: four Art Deco towers
// whose silhouettes and lit windows are the digits (hours in amber, minutes
// in cool white). Behind them a giant rainbow frog in round glasses wades in
// the bay, breathing, blinking, glancing at the helicopter that circles it;
// mid-minute a glowing moth flutters close, its tongue snaps and misses, and
// it goes cross-eyed.
// Every minute it wades over and leans on the changing tower's mast: the
// tower sinks into its own dust cloud, then a tiny climbing crane rebuilds the
// new digit floor by floor inside a lit scaffold of its outline. On the hour
// it inhales and roars a rainbow beam into the clouds, the whole city flashes,
// the shaken towers come down and are rebuilt, and the frog sheepishly pushes
// its slipped glasses back up.
import * as kit from '../js/kit.js';
import { GLYPHS, GH } from './frogzilla-glyphs.js';
import { paintFrog, frogCover, rainbow, BAY } from './frogzilla-frog.js';

const W = 64, H = 64, N = W * H;
const SLOTX = [2, 16, 36, 50], TOPY = 28, STREET = TOPY + GH - 1;   // glyph rows 28..49
const WATER = 53;
const img = new Float32Array(3 * N), city = new Float32Array(3 * N), ca = new Float32Array(N);
const { clamp, smoothstep: ss, TAU } = kit;
const E = kit.ease.inOut;
const ramp = (x, a, b) => clamp((x - a) / (b - a));

// ---------------------------------------------------------------- palette
const HOUR = { facade: [0.085, 0.045, 0.02], win: kit.hex('#ffb35c').map((v) => v * 0.75) };
const MIN = { facade: [0.03, 0.05, 0.095], win: kit.hex('#cfe6ff').map((v) => v * 0.62) };
const GOLD = kit.hex('#f0b040').map((v) => v * 0.6), MAST = [0.05, 0.05, 0.06], RED = [0.6, 0.02, 0.01];
const DUST = kit.hex('#b09472').map((v) => v * 0.32), CRANE = kit.hex('#ffc23a').map((v) => v * 0.3);
const SCAF = kit.hex('#ff9a2a').map((v) => v * 0.13);

// --------------------------------------------------------- clouds texture
const CW = 128, CH = 30, CLOUD = new Float32Array(CW * CH);
for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
  // tileable in x: blend two offset copies
  const f = (xx) => kit.fbm(xx * 0.05, y * 0.13, 3.7, 4);
  const u = x / CW, n = f(x) * (1 - u) + f(x - CW) * u;
  const band = 0.75 + 0.25 * Math.sin(y * 0.33);
  CLOUD[y * CW + x] = ss(0.5, 0.78, n * band + 0.06);
}
const cloudAt = (x, y) => {
  const xi = Math.floor(x), f = x - xi, a = ((xi % CW) + CW) % CW, b = (a + 1) % CW, r = y * CW;
  return CLOUD[r + a] * (1 - f) + CLOUD[r + b] * f;
};

// the far skyline: low blocks across the bay, behind the digit towers
const FAR = new Int16Array(W), FARWIN = new Float32Array(N);
for (let x = 0, h = 0, run = 0; x < W; x++) {
  if (run <= 0) { run = 2 + Math.floor(kit.hash(x, 41) * 5); h = 34 + Math.floor(kit.hash(x, 43) * 9); }
  FAR[x] = h; run--;
  for (let y = h + 1; y <= 49; y++) FARWIN[y * W + x] = (x + y) % 2 === 0 && kit.hash(x, y, 47) > 0.88 ? 1 : 0;
}

// ------------------------------------------------------------------ time
const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (sec) => { const d = new Date(sec * 1000); return pad(d.getHours()) + pad(d.getMinutes()); };
/** The turn at boundary B (seconds): old/new strings, changed slots, hour?, delays. */
const turns = new Map();
function turnAt(B) {
  let t = turns.get(B);
  if (t) return t;
  const a = digitsAt(B - 60), b = digitsAt(B);
  const hour = a.slice(0, 2) !== b.slice(0, 2);
  const delay = [0, 0, 0, 0];
  for (let k = 0; k < 4; k++) delay[k] = hour ? 0.3 + 0.1 * k : 0.06 + 0.32 * (3 - k);
  t = { B, a, b, hour, delay, changed: [0, 1, 2, 3].map((k) => a[k] !== b[k]) };
  if (turns.size > 16) turns.clear();
  turns.set(B, t);
  return t;
}
const COLLAPSE = 1.25, REB0 = 0.7, REB = 1.95;     // per digit, from its delay

// ------------------------------------------------------------------- frog
const P = { fx: 26, fy: 18, sc: 1, breath: 1, lookX: 0, lookY: 0, open: 1, happy: 0, squeeze: 0, pupil: 1, mouth: 0, mouthO: 0, blush: 0.45, fu: 0, gdy: 0, hue: 0, glint: 0, arm: null, spot: null };
const ARM = { side: 1, hx: 0, hy: 0 };
const homeX = (t) => 24 + 5 * Math.sin(t * TAU / 43) + 3 * Math.sin(t * TAU / 19 + 1);
const lookTarget = (k) => [kit.hash(k, 7) * 2 - 1, kit.hash(k, 9) * 1.4 - 0.7];
function mastTop(slot, d) { const m = GLYPHS[+d].mast; return [SLOTX[slot] + m[0], TOPY + m[1]]; }

const MOTH = { on: false, x: 0, y: 0 }, TONGUE = { on: false, ax: 0, ay: 0, bx: 0, by: 0 };
/** Where the moth flutters at time t (seconds into the minute s), near a frog at fx. */
function mothAt(t, s, fx, fy) {
  const ent = E(ramp(s, 16, 25)), hx = fx + 21, hy = fy - 4;
  return [68 + (hx - 68) * ent + 2.2 * Math.sin(t * 2.3) + 1.1 * Math.sin(t * 5.1),
    3 + (hy - 3) * ent + 1.6 * Math.sin(t * 3.1 + 1) + 0.8 * Math.sin(t * 7.3)];
}
function drawMoth(now) {
  if (!MOTH.on) return;
  const { x, y } = MOTH, flap = Math.abs(Math.sin(now * 22));
  addPx(img, x, y, 0.6, 0.58, 0.28, 1);
  addPx(img, x, y + 0.8, 0.3, 0.28, 0.12, 1);
  addPx(img, x - 0.8 - 1.1 * flap, y - 0.5 * flap, 0.4, 0.42, 0.16, 1);
  addPx(img, x + 0.8 + 1.1 * flap, y - 0.5 * flap, 0.4, 0.42, 0.16, 1);
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {   // its glow
    const xx = Math.round(x) + i, yy = Math.round(y) + j;
    if (xx < 0 || yy < 0 || xx >= W || yy >= BAY) continue;
    const d = Math.hypot(xx - x, yy - y);
    if (d > 3.2) continue;
    const k = (1 - d / 3.2) ** 2 * 0.09, o = 3 * (yy * W + xx);
    img[o] += k; img[o + 1] += k; img[o + 2] += k * 0.35;
  }
}
function drawTongue() {
  if (!TONGUE.on) return;
  const { ax, ay, bx, by } = TONGUE;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - 2)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + 2));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - 2)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + 2));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.min(kit.segDist(x, y, ax, ay, bx, by) - 0.55, Math.hypot(x - bx, y - by) - 1.2);
    const a = clamp(0.5 - d);
    if (a <= 0) continue;
    const o = 3 * (y * W + x);
    img[o] += (0.34 - img[o]) * a; img[o + 1] += (0.07 - img[o + 1]) * a; img[o + 2] += (0.12 - img[o + 2]) * a;
  }
}

function pose(now) {
  const M = Math.floor(now / 60) * 60, s = now - M;
  const last = turnAt(M), next = turnAt(M + 60);
  const p = P;
  p.breath = 1 + 0.022 * Math.sin(now * TAU / 3.4);
  p.sc = 1; p.fu = 0; p.gdy = 0; p.mouth = 0; p.mouthO = 0; p.happy = 0; p.squeeze = 0; p.pupil = 1; p.blush = 0.45;
  p.hue = now * 0.012; p.glint = now / 6.5; p.arm = null;
  // blink and glance
  const bk = Math.floor(now / 4.3), bt = now - bk * 4.3 - (0.6 + 2.8 * kit.hash(bk, 3));
  p.open = bt > 0 && bt < 0.2 ? Math.abs(bt - 0.1) / 0.1 : 1;
  const lk = Math.floor(now / 2.6), lf = E(ramp(now - lk * 2.6, 0, 0.3));
  const l0 = lookTarget(lk - 1), l1 = lookTarget(lk);
  p.lookX = l0[0] + (l1[0] - l0[0]) * lf; p.lookY = l0[1] + (l1[1] - l0[1]) * lf;
  let fx = homeX(now), fy = 18 + 0.4 * Math.sin(now * TAU / 3.4 + 1.2);

  // ---- before the next turn: wade over, reach for the mast (minute) / inhale (hour)
  if (next.hour) {
    const w = E(ramp(s, 51, 56));
    fx += (32 - fx) * w;
    const inh = E(ramp(s, 57, 59.8));
    p.sc = 1 + 0.05 * inh; p.blush += 0.5 * inh; p.open = Math.min(p.open, 1 - 0.8 * inh);
    p.fu = -2.5 * E(ramp(s, 59.2, 60)); p.lookY -= inh;
  } else {
    const [gx, gy] = mastTop(3, last.b[3]);
    const w = E(ramp(s, 53.5, 57.5));
    fx += (gx - 19 - fx) * w;
    const r = E(ramp(s, 57.3, 59.2));
    if (r > 0) {
      const sx = fx + 12, sy = fy + 8.5, push = 1.1 * E(ramp(s, 59.5, 60));
      ARM.side = 1; ARM.hx = sx + (gx + push - sx) * r + 2 * (1 - r); ARM.hy = (sy + 9) + (gy + 2 - sy - 9) * r;
      p.arm = ARM;
      p.lookX += (1 - p.lookX) * r; p.lookY += (0.3 - p.lookY) * r;
    }
  }
  // ---- after the last turn
  if (last.hour) {
    const a = s;
    const tx = 32;
    const back = E(ramp(a, 5, 10));
    fx = tx + (fx - tx) * back;
    const roar = ramp(a, 0, 0.12) * (1 - ramp(a, 2.1, 2.6));
    const up = 1 - E(ramp(a, 2.3, 2.9));
    p.fu = Math.min(p.fu, -2.5 * up);
    p.sc = 1 + 0.05 * (1 - E(ramp(a, 0, 0.5))) + 0.03 * roar;
    p.mouth = Math.max(p.mouth, roar);
    p.squeeze = roar;
    p.open = Math.min(p.open, 1 - roar);
    if (roar > 0) { fx += 0.35 * Math.sin(now * 71) * roar; fy += 0.3 * Math.sin(now * 53) * roar; }
    // glasses slip down in the roar, pushed back up after
    const slip = E(ramp(a, 0.3, 0.6)) * (1 - E(ramp(a, 3.3, 3.8)));
    p.gdy = 2.2 * slip;
    const hand = E(ramp(a, 2.7, 3.3)) * (1 - E(ramp(a, 3.9, 4.6)));
    if (hand > 0) {
      const sx = fx + 12, sy = fy + 8.5, push = E(ramp(a, 3.3, 3.8));
      ARM.side = 1; ARM.hx = sx + (fx + 2.5 - sx) * hand; ARM.hy = sy + 9 + (fy - 4.8 + p.gdy - push * 0.3 - sy - 9) * hand;
      p.arm = ARM;
    }
    const sheep = ramp(a, 3.4, 3.8) * (1 - ramp(a, 6, 6.6));
    p.happy = sheep; p.blush += 0.7 * sheep;
    if (sheep > 0) p.open = Math.min(p.open, 1 - sheep);
    p.lookY += (-0.6 - p.lookY) * up * (1 - roar);
  } else if (s < 10) {
    const a = s, [gx] = mastTop(3, last.a[3]), tx = gx - 19;
    const back = E(ramp(a, 3.5, 9));
    fx = tx + (fx - tx) * back;
    // startled hop back, then watch the crane, then a sheepish grin
    const shock = ramp(a, 0.05, 0.2) * (1 - ramp(a, 1.5, 2.2));
    fx -= 1.6 * E(ramp(a, 0.05, 0.45)) * (1 - back);
    fy -= 1.4 * Math.sin(Math.PI * ramp(a, 0.05, 0.55));
    p.pupil = 1 - 0.4 * shock; p.mouthO = shock; p.open = Math.max(p.open, shock);
    const ret = 1 - E(ramp(a, 0.05, 0.5));
    if (ret > 0) {
      const sx = fx + 12, sy = fy + 8.5;
      const [hx, hy] = mastTop(3, last.a[3]);
      ARM.side = 1; ARM.hx = sx + (hx + 1.1 - sx) * ret + 2 * (1 - ret); ARM.hy = sy + 9 + (hy + 2 - sy - 9) * ret;
      p.arm = ARM;
    }
    const watch = ramp(a, 0.3, 0.6) * (1 - ramp(a, 2.8, 3.2));
    p.lookX += (1 - p.lookX) * watch; p.lookY += (1 - p.lookY) * watch;
    const sheep = ramp(a, 2.9, 3.2) * (1 - ramp(a, 4.6, 5));
    p.happy = sheep; p.blush += 0.6 * sheep;
    if (sheep > 0) p.open = Math.min(p.open, 1 - sheep);
  }
  // ---- mid-minute: a glowing moth flutters up; the frog's tongue snaps at it and misses
  MOTH.on = false; TONGUE.on = false; p.cross = 0;
  if (s > 16 && s < 40 && !(last.hour && s < 10)) {
    const [mx0, my0] = mothAt(now, s, fx, fy);
    const dodge = E(ramp(s, 29.6, 29.95)), leave = E(ramp(s, 32.5, 39.5));
    let mx = mx0 + 2.5 * dodge, my = my0 - 7 * dodge;
    mx += (70 - mx) * leave; my += (-5 - my) * leave;
    MOTH.on = true; MOTH.x = mx; MOTH.y = my;
    const w = ramp(s, 19, 20.5) * (1 - ramp(s, 37, 38.5));
    const lx = clamp((mx - fx) / 16, -1, 1), ly = clamp((my - fy + 7.5) / 9, -1, 1);
    p.lookX += (lx - p.lookX) * w; p.lookY += (ly - p.lookY) * w;
    p.open = Math.min(p.open, 1 - 0.35 * ramp(s, 28.4, 29.2) * (1 - ramp(s, 29.6, 29.8)));   // narrowing, taking aim
    const out = E(ramp(s, 29.3, 29.66)) * (1 - E(ramp(s, 29.72, 30.1)));
    if (out > 0) {
      const [tx, ty] = mothAt(M + 29.66, 29.66, fx, fy);
      TONGUE.on = true; TONGUE.ax = fx + 2.5; TONGUE.ay = fy + 3.6;
      TONGUE.bx = TONGUE.ax + (tx - TONGUE.ax) * out; TONGUE.by = TONGUE.ay + (ty - TONGUE.ay) * out;
      p.mouth = Math.max(p.mouth, 0.22 * Math.min(1, out * 4));
    }
    const miss = ramp(s, 30.0, 30.3) * (1 - ramp(s, 31.6, 32.1));
    p.cross = miss; p.blush += 0.5 * miss; p.mouthO = Math.max(p.mouthO, 0.5 * miss);
    if (miss > 0) { p.lookX *= 1 - miss; p.lookY += (-0.5 - p.lookY) * miss; }
  }
  p.fx = fx; p.fy = fy;
  return { M, s, last, next };
}

// --------------------------------------------------------------- the city
/** Put a cell of colour c (opacity a) at a fractional position into the city layer. */
function put(x, y, r, g, b, a) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  for (let j = 0; j < 2; j++) {
    const yy = yi + j; if (yy < 0 || yy > STREET) continue;
    const wy = j ? fy : 1 - fy;
    for (let i = 0; i < 2; i++) {
      const xx = xi + i; if (xx < 0 || xx >= W) continue;
      const w = (i ? fx : 1 - fx) * wy * a;
      if (w <= 0.001) continue;
      const p = yy * W + xx;
      city[3 * p] += r * w; city[3 * p + 1] += g * w; city[3 * p + 2] += b * w; ca[p] += w;
    }
  }
}
const col = new Float32Array(3);
/** Colour of glyph cell c in slot k at time now; window light scaled by lit. */
function cellColour(k, d, c, now, lit, night) {
  const D = k < 2 ? HOUR : MIN;
  if (c.crown === 1) {   // floodlit from below: brightest at the base of the crown
    const u = (0.55 + 0.45 * (c.y + 5) / 4) * (c.core ? 1.9 : 1);
    col[0] = GOLD[0] * u; col[1] = GOLD[1] * u * (c.core ? 1.15 : 1); col[2] = GOLD[2] * u * (c.core ? 1.6 : 1); return col;
  }
  if (c.crown === 2) { col[0] = MAST[0]; col[1] = MAST[1]; col[2] = MAST[2]; return col; }
  const g = GLYPHS[d], left = !g.ink(c.x - 1, c.y), right = !g.ink(c.x + 1, c.y);
  let f = 1 + (left ? 0.45 : 0) - (right ? 0.3 : 0) + (c.roof ? 0.5 : 0) + 0.5 * ss(14, 21, c.y);
  col[0] = D.facade[0] * f; col[1] = D.facade[1] * f; col[2] = D.facade[2] * f;
  if (c.core) {
    const h1 = kit.hash(k * 31 + c.x, c.y, d), h2 = kit.hash(c.x, c.y * 7 + k, 5);
    const ph = kit.fract(now / (25 + 70 * h1) + h2);
    const off = 0.82 - 0.25 * night;
    let on = ss(0, 0.03, ph) * (1 - ss(off, off + 0.03, ph));
    on = 0.18 + 0.82 * on;
    const w = (((c.x + c.y) & 1) ? 1 : 0.18) * on * lit * (0.85 + 0.15 * h2);
    col[0] += D.win[0] * w; col[1] += D.win[1] * w; col[2] += D.win[2] * w;
  }
  return col;
}

function drawTower(k, d, now, night, flash, opts) {
  const g = GLYPHS[d], ox = SLOTX[k];
  const { built = 99, shake = 0, lit = 1 } = opts || {};
  const D = k < 2 ? HOUR : MIN;
  // depth: each tower is a block, its shaded side and roof one LED back and up
  for (const c of g.cells) {
    if (c.crown === 2 || g.ink(c.x + 1, c.y - 1)) continue;
    const hIdx = GH - 1 - c.y;
    if (hIdx >= built) continue;
    const a = Math.min(1, built - hIdx), dx = shake * (hIdx / GH) * Math.sin(now * 47 + k);
    const top = !g.ink(c.x, c.y - 1) ? 0.55 : 0.3;
    put(ox + c.x + 1 + dx, TOPY + c.y - 1, D.facade[0] * top, D.facade[1] * top, D.facade[2] * top, a);
  }
  for (const c of g.cells) {
    const hIdx = GH - 1 - c.y;                       // floors from the street
    if (hIdx >= built) continue;
    const a = Math.min(1, built - hIdx);
    const cc = cellColour(k, d, c, now, lit * (1 + 2.2 * flash) * clamp((built - hIdx - 0.5) / 2.5 + (built > 90 ? 1 : 0)), night);
    const dx = shake * (hIdx / GH) * Math.sin(now * 47 + k);
    let r = cc[0], gg = cc[1], b = cc[2];
    if (flash > 0) { r += 0.12 * flash; gg += 0.1 * flash; b += 0.1 * flash; }
    put(ox + c.x + dx, TOPY + c.y, r, gg, b, a);
  }
  // aviation light on the mast
  if (built >= g.height) {
    const [mx, my] = g.mast, ph = kit.fract(now / 1.6 + k * 0.29);
    const pulse = Math.max(0, Math.sin(ph * TAU)) ** 3;
    put(ox + mx + shake * Math.sin(now * 47 + k), TOPY + my, RED[0] * (0.2 + pulse), RED[1] * (0.2 + pulse), RED[2], 1);
  }
}

/** The old tower sinking into its own dust, with debris thrown out. */
function drawCollapse(k, d, u, now, dir) {
  const g = GLYPHS[d], ox = SLOTX[k];
  const lit = Math.max(0, 1 - u / 0.3) * (kit.hash(Math.floor(now * 20), k) > 0.4 ? 1 : 0.3);
  for (const c of g.cells) {
    const h1 = kit.hash(c.x, c.y, 11 + d), h2 = kit.hash(c.y, c.x, 13);
    const hIdx = GH - 1 - c.y, ht = hIdx / GH;
    const t = Math.max(0, u - 0.05 * h1 - 0.12 * (1 - ht));
    const fall = 0.5 * 64 * t * t;
    const x = ox + c.x + dir * 1.6 * ht * E(clamp(u / 0.5)) + (h2 - 0.5) * 5 * t * ht;
    const y = TOPY + c.y + fall;
    if (y > STREET + 0.5) continue;
    const a = 1 - ss(STREET - 2.5, STREET + 0.5, y);
    const cc = cellColour(k, d, c, now, lit, 0);
    const m = clamp(t * 1.4);
    put(x, y, cc[0] + (DUST[0] - cc[0]) * m, cc[1] + (DUST[1] - cc[1]) * m, cc[2] + (DUST[2] - cc[2]) * m, a);
  }
}

function drawDebrisAndDust(k, u) {
  const cx = SLOTX[k] + 6;
  // flying chunks
  for (let j = 0; j < 9; j++) {
    const h1 = kit.hash(k, j, 1), h2 = kit.hash(k, j, 2), h3 = kit.hash(k, j, 3);
    const t = u - 0.1 - 0.25 * h3;
    if (t <= 0) continue;
    const vx = (h1 - 0.5) * 26, vy = -6 - 10 * h2;
    const x = cx + (h1 - 0.5) * 8 + vx * t, y = TOPY + 4 + 10 * h3 + vy * t + 0.5 * 60 * t * t;
    if (y > STREET + 2 || x < 0 || x >= W) continue;
    addPx(img, x, y, DUST[0] * 1.6, DUST[1] * 1.6, DUST[2] * 1.6, 1 - ss(STREET - 1, STREET + 2, y));
  }
  // dust cloud: soft puffs rising and spreading, lit by the street
  const env = ss(0, 0.35, u) * (1 - ss(1.0, 2.4, u));
  if (env <= 0) return;
  for (let j = 0; j < 8; j++) {
    const h1 = kit.hash(k, j, 21), h2 = kit.hash(k, j, 22);
    const px = cx + (h1 - 0.5) * 17 + u * 1.2, py = STREET + 1 - (2 + 6 * h2) * kit.ease.out(clamp(u / 1.4));
    const r = 1.8 + (2.5 + 2.5 * h2) * kit.ease.out(clamp(u / 1.5));
    const x0 = Math.max(0, Math.floor(px - r)), x1 = Math.min(W - 1, Math.ceil(px + r));
    const y0 = Math.max(0, Math.floor(py - r)), y1 = Math.min(STREET + 1, Math.ceil(py + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dd = ((x - px) ** 2 + (y - py) ** 2) / (r * r);
      if (dd >= 1) continue;
      const a = (1 - dd) ** 2 * env * 0.3, o = 3 * (y * W + x);
      img[o] += (DUST[0] - img[o]) * a; img[o + 1] += (DUST[1] - img[o + 1]) * a; img[o + 2] += (DUST[2] - img[o + 2]) * a;
    }
  }
}

/** Additive light at a fractional position (bilinear). */
function addPx(buf, x, y, r, g, b, a) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const xx = xi + i, yy = yi + j;
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy) * a, o = 3 * (yy * W + xx);
    buf[o] += r * w; buf[o + 1] += g * w; buf[o + 2] += b * w;
  }
}
/** A thin anti-aliased line, additive. */
function line(ax, ay, bx, by, c, a) {
  const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) * 1.5));
  for (let i = 0; i <= n; i++) { const t = i / n; addPx(img, ax + (bx - ax) * t, ay + (by - ay) * t, c[0], c[1], c[2], a / 1.5); }
}

/** Scaffold of the new digit, the built floors, and the climbing crane. */
function drawRebuild(k, d, v, u, now, night) {
  const g = GLYPHS[d], ox = SLOTX[k];
  // the scaffold goes up as soon as the old tower starts to fall
  const ghost = ss(0.4, 0.75, u) * (1 - ss(1, 1.15, v));
  const prog = clamp(v), Hb = g.height * prog;
  // floor by floor: each floor eases in, so the front moves in little lifts
  const fl = Hb, fi = Math.floor(fl), built = fi + E(fl - fi);
  if (ghost > 0) for (const c of g.cells) {
    if (c.core && !c.crown) continue;
    const hIdx = GH - 1 - c.y;
    if (hIdx < built - 0.5) continue;
    const blink = ((c.x + c.y + Math.floor(now * 5)) & 7) === 0 ? 1.6 : 1;
    addPx(img, ox + c.x, TOPY + c.y, SCAF[0] * blink, SCAF[1] * blink, SCAF[2] * blink, ghost);
  }
  if (v <= 0) return;
  drawTower(k, d, now, night, 0, { built: v >= 1 ? 99 : built });
  if (v >= 1.2) return;
  // crane on the build front: mast, luffing jib, hook and load, red light
  const cf = ss(0, 0.1, v) * (1 - ss(1, 1.2, v));
  const fy = TOPY + GH - 1 - built + 0.5, lift = 4 * ss(1, 1.2, v);
  const cx = ox + 6 + 2.5 * Math.sin(v * 9), by = fy - lift;
  line(cx, by, cx, by - 4, CRANE, cf);
  const jx = cx + 4.2, jy = by - 6.6;
  line(cx, by - 4, jx, jy, CRANE, cf);
  line(cx, by - 4, cx - 2, by - 4, CRANE, cf * 0.7);
  const sw = Math.sin(now * 5) * 0.6;
  line(jx, jy, jx + sw, by - 1.5, CRANE, cf * 0.35);
  addPx(img, jx + sw, by - 1, 0.25, 0.2, 0.12, cf);
  addPx(img, jx, jy - 0.5, RED[0], RED[1], RED[2], cf * (0.4 + 0.6 * (Math.sin(now * 8) > 0)));
  // welding sparks on the front
  if (v < 1) for (let j = 0; j < 2; j++) {
    const f = Math.floor(now * 14) + j * 7, h = kit.hash(f, k, j);
    if (h < 0.45) continue;
    const c = g.cells[Math.floor(kit.hash(f, k, 9) * g.cells.length)];
    addPx(img, ox + c.x, fy - 0.5, 0.5, 0.55, 0.7, (h - 0.45) * 1.6);
  }
}

// ------------------------------------------------------------------- sky
function drawSky(now, frog, beam) {
  const scroll = now * 0.35;
  const s1 = -Math.PI / 2 + 0.55 * Math.sin(now * 0.31), s2 = -Math.PI / 2 + 0.5 * Math.sin(now * 0.23 + 2.1);
  const b1x = SLOTX[0] + 4, b2x = SLOTX[3] + 8, by = TOPY + 1;
  const d1x = Math.cos(s1), d1y = Math.sin(s1), d2x = Math.cos(s2), d2y = Math.sin(s2);
  for (let y = 0; y < WATER; y++) {
    const v = y / 30;
    let sr = 0.003 + 0.010 * v * v, sg = 0.003 + 0.005 * v * v, sb = 0.012 + 0.012 * v;
    if (y > BAY) { sr = 0.002; sg = 0.004; sb = 0.011; }
    for (let x = 0; x < W; x++) {
      let r = sr, g = sg, b = sb;
      if (y >= FAR[x]) {  // the far skyline across the bay, dark, a few windows
        const wv = FARWIN[y * W + x];
        r = 0.007 + 0.03 * wv; g = 0.008 + 0.022 * wv; b = 0.017 + 0.012 * wv;
      }
      if (y < CH) {
        const cd = cloudAt(x + scroll + y * 0.4, y);
        let L = 0;
        // searchlights
        for (let s = 0; s < 2; s++) {
          const ox = s ? b2x : b1x, dx = s ? d2x : d1x, dy = s ? d2y : d1y;
          const px = x - ox, py = y - by, al = px * dx + py * dy;
          if (al <= 0) continue;
          const pe = Math.abs(px * dy - py * dx), w = 0.5 + al * 0.09;
          if (pe > 3 * w) continue;
          L += Math.exp(-(pe * pe) / (w * w)) * (1 - al / 110) * ss(0, 6, al) * 1.8;
        }
        const cl = 0.6 + 0.4 * v;
        r += cd * (0.016 * cl + 0.06 * L); g += cd * (0.012 * cl + 0.065 * L); b += cd * (0.024 * cl + 0.075 * L);
        r += 0.006 * L; g += 0.008 * L; b += 0.012 * L;
        if (beam.env > 0) {     // the roar lights the clouds in rainbow
          const k = beam.env * Math.exp(-(((x - beam.x) / 16) ** 2)) * (0.25 + cd * 2.4);
          rainbow(y * 0.035 + (x - beam.x) * 0.02 - now * 0.6, col, 0.12 * k);
          r += col[0] + 0.01 * beam.env; g += col[1] + 0.006 * beam.env; b += col[2] + 0.014 * beam.env;
        }
      }
      if (beam.ring > 0) {    // the roar's shock rings
        const dd = Math.hypot(x - beam.x, (y - beam.y) * 1.3);
        for (let j = 0; j < 2; j++) {
          const R = beam.ring * 70 - j * 9, e = (dd - R) / 1.6;
          if (R > 0 && e * e < 9) { const k = Math.exp(-e * e) * 0.05 * (1 - beam.ring) * (1 - 0.4 * j); r += k * 0.8; g += k * 0.7; b += k; }
        }
      }
      const o = 3 * (y * W + x);
      img[o] = r; img[o + 1] = g; img[o + 2] = b;
    }
  }
  // the frog's wake on the bay line, seen between the towers
  for (let x = 0; x < W; x++) {
    const dx = Math.abs(x - frog.fx);
    if (dx > 24) continue;
    const w = 0.5 + 0.5 * Math.sin(dx * 1.1 - now * 3.2);
    const a = (1 - dx / 24) * w * 0.035, o = 3 * (31 * W + x);
    img[o] += a * 0.6; img[o + 1] += a * 0.8; img[o + 2] += a;
  }
}

function drawBeam(now, beam) {
  if (beam.env <= 0) return;
  const reach = 70 * kit.ease.out(clamp(beam.age / 0.3));
  for (let y = Math.floor(beam.y); y >= 0; y--) {
    const al = beam.y - y;
    if (al > reach) break;
    const cx = beam.x + 0.7 * Math.sin(al * 0.32 - now * 10) * Math.min(1, al / 10);
    const w = 2.2 + al * 0.2;
    const x0 = Math.max(0, Math.floor(cx - 2.2 * w)), x1 = Math.min(W - 1, Math.ceil(cx + 2.2 * w));
    const front = 1 - ss(reach - 4, reach, al);
    for (let x = x0; x <= x1; x++) {
      const u = (x - cx) / w, au = Math.abs(u);
      let k = au < 1 ? (1 - u * u) ** 1.2 : 0;
      const glow = Math.exp(-u * u * 0.6) * 0.18;
      rainbow((u + 1) * 0.42 - 0.02, col, 1.1 * k);
      const core = Math.max(0, 1 - au / 0.25) * 0.22;
      const e = beam.env * front * ss(0, 1.5, al), o = 3 * (y * W + x);
      img[o] += (col[0] + core + glow * 0.3) * e;
      img[o + 1] += (col[1] + core + glow * 0.2) * e;
      img[o + 2] += (col[2] + core + glow * 0.35) * e;
    }
  }
}

// ------------------------------------------------------------- helicopter
function drawHeli(now, frog, front) {
  const th = now * TAU / 15;
  const z = Math.sin(th);
  if ((z > 0) !== front) return;
  const hx = frog.fx + 23 * Math.cos(th), hy = 6.5 + 2.2 * z;
  const dir = -Math.sin(th) >= 0 ? 1 : -1;
  const near = 0.75 + 0.25 * z;
  const x0 = Math.max(0, Math.floor(hx - 6)), x1 = Math.min(W - 1, Math.ceil(hx + 6));
  for (let y = Math.max(0, Math.floor(hy - 3)); y <= hy + 2.5; y++) for (let x = x0; x <= x1; x++) {
    const X = (x - hx) * dir, Y = y - hy;
    let a = 0;
    const db = (Math.hypot(X / 1.7, Y / 1.0) - 1) * 1.0;
    a = Math.max(a, clamp(0.5 - db));
    const dt = Math.abs(Y + 0.2 + X * 0.08) - 0.35;
    if (X < -1 && X > -4.4) a = Math.max(a, clamp(0.5 - dt) * 0.8);
    const rotor = Math.abs(Y + 1.6) < 0.5 && Math.abs(X) < 3 ? (0.5 + 0.5 * Math.sin(now * 60 + X)) * 0.6 : 0;
    if (!front && frogCover(frog, x, y) > 0.5) continue;
    if (a <= 0 && rotor <= 0) continue;
    const o = 3 * (y * W + x);
    const m = a * near;
    img[o] += (0.13 - img[o]) * m; img[o + 1] += (0.14 - img[o + 1]) * m; img[o + 2] += (0.17 - img[o + 2]) * m;
    img[o] += 0.04 * rotor; img[o + 1] += 0.04 * rotor; img[o + 2] += 0.05 * rotor;
  }
  addPx(img, hx + dir * 1.0, hy - 0.1, 0.35, 0.3, 0.15, near);
  const blink = kit.fract(now * 1.3) < 0.15 ? 1 : 0.15;
  addPx(img, hx - dir * 4.2, hy - 0.6, RED[0] * blink, RED[1], RED[2], 1);
  // its spotlight on the frog
  if (front) {
    const tx = frog.fx + 6 * Math.cos(th * 0.5), ty = frog.fy - 2;
    for (let i = 1; i < 12; i++) {
      const t = i / 12, x = hx + (tx - hx) * t, y = hy + 1 + (ty - hy - 1) * t;
      addPx(img, x, y, 0.03, 0.03, 0.028, 0.6 * (1 - t * 0.5));
    }
  }
}

// ------------------------------------------------------------ road, water
function drawRoad(now, night) {
  for (let lane = 0; lane < 2; lane++) {
    const y = STREET + 2 + lane, dir = lane ? -1 : 1, v = lane ? 6.2 : 8.4;
    const c = lane ? [0.22, 0.02, 0.01] : [0.3, 0.26, 0.17];
    const n = Math.round(7 - 3 * night);
    for (let j = 0; j < n; j++) {
      const h = kit.hash(j, lane, 77);
      const x = kit.fract(h + dir * now * v / 84) * 84 - 10;
      // a car is a 1.6-LED light glided by coverage
      const xi = Math.floor(x);
      for (let i = 0; i < 3; i++) {
        const xx = xi + i; if (xx < 0 || xx >= W) continue;
        const cv = clamp(Math.min(xx + 1, x + 1.6) - Math.max(xx, x));
        if (cv <= 0) continue;
        const o = 3 * (y * W + xx);
        img[o] += c[0] * cv; img[o + 1] += c[1] * cv; img[o + 2] += c[2] * cv;
      }
    }
  }
}

function drawWater(now) {
  for (let y = WATER; y < H; y++) {
    const depth = (y - WATER) / (H - WATER), src = 2 * STREET + 4 - y;
    const fade = 0.42 * (1 - 0.7 * depth);
    for (let x = 0; x < W; x++) {
      const dx = 0.9 * Math.sin(y * 1.7 - now * 1.9 + x * 0.15) + 0.6 * Math.sin(x * 0.45 + now * 1.3 + y);
      const sx = x + dx, xi = Math.floor(sx), f = sx - xi;
      let r = 0.002, g = 0.004, b = 0.010;
      const streak = 0.55 + 0.45 * Math.sin(y * 2.3 + now * 2.6 + Math.sin(x * 0.3));
      if (src >= 0 && src <= STREET) {
        const a = Math.max(0, Math.min(W - 1, xi)), bb = Math.max(0, Math.min(W - 1, xi + 1));
        const oa = 3 * (src * W + a), ob = 3 * (src * W + bb), k = fade * streak;
        r += (city[oa] * (1 - f) + city[ob] * f) * k;
        g += (city[oa + 1] * (1 - f) + city[ob + 1] * f) * k;
        b += (city[oa + 2] * (1 - f) + city[ob + 2] * f) * k;
      }
      // moonless chop: faint highlights travelling across
      const hl = kit.noise2(x * 0.35 - now * 0.8, y * 0.9 + now * 0.3);
      if (hl > 0.72) { const k = (hl - 0.72) * 0.08; r += k * 0.6; g += k * 0.8; b += k; }
      const o = 3 * (y * W + x);
      img[o] = r; img[o + 1] = g; img[o + 2] = b;
    }
  }
}

// ------------------------------------------------------------------ frame
const BEAM = { env: 0, x: 32, y: 20, age: 0, ring: 0 };

export default {
  name: 'Frogzilla',
  blurb: 'the time is a harbour skyline of Art Deco towers; a giant rainbow frog in glasses topples and cranes rebuild them',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, night = ctx.night;
    const T = pose(now), { s, last } = T, frog = P;
    // the roar's beam
    BEAM.env = 0; BEAM.ring = 0;
    if (last.hour && s < 2.7) {
      BEAM.age = s; BEAM.env = ss(0, 0.12, s) * (1 - ss(2.0, 2.6, s));
      BEAM.x = frog.fx; BEAM.y = frog.fy + (3.6 + frog.fu) * frog.sc - 0.5;
      BEAM.ring = s < 1.4 ? s / 1.4 : 0;
    }
    const flash = last.hour ? ss(0.1, 0.3, s) * (1 - ss(0.5, 1.6, s)) : 0;

    drawSky(now, frog, BEAM);
    drawHeli(now, frog, false);
    frog.spot = null;
    {
      const th = now * TAU / 15;
      if (Math.sin(th) > 0) { P.spot = { x: frog.fx + 6 * Math.cos(th * 0.5), y: frog.fy - 2, a: 0.7 * Math.sin(th) }; }
    }
    paintFrog(img, frog);
    drawTongue();
    drawMoth(now);
    drawBeam(now, BEAM);
    drawHeli(now, frog, true);

    // city layer
    city.fill(0); ca.fill(0);
    const rebuilds = [];
    for (let k = 0; k < 4; k++) {
      const changed = last.changed[k] && s < 6;
      const u = s - last.delay[k];
      const pushShake = !T.next.hour && k === 3 ? 0.35 * ss(59.4, 60, s) : 0;
      if (!changed || u < 0) {
        const hourShake = last.hour && changed ? 0.4 * ss(0, 0.2, s) : 0;
        drawTower(k, +(changed ? last.a[k] : last.b[k]), now, night, flash, { shake: pushShake + hourShake });
        continue;
      }
      if (u < COLLAPSE) drawCollapse(k, +last.a[k], u, now, k === 3 || !last.hour ? 1 : (k < 2 ? -1 : 1));
      const v = (u - REB0) / REB;
      if (v >= 1.2) drawTower(k, +last.b[k], now, night, flash, {});
      else rebuilds.push([k, v, u]);
    }
    // composite city over the sky
    for (let p = 0; p <= (STREET + 1) * W - 1; p++) {
      const a = Math.min(1, ca[p]);
      if (a <= 0) continue;
      const o = 3 * p;
      img[o] = img[o] * (1 - a) + city[o]; img[o + 1] = img[o + 1] * (1 - a) + city[o + 1]; img[o + 2] = img[o + 2] * (1 - a) + city[o + 2];
    }
    for (const [k, v, u] of rebuilds) {
      if (u < 2.6) drawDebrisAndDust(k, u);   // dust first: the scaffold lights shine through it
      {
        // the rebuild draws into the city layer: composite those cells now
        city.fill(0); ca.fill(0);
        drawRebuild(k, +last.b[k], v, u, now, night);
        for (let p = 0; p <= (STREET + 1) * W - 1; p++) {
          const a = Math.min(1, ca[p]);
          if (a <= 0) continue;
          const o = 3 * p;
          img[o] = img[o] * (1 - a) + city[o]; img[o + 1] = img[o + 1] * (1 - a) + city[o + 1]; img[o + 2] = img[o + 2] * (1 - a) + city[o + 2];
        }
      }
    }
    // for the reflection, the city layer must hold the whole skyline: copy back from img
    for (let p = 0; p < (STREET + 1) * W; p++) { const o = 3 * p; city[o] = img[o]; city[o + 1] = img[o + 1]; city[o + 2] = img[o + 2]; }
    for (let y = STREET + 1; y < WATER; y++) for (let x = 0; x < W; x++) { const o = 3 * (y * W + x); img[o] = 0.0015; img[o + 1] = 0.0015; img[o + 2] = 0.003; }
    drawRoad(now, night);
    drawWater(now);

    const dim = 1 - 0.55 * night;
    kit.blitGrid(ctx, img, dim);
  },
};
