// Mischief: four glazed ceramic numerals stand on a shelf, and the ginger
// cat who lives there cannot leave them alone.
//
// Most of the minute it sits by the window: tail swishing, blinking,
// tracking a fly, now and then a yawn. A few seconds before the minute
// turns it gets up and pads along behind the numerals (only its ears, eyes
// and question-mark tail show over the top), rears up and paws each digit
// that is about to change off the front of the shelf, right to left. After
// :00 the new numerals drop in from above, bounce and settle; the cat jumps,
// tail puffed, then wanders back to the window and sits.
//
// Never a wrong digit: every old numeral is off the shelf before :00 and no
// new one appears before it.
//
// Type: the rounded vector digits, fired as chunky glazed ceramics (glaze
// face, a darker fired side, a painted band, a wet highlight), one glaze per
// numeral so a new digit arrives in a new colour. AA throughout: the cat is
// all curves and every motion glides.
//
// Palette: dark green striped wallpaper so the glazes and the ginger cat
// stand off it; the window's sky follows the real day, and at night the
// room goes blue and the cat's eyes catch the light.

import { Gfx, strokeDigit, from565, rgb, R, G, B, mix, scale, hex, sin, cos, clamp, rand, noise, ease, progress, lerp, clockFields, previousMinute } from '../js/kit.js';

// ------------------------------------------------------------ layout
const SHELF = 62;                     // shelf surface
const DW = 24, DH = 28, DTOP = SHELF - DH;
const DX = [5, 31, 67, 93];
const dcx = (i) => DX[i] + DW / 2;
const REST = 140;                     // where the cat sits, in front of the window
const WALK = 40;                      // px/s
const batX = (i) => dcx(i) + 11;      // where the cat stands to bat digit i
const RISE = 0.5, RAISE = 0.34, PUSH = 0.3, FALL = 0.62, BAT = RAISE + PUSH + FALL;
const GONE = 59.85;                   // the last old numeral is off screen by then
const DROP = 0.8;                     // a new numeral's fall and bounce
const WIN = { x: 124, y: 5, w: 32, h: 40 };

// ------------------------------------------------------------ colours
const GLAZE = ['f1e6cf', '5a86e6', 'e8b33a', 'e0704f', '8fc7e8', 'f08a8a', 'b49ae0', 'f2dc7a', 'f5b07a', 'e0566a'].map(hex);
const BAND = ['4f7fe0', 'f1e6cf', '8a4a1a', 'f6e8d0', '2f5fa0', 'fff4e8', 'f6eefc', 'b05a2a', '8a3a3a', 'fff0f0'].map(hex);
const BISQUE = hex('e6c7a0');
const WALL_A = hex('2f4a3e'), WALL_B = hex('2a4338'), WALL_NIGHT = hex('172431');
const WOOD_TOP = hex('c08a56'), WOOD = hex('8e5d36'), WOOD_DARK = hex('6a4226');
const FUR = hex('ea8b3c'), FUR_DARK = hex('b65e22'), CREAM = hex('f7e4c4'), PINK = hex('f2a0a8'), IRIS = hex('c9de4c');

const SKY = [
  [0, '0a1030', '1c2a55'], [5.5, '141a44', '3a3a70'], [6.5, '4a5aa0', 'f0a070'], [8, '4a8ad8', 'b8dcf5'],
  [16.5, '4a8ad8', 'c0e0f5'], [18.2, '5050a0', 'ffa060'], [19.3, '24285c', 'b06a70'], [20.5, '0c1232', '1e2a52'], [24, '0a1030', '1c2a55'],
].map(([h, a, b]) => [h, hex(a), hex(b)]);
const LIT = [[0, 0.5], [6, 0.5], [7.5, 1], [17.5, 1], [19.5, 0.5], [24, 0.5]];

function keyed(table, h, pick) {
  let k = 1;
  while (table[k][0] < h) k++;
  const a = table[k - 1], b = table[k];
  return pick(a, b, (h - a[0]) / (b[0] - a[0]));
}

// ------------------------------------------------------------ the plot

/** Before the turn: walk behind the numerals that will change, right to left, and bat each off. */
function removal(cur, nxt) {
  const idx = [3, 2, 1, 0].filter((i) => cur[i] !== nxt[i]);
  const segs = [{ kind: 'rise', t0: 0, t1: RISE, x0: REST, x1: REST }];
  let t = RISE, x = REST;
  for (const i of idx) {
    const tx = batX(i), d = Math.max(0.3, Math.abs(tx - x) / WALK);
    segs.push({ kind: 'walk', t0: t, t1: t + d, x0: x, x1: tx }); t += d; x = tx;
    segs.push({ kind: 'bat', t0: t, t1: t + BAT, x0: x, x1: x, i }); t += BAT;
  }
  const shift = GONE - t;
  for (const sg of segs) { sg.t0 += shift; sg.t1 += shift; }
  return { segs, start: segs[0].t0, bats: Object.fromEntries(segs.filter((sg) => sg.kind === 'bat').map((sg) => [sg.i, sg.t0])) };
}

/** After the turn: the new numerals drop in, left to right; the cat jumps, then goes home. */
function arrival(prv, cur) {
  const idx = [0, 1, 2, 3].filter((i) => prv[i] !== cur[i]);
  const drops = Object.fromEntries(idx.map((i, k) => [i, 0.15 + k * 0.28]));
  const x0 = batX(Math.min(...idx));            // where the cat stood for its last bat
  const hop = 0.15 + DROP * 0.364;              // first impact (outBounce)
  const back0 = 2.4, back1 = back0 + Math.abs(REST - x0) / WALK;
  return { drops, x0, hop, back0, back1, sat: back1 + 0.5 };
}

/** The cat's pose at second s of the minute. */
function catAt(s, A, Rm, tod, key) {
  const P = { x: REST, k: 0, dir: -1, phase: 0, rear: 0, paw: null, look: [0, 0], hop: 0, puff: 0, yawn: 0, swish: 1, hunting: 0 };
  if (s < A.sat) {
    // just after the turn: standing where it batted, then home
    P.k = 1; P.x = A.x0;
    P.look = [-0.6, 0.5];
    const hu = progress(s, A.hop, A.hop + 0.42);
    if (hu > 0 && hu < 1) P.hop = 7 * sin(Math.PI * hu);
    P.puff = clamp(1 - progress(s, A.hop + 0.3, A.hop + 2.2), 0, 1) * (s > A.hop ? 1 : 0);
    if (s >= A.back0) {
      const u = progress(s, A.back0, A.back1);
      P.x = lerp(A.x0, REST, ease.inOutQuad(u)); P.dir = 1; P.look = [0.6, 0];
      if (s >= A.back1) { P.dir = -1; P.k = 1 - ease.inOutQuad(progress(s, A.back1, A.sat)); P.look = [-0.3, 0]; }
    }
  } else if (s < Rm.start) {
    // idle by the window
  } else {
    const sg = Rm.segs.find((g) => s >= g.t0 && s < g.t1) ?? Rm.segs[Rm.segs.length - 1];
    P.hunting = 1; P.k = 1;
    if (sg.kind === 'rise') { P.k = ease.inOutQuad(progress(s, sg.t0, sg.t1)); P.look = [-0.8, 0.2]; }
    else if (sg.kind === 'walk') {
      const u = progress(s, sg.t0, sg.t1);
      P.x = lerp(sg.x0, sg.x1, u); P.dir = sg.x1 < sg.x0 ? -1 : 1; P.look = [P.dir * 0.8, 0.3];
    } else {
      P.x = sg.x0;
      const u = s - sg.t0, X = dcx(sg.i);
      const up = [X + 7, DTOP - 6], over = [X + 1, DTOP - 1.5];
      if (u < RAISE) { const v = ease.outQuad(u / RAISE); P.rear = v; P.paw = [lerp(P.x - 8, up[0], v), lerp(DTOP + 8, up[1], v)]; P.look = [-0.7, 0.4]; }
      else if (u < RAISE + PUSH) {
        const v = ease.inOutQuad((u - RAISE) / PUSH);
        P.rear = 1; P.paw = [lerp(up[0], over[0], v), lerp(up[1], over[1] + 4 * v, v)]; P.look = [-0.5, 0.6];
      } else {
        const v = ease.inOutQuad(clamp((u - RAISE - PUSH) / (BAT - RAISE - PUSH), 0, 1));
        P.rear = 1 - v; P.paw = v < 0.6 ? [lerp(over[0], P.x - 6, v / 0.6), lerp(over[1] + 4, DTOP + 4, v / 0.6)] : null;
        P.look = [-0.3, 1];
      }
    }
  }
  if (P.k > 0.5 && P.rear === 0 && P.paw === null && P.hop === 0) P.phase = P.x / 5.5;
  // idle life: tail, a yawn some minutes, ear twitches
  P.swish = P.hunting ? 2.4 : 1;
  if (P.k === 0 && rand(key, 5) < 0.55) P.yawn = Math.max(0, sin(Math.PI * progress(s, 29, 31.6)));
  P.ear = Math.max(0, sin(Math.PI * progress(tod % 7.3, 0, 0.35)));
  return P;
}

// ------------------------------------------------------------ drawing
function ceramic(g, d, x, y, h, light, { shadow = true, face = 1, back = false } = {}) {
  const glaze = back ? scale(BISQUE, light * face) : scale(GLAZE[d], light * face);
  const side = scale(back ? BISQUE : GLAZE[d], light * 0.55);
  const o = { weight: 6, aa: true };
  if (shadow) strokeDigit(g, d, x + 3, y + 1.8, DW, h, { ...o, c: 0x000000, a: 0.3 });
  strokeDigit(g, d, x + 1.3, y + 1.3, DW, h, { ...o, c: side });
  strokeDigit(g, d, x, y, DW, h, { ...o, c: glaze });
  if (back) return;
  g.clip(x - 3, y + h * 0.57, DW + 6, Math.max(1, h * 0.13));
  strokeDigit(g, d, x, y, DW, h, { ...o, c: scale(BAND[d], light * face) });
  g.unclip();
  const hw = 1.5, ins = (6 - hw) / 2;
  strokeDigit(g, d, x + ins - 1, y + ins - 1.1, DW - 2 * ins, h - 2 * ins, { weight: hw, aa: true, c: mix(glaze, 0xffffff, 0.65), a: 0.55 });
}

function drawCat(g, P, light, night, tod, blinkOpen, rim) {
  const aa = { aa: true };
  const L = (c) => scale(c, light);
  const k = P.k, d = P.dir, gy = SHELF - P.hop;
  const bcx = P.x - d * lerp(1, 0, k), bcy = gy - lerp(10, 14, k) - 2 * P.rear;
  const brx = lerp(7.5, 11.5, k) - 2.5 * P.rear, bry = lerp(10, 6, k) + 2.5 * P.rear;
  const hr = 7;
  const hx = P.x + d * lerp(2.5, 12, k) + d * 1.5 * P.rear + P.look[0] * 0.8;
  const hy = gy - lerp(24, 29, k) - 7 * P.rear + P.look[1] * 0.6;

  // tail: a chain of segments, swishing
  const tb = [lerp(P.x - d * 6, bcx - d * brx * 0.9, k), lerp(gy - 3, bcy - bry * 0.4, k)];
  const pts = [tb];
  let a = lerp(-0.25, -Math.PI / 2 + 0.35, k) * (d < 0 ? 1 : -1) + (d < 0 ? 0 : Math.PI);
  for (let j = 1; j <= 7; j++) {
    const curl = lerp(-0.32, 0.2, k) * (d < 0 ? 1 : -1);
    a += curl + 0.34 * P.swish * 0.5 * sin(tod * 2.1 * P.swish - j * 0.55) * (d < 0 ? 1 : -1) * 0.6;
    const p = pts[j - 1];
    pts.push([p[0] + 2.7 * cos(a), p[1] + 2.7 * sin(a)]);
  }
  const tw = 3.1 + 2.2 * P.puff;
  if (rim) g.stroke(pts.map(([x, y]) => [x + 0.7, y - 0.7]), tw, rim, aa);
  g.stroke(pts, tw, L(FUR), aa);
  g.fillCircle(pts[7][0], pts[7][1], tw / 2, L(FUR_DARK), aa);

  // legs: four, from sitting to walking
  const leg = (fx, top, bot, w, c) => g.thickLine(fx, top, bot[0], bot[1], w, c, aa);
  for (const [side, far] of [[1, true], [1, false], [-1, true], [-1, false]]) {
    const off = (far ? -1.3 : 1.3);
    const sitX = side === 1 ? P.x + d * 3.5 + off : P.x - d * 3 + off;
    const walkX = bcx + side * d * brx * 0.55 + off;
    const sw = k * 3.2 * sin(P.phase + (side === 1 ? 0 : Math.PI) + (far ? Math.PI : 0));
    const lift = k * 1.6 * Math.max(0, cos(P.phase + (side === 1 ? 0 : Math.PI) + (far ? Math.PI : 0)));
    const lx = lerp(sitX, walkX, k), top = bcy + bry * 0.3;
    if (P.paw && side === 1 && !far) continue;            // that leg is up, batting
    leg(lx, top, [lx + sw, gy - lift], 2.6, L(far ? FUR_DARK : FUR));
    g.fillCircle(lx + sw, gy - lift - 0.6, 1.4, L(far ? FUR_DARK : CREAM), aa);
  }

  // body, haunch, stripes, chest
  if (rim) g.fillEllipse(bcx + 0.7, bcy - 0.8, brx, bry, rim, aa);
  g.fillEllipse(bcx, bcy, brx, bry, L(FUR), aa);
  if (k < 1) g.fillEllipse(P.x - d * 3.5, gy - 5, 6 * (1 - k), 5 * (1 - k) + 0.01, L(FUR), aa);
  for (let j = 0; j < 3; j++) {
    const th = -Math.PI / 2 - d * (j - 1) * 0.55 - d * 0.35;
    const ex = bcx + brx * cos(th), ey = bcy + bry * sin(th);
    g.thickLine(ex, ey, lerp(ex, bcx, 0.4), lerp(ey, bcy, 0.4), 1.4, L(FUR_DARK), aa);
  }
  g.fillEllipse(bcx + d * brx * 0.55, bcy + bry * 0.05, brx * 0.32, bry * 0.55, L(CREAM), aa);

  // neck and head
  g.thickLine(bcx + d * brx * 0.5, bcy - bry * 0.5, hx, hy + 2, 6.5, L(FUR), aa);
  if (rim) g.fillEllipse(hx + 0.7, hy + 0.1, hr * 1.12, hr * 0.92, rim, aa);
  g.fillEllipse(hx, hy + 0.8, hr * 1.12, hr * 0.92, L(FUR), aa);
  for (const sd of [-1, 1]) {
    const tw2 = sd === 1 ? P.ear : 0;
    const b1 = [hx + sd * hr * 0.98, hy - hr * 0.15], b2 = [hx + sd * hr * 0.12, hy - hr * 0.8];
    const tip = [hx + sd * hr * (0.95 + 0.25 * tw2), hy - hr * (1.5 - 0.3 * tw2)];
    if (rim) g.fillPolygon([b1, tip, b2].map(([x, y]) => [x + 0.7, y - 0.5]), rim, aa);
    g.fillPolygon([b1, tip, b2], L(FUR), aa);
    const cx = (b1[0] + b2[0] + tip[0]) / 3, cy = (b1[1] + b2[1] + tip[1]) / 3;
    g.fillPolygon([b1, tip, b2].map(([x, y]) => [cx + (x - cx) * 0.5, cy + (y - cy) * 0.5 + 0.3]), L(PINK), aa);
  }
  for (const dx of [-1.6, 0, 1.6]) g.thickLine(hx + dx, hy - hr * 0.78, hx + dx * 0.7, hy - hr * 0.42, 0.9, L(FUR_DARK), aa);
  g.fillEllipse(hx, hy + hr * 0.45, hr * 0.5, hr * 0.32, L(CREAM), aa);

  // eyes: closed for a blink or a yawn; wide at night; glowing in the dark
  const open = Math.min(blinkOpen, 1 - P.yawn * 0.9) * (P.puff > 0.5 ? 1.15 : 1);
  for (const sd of [-1, 1]) {
    const ex = hx + sd * hr * 0.4 + P.look[0] * 0.5, ey = hy - hr * 0.08 + P.look[1] * 0.35;
    if (open > 0.3) {
      if (night > 0) g.fillCircle(ex, ey, 2.6, IRIS, { aa: true, a: 0.3 * night });
      g.fillEllipse(ex, ey, 1.55, 1.65 * open, night > 0.5 ? IRIS : L(IRIS), aa);
      const pw = 0.45 + 0.75 * night + 0.5 * P.puff;
      g.fillEllipse(ex + P.look[0] * 0.45, ey + P.look[1] * 0.3, pw, 1.45 * open, 0x14100c, aa);
      g.fillCircle(ex - 0.5, ey - 0.6, 0.4, 0xffffff, aa);
    } else g.thickLine(ex - 1.5, ey + 0.3, ex + 1.5, ey + 0.3, 0.8, L(FUR_DARK), aa);
  }
  g.fillPolygon([[hx - 1, hy + hr * 0.2], [hx + 1, hy + hr * 0.2], [hx, hy + hr * 0.34]], L(PINK), aa);
  if (P.yawn > 0.05) g.fillEllipse(hx, hy + hr * 0.62, 1.3 * P.yawn + 0.3, 1.8 * P.yawn, hex('7a2a3a'), aa);
  for (const sd of [-1, 1]) for (const w of [-0.4, 0.45])
    g.thickLine(hx + sd * hr * 0.45, hy + hr * 0.45, hx + sd * hr * 1.55, hy + hr * (0.42 + w * 0.32), 0.45, mix(CREAM, 0xffffff, 0.3), { aa: true, a: 0.75 });
  return { bcx, bcy, brx, bry };
}

function drawPaw(g, P, body, light) {
  if (!P.paw) return;
  const aa = { aa: true }, d = P.dir;
  const sx = body.bcx + d * body.brx * 0.55, sy = body.bcy - body.bry * 0.35;
  g.thickLine(sx, sy, P.paw[0], P.paw[1], 2.9, scale(FUR, light), aa);
  g.fillCircle(P.paw[0], P.paw[1], 2, scale(CREAM, light), aa);
}

/**
 * The numerals as pictures, for tumbling: each one drawn once, upright, at
 * full light, on black and on white, which gives its colour and coverage
 * per pixel. Pure functions of the digit, so caching them is safe; the
 * firmware would keep them as ten small RGBA sprites.
 */
const SPRITES = new Map();
const SW = DW + 4, SH = DH + 4;
function spriteOf(d, back) {
  const key = d * 2 + (back ? 1 : 0);
  if (SPRITES.has(key)) return SPRITES.get(key);
  const on = (bg) => { const c = new Gfx(SW, SH); c.clear(bg); ceramic(c, d, 1, 1, DH, 1, { shadow: false, back }); return c; };
  const k = on(0x000000), w = on(0xffffff);
  const px = new Float32Array(SW * SH * 4);
  for (let i = 0; i < SW * SH; i++) {
    const a = from565(k.buf[i]), b = from565(w.buf[i]);
    const al = clamp(1 - (R(b) - R(a)) / 255, 0, 1);
    px[i * 4] = R(a); px[i * 4 + 1] = G(a); px[i * 4 + 2] = B(a); px[i * 4 + 3] = al;   // colour premultiplied by alpha
  }
  SPRITES.set(key, px);
  return px;
}

/**
 * A numeral tipping or tumbling: its picture rotated by `ang` in the
 * picture plane and foreshortened to `sy` (1 upright, 0 edge-on, negative
 * showing its unglazed back) as it turns toward the viewer. One inverse
 * mapping and a bilinear lookup per pixel: a rotozoom.
 */
function tumble(g, d, cx, cy, ang, sy, light) {
  const back = sy < 0, k = Math.abs(sy) < 0.12 ? (sy < 0 ? -0.12 : 0.12) : sy;
  const px = spriteOf(d, back);
  const c = cos(ang), sn = sin(ang);
  const ext = Math.hypot(SW, SH) / 2 + 1;
  const shade = light * (0.6 + 0.4 * Math.abs(k));
  g.paint((x, y, ix, iy) => {
    const dx = x - cx, dy = y - cy;
    const lx = c * dx + sn * dy + SW / 2 - 0.5, ly = (-sn * dx + c * dy) / k + SH / 2 - 0.5;
    if (lx < -1 || ly < -1 || lx >= SW || ly >= SH) return -1;
    const x0 = Math.floor(lx), y0 = Math.floor(ly), fx = lx - x0, fy = ly - y0;
    let r = 0, gg = 0, b = 0, a = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const sx = x0 + i, syy = y0 + j;
      if (sx < 0 || syy < 0 || sx >= SW || syy >= SH) continue;
      const wgt = (i ? fx : 1 - fx) * (j ? fy : 1 - fy), o = (syy * SW + sx) * 4;
      r += px[o] * wgt; gg += px[o + 1] * wgt; b += px[o + 2] * wgt; a += px[o + 3] * wgt;
    }
    if (a < 0.03) return -1;
    const under = g.get(ix, iy);
    return rgb(R(under) * (1 - a) + r * shade, G(under) * (1 - a) + gg * shade, B(under) * (1 - a) + b * shade);
  }, [cx - ext, cy - ext * Math.max(1, Math.abs(k)), 2 * ext, 2 * ext * Math.max(1, Math.abs(k))]);
}

export default {
  name: 'Mischief',
  blurb: 'A ginger cat paws the old digits off the shelf before each minute; the new ones drop in.',
  fps: 30,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, tod = f.h * 3600 + f.m * 60 + s;
    const hour = f.h + f.m / 60 + s / 3600;
    const [skyTop, skyHor] = keyed(SKY, hour, (a, b, u) => [mix(a[1], b[1], u), mix(a[2], b[2], u)]);
    const lit = keyed(LIT, hour, (a, b, u) => a[1] + (b[1] - a[1]) * u);
    const dark = clamp((1 - lit) / 0.5, 0, 1);
    const objLight = lit + (1 - lit) * 0.6;   // a lamp somewhere in the room keeps the shelf readable at night
    const aa = { aa: true };
    ctx.lcd.backlight(1 - 0.7 * ctx.night);

    // ---- the wall: striped wallpaper with small gold dots
    const wa = mix(WALL_A, WALL_NIGHT, dark), wb = mix(WALL_B, scale(WALL_NIGHT, 0.88), dark);
    for (let x = 0; x < 160; x += 8) { g.fillRect(x, 0, 4, 80, wa); g.fillRect(x + 4, 0, 4, 80, wb); }
    const dot = scale(mix(hex('b8a060'), wb, 0.45), lit);
    for (let x = 6; x < 160; x += 8) for (let y = 3 + ((x >> 3) & 1) * 3; y < 62; y += 6) g.pixel(x, y, dot);

    // ---- the window, the sky through it, and its sill
    const { x: wx, y: wy, w: ww, h: wh } = WIN;
    g.fillRect(wx - 2, wy - 2, ww + 4, wh + 4, scale(hex('c89a6a'), objLight));
    g.clip(wx, wy, ww, wh);
    g.gradient(wx, wy, ww, wh, [skyTop, skyHor]);
    if (dark > 0) for (let k = 0; k < 9; k++) {
      const sx = wx + Math.floor(rand(k, 1) * ww), sy = wy + Math.floor(rand(k, 2) * wh * 0.7);
      g.pixel(sx, sy, mix(skyTop, 0xffffff, dark * (0.4 + 0.6 * rand(k, Math.floor(tod * 1.3)))));
    }
    if (hour > 6 && hour < 18.6) {
      const u = (hour - 6) / 12.6;
      g.fillCircle(wx + 6 + u * 20, wy + wh - 6 - 26 * sin(Math.PI * u), 3.5, hex('fff2b8'), aa);
    } else {
      const u = (((hour - 18.6) + 24) % 24) / 11.4;
      const mx = wx + 6 + u * 20, my = wy + wh - 8 - 24 * sin(Math.PI * u);
      g.fillCircle(mx, my, 3, hex('eae6d0'), aa);
      g.fillCircle(mx + 1.6, my - 0.8, 2.6, mix(skyTop, skyHor, (my - wy) / wh), aa);
    }
    for (let k = 0; k < 2; k++) {
      const cx = wx - 10 + ((tod * (0.9 + k * 0.5) + k * 23) % (ww + 22)), cy = wy + 7 + k * 9;
      const cc = mix(0xffffff, skyHor, 0.3 + 0.5 * dark), o = { aa: true, a: 0.85 - 0.5 * dark };
      g.fillEllipse(cx, cy + 1.5, 6, 2, cc, o); g.fillCircle(cx - 1.5, cy, 2.6, cc, o); g.fillCircle(cx + 2, cy - 0.5, 3, cc, o);
    }
    g.unclip();
    const frame = scale(hex('e8d2b0'), objLight);
    g.fillRect(wx + ww / 2 - 1, wy, 2, wh, frame).fillRect(wx, wy + wh / 2 - 1, ww, 2, frame);
    g.fillRect(wx - 3, wy + wh + 1, ww + 6, 3, scale(hex('d8b88a'), objLight));

    // ---- the plot of this minute
    const cur = f.hh + f.mm;
    const nf = clockFields(new Date(ctx.date.getTime() + 60000)), nxt = nf.hh + nf.mm;
    const pf = previousMinute(ctx.date), prv = pf.hh + pf.mm;
    const Rm = removal(cur, nxt), A = arrival(prv, cur);
    const P = catAt(s, A, Rm, tod, f.minuteKey);

    // blinking: one blink in each 3.7 s slot, at a random moment
    const slot = Math.floor(tod / 3.7), bt = tod - slot * 3.7 - rand(slot, 3) * 3.2;
    const blinkOpen = bt > 0 && bt < 0.16 ? 0.1 : 1;

    // a fly, some of the minute; the sitting cat follows it
    const flyOn = (s > 9 && s < 25) || (s > 33 && s < 46);
    let fly = null;
    if (flyOn) {
      fly = [20 + 100 * noise(tod * 0.3, 11), 6 + 24 * noise(tod * 0.37, 23)];
      if (P.k === 0 && !P.yawn) { P.look = [clamp((fly[0] - REST) / 25, -1, 1), clamp((fly[1] - 38) / 18, -1, 1)]; P.swish = 1.6; }
    }

    // ---- the shelf surface, the cat behind the numerals
    g.fillRect(0, SHELF, 160, 2, scale(WOOD_TOP, objLight));
    const rim = dark < 0.5 && P.x > 116 ? mix(skyHor, 0xffffff, 0.4) : null;
    const body = drawCat(g, P, objLight, dark, tod, blinkOpen, rim);

    // ---- the numerals
    const falling = [];
    for (let i = 0; i < 4; i++) {
      const d = +cur[i];
      const bt0 = Rm.bats[i];
      if (bt0 !== undefined && s >= bt0 + RAISE) {
        const u = s - bt0 - RAISE;
        if (u < PUSH) {
          // tipping forward on its base: the top comes toward the viewer
          const k = cos((Math.PI / 2) * 0.8 * ease.inQuad(u / PUSH));
          tumble(g, d, dcx(i), SHELF - (DH / 2) * k, 0, k, objLight);
        } else if (u < PUSH + FALL) falling.push([i, d, u - PUSH]);
        continue;
      }
      const dt0 = A.drops[i];
      if (dt0 !== undefined && s < dt0 + DROP) {
        if (s < dt0) continue;
        const v = (s - dt0) / DROP;
        let sq = 0;
        for (const [ui, amp] of [[0.364, 0.16], [0.727, 0.07], [0.909, 0.03]]) sq = Math.max(sq, amp * Math.exp(-(((v - ui) / 0.035) ** 2)));
        const h = DH * (1 - sq), y = lerp(-DH - 8, DTOP, ease.outBounce(v)) + DH * sq;
        ceramic(g, d, DX[i] - sq * 4, y, h, objLight, { shadow: v > 0.3 });
        continue;
      }
      ceramic(g, d, DX[i], DTOP, DH, objLight);
    }

    // ---- the colon: a small cactus in a pot, flowering
    const pot = scale(hex('c8643c'), objLight);
    g.fillPolygon([[57, 54], [65, 54], [64, 62], [58, 62]], pot, aa);
    g.fillRect(56, 53, 10, 2, scale(hex('da7a50'), objLight));
    g.fillCircle(61, 48.5, 4.4, scale(hex('5e9a4c'), objLight), aa);
    for (const dx of [-2, 0, 2]) g.thickLine(61 + dx, 45, 61 + dx * 1.15, 52, 0.7, scale(hex('3f7434'), objLight), aa);
    for (const [px, py] of [[58, 47], [64, 47], [61, 46], [59, 50], [63, 50]]) g.pixel(px, py, scale(CREAM, objLight));
    const bloom = 0.85 + 0.15 * sin(tod * 0.9);
    for (let j = 0; j < 5; j++) g.fillCircle(61 + 1.4 * bloom * cos(j * 1.2566), 44 + 1.4 * bloom * sin(j * 1.2566), 1.1, scale(hex('f27aa0'), objLight), aa);
    g.fillCircle(61, 44, 0.8, scale(hex('ffe070'), objLight), aa);

    // ---- the paw over the numeral it is pushing
    drawPaw(g, P, body, objLight);

    // ---- the shelf's front edge, its shadow, the wall below
    g.fillRect(0, SHELF + 2, 160, 6, scale(WOOD, objLight));
    for (const [y, x0] of [[SHELF + 3, 10], [SHELF + 5, 70], [SHELF + 4, 118]]) g.hline(x0, y, 26, scale(WOOD_DARK, objLight));
    g.gradient(0, SHELF + 8, 160, 4, [scale(mix(wb, 0x000000, 0.55), 1), wb]);
    for (const bx of [22, 132]) g.fillPolygon([[bx, SHELF + 8], [bx + 3, SHELF + 8], [bx + 3, SHELF + 14]], scale(hex('3a3a3e'), objLight), aa);

    // ---- old numerals falling off the front, tumbling
    for (const [i, d, tau] of falling) {
      // off the edge: a little hop, then down, turning over and spinning
      const spin = rand(f.minuteKey, i) < 0.5 ? -1 : 1;
      const k = cos((Math.PI / 2) * 0.8 + 9 * tau);
      const cx = dcx(i) - 22 * tau * spin, cy = SHELF - DH * 0.15 - 70 * tau + 320 * tau * tau;
      tumble(g, d, cx, cy, spin * 2.2 * tau, k, objLight);
    }

    // ---- the fly
    if (fly) {
      const flap = Math.floor(tod * 40) % 2;
      g.fillEllipse(fly[0] - 0.8, fly[1] - 1 - flap * 0.4, 1.3, 0.8, 0xd8e4f0, { aa: true, a: 0.6 });
      g.fillEllipse(fly[0] + 0.8, fly[1] - 1 - (1 - flap) * 0.4, 1.3, 0.8, 0xd8e4f0, { aa: true, a: 0.6 });
      g.fillCircle(fly[0], fly[1], 0.9, 0x18140f, aa);
    }
  },
};
