// Tattoo Flash: a sheet of American traditional flash pinned on a parlour
// wall, yellowed paper, and the time is four of its designs. Every numeral
// is a flash motif bent into the digit (tattooflash-glyphs.js): 0 a snake
// eating its tail, 1 a dagger with a pennant tied round the grip, 2 and 5
// banner ribbons folded into the figure, 3 a rope whipped with red thread,
// 4 a dagger through a banner, 6 a rose whose stem curls into the bowl, 7 a
// banner bar with a dagger for the stem, 8 a rope tied in a figure-eight, 9 a
// snake with its tail tucked in the bowl. Heavy 2 px black outlines, flat
// colour, solid black shading blocks; where one thing passes in front of
// another, its outline cuts across the other, as flash draws it. The hours
// hang top left, the minutes bottom right, two stars for the colon; the day
// is lettered on a blank scroll, and the machine rests on the bench by its
// ink caps.
//
// At rest the flash is alive, the way animated flash moves: each motif in
// its own way, on the beat of the machine's hum (once a second, rolling
// left to right). Snakes slither (waves run down the body both ways, the
// diamonds on the back crawl toward the head) and flick their tongues;
// banners flutter (a ripple runs along them, the black fold rolls along the
// lower edge); ropes swing like a hung line and are tugged on the beat, the
// twist running through them; daggers stab down, swing and twang, a glint
// running down the blade; the rose nods on its stem, its petals turning.
// Every 15 s a flourish: a swallow flies across the sheet (:12, :42), or
// every motif strikes at once in double time (:27). The scroll waves.
//
// Minute turn, the tattooist's own process: the old design's colour lifts
// along its path, its line fades back to the purple of a stencil and the
// stencil wears away evenly (ranked pixels); the new design's stencil is
// transferred whole (so the digit reads from the first frame), a coil
// machine flies in and lines it, the black following the needle, then
// packs the colour back along the path and flies off. One machine per
// changing digit: the resting one takes the last, the others come up from
// below (four at midnight). Hour: a V of three swallows sweeps in with the
// turn (from :58.8) and, as it passes, the flash is repainted in its other
// colourway (red -> green -> yellow -> red), the old designs and the new
// ones being inked alike; the flock turns and paints it back, while the
// steady motifs dance in double time. At midnight the scroll is relettered
// as the flock passes over it.
//
// Palette: American traditional's, strictly: black, red, green, yellow, a
// white highlight (and skin, unused by the digits), on yellowed paper; the
// stencil's purple only during a transfer. Hard pixels throughout: flash is
// flat. Night (from 23:00): the sheet is lit by one lamp, the paper drops to
// a warm mid tone (dithered in over the minute) and the backlight to 45%, so
// the black lines keep their contrast.
//
// Cost: the numerals are per-pixel material maps (material, along, across,
// lining order; ten 34 x 54 glyphs, ~74 KB of flash), coloured per frame by a
// few integer ops a pixel through a two-pass warp (columns shift, then rows:
// hole-free), charged as box work. Sprites for the machine, swallows and
// stars. RAM: the day's sheet (25.6 KB, up to three cached: 77 KB) and a
// 4 KB warp buffer. The sheet is painted with kit calls once a day (and at
// the night switch), off the main canvas: about 100k cycles once.
import { clockFields, hash, sin, to565, progress, ease } from '../js/kit.js';
import { GLYPHS, GW, GH, GN, M_OUT, M_SNAKE, M_ROPE, M_RIBBON, M_BLADE, M_STEM, M_ROSE, F_BLACK, F_RED, F_GREEN, F_YELLOW, F_SKIN, F_WHITE } from './tattooflash-glyphs.js';
import { PAL, PAL_NIGHT, MACHINE, TIP, SWALLOW, STAR, paintSheet, CAPS, CAP_Y } from './tattooflash-art.js';

const W = 160, H = 80;
const SLOT_X = [3, 39, 87, 123], SLOT_Y = [1, 1, 25, 25];
const DAGGER = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0];

// per-pixel rank for the even dissolves (one table for every glyph)
const RANK = new Uint8Array(GN);
for (let i = 0; i < GN; i++) RANK[i] = hash(i, 7, 3) & 255;
// a 256-entry sine, -127..127
const SIN8 = new Int16Array(256);
for (let i = 0; i < 256; i++) SIN8[i] = Math.round(127 * Math.sin((i / 256) * Math.PI * 2));

function palette(P, rot = false) {
  const c = {};
  for (const k of Object.keys(P)) c[k] = to565(P[k]);
  // the alternate colourway the swallows paint at the hour: red -> green -> yellow -> red
  if (rot) { const r = c.red, gr = c.green, y = c.yellow; c.red = gr; c.green = y; c.yellow = r; }
  return c;
}
const C_DAY = palette(PAL), C_NIGHT = palette(PAL_NIGHT), C_DAY2 = palette(PAL, true), C_NIGHT2 = palette(PAL_NIGHT, true);

// the sheet, painted once a day (two kept: at midnight the old day's banner shows until the swallows pass it)
const SHEETS = new Map();
const COLB = new Uint16Array(26);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function sheet(wday, night) {
  const k = wday + (night ? 'n' : 'd');
  let b = SHEETS.get(k);
  if (!b) {
    b = paintSheet(wday, night ? PAL_NIGHT : PAL);
    SHEETS.set(k, b);
    if (SHEETS.size > 3) SHEETS.delete(SHEETS.keys().next().value);
  }
  return b;
}

// the warp: each column shifts vertically (DY), then each row horizontally (DX): hole-free, cheap
const A = 4, TH = GH + 2 * A;
const TMP = new Int16Array(GW * TH), DX = new Int8Array(TH), DY = new Int8Array(GW);

/**
 * One numeral. job: null (at rest), {old: tau} or {new: tau}.
 * ox, oy: the bob; lean: the sway (px at the top); ph: material phases.
 */
function drawDigit(g, d, X, Y, job, C0, C2, front, ph) {
  const G = GLYPHS[d], MAT = G.MAT, U = G.U, V = G.V, KK = G.K, buf = g.buf;
  TMP.fill(-1);
  for (let gx = 0; gx < GW; gx++) {
    const o = (DY[gx] < -A ? -A : DY[gx] > A ? A : DY[gx]) + A;
    for (let gy = 0, k = gx; gy < GH; gy++, k += GW) if (MAT[k]) TMP[(gy + o) * GW + gx] = k;
  }
  // transition thresholds
  let p1 = 0, p2 = 0, p3 = 0, q0 = 256, L = 256, Cf = -1, isNew = false, isOld = false;
  if (job && job.old !== undefined) {
    isOld = true; const t = job.old;
    p1 = ease.inOutQuad(progress(t, 0, 0.7)) * 280; p2 = ease.inOutQuad(progress(t, 0.45, 0.95)) * 280; p3 = progress(t, 0.95, 1.3) * 256;
  } else if (job && job.new !== undefined) {
    isNew = true; const t = job.new;
    q0 = progress(t, 0, 0.2) * 256; L = ease.inOutQuad(progress(t, 0.2, 1.5)) * 256;
    Cf = 256 - ease.inOutQuad(progress(t, 1.5, 2.4)) * 288;
  }
  const sn = ph.snake, rp = ph.rope, rb = ph.rib, ro = ph.rose, gl = ph.glint;
  let n = 0;
  for (let tr = 0; tr < TH; tr++) {
    const y = Y + tr - A;
    if (y < 0 || y >= H) continue;
    const row = tr * GW, xs = X + DX[tr], line = y * W;
    for (let gx = 0; gx < GW; gx++) {
      const k = TMP[row + gx];
      if (k < 0) continue;
      const m = MAT[k];
      const x = xs + gx;
      const C = x < front ? C2 : C0;
      if (x < 0 || x >= W) continue;
      n++;
      const r = RANK[k];
      if (m === M_OUT) {
        if (isOld) { if (r < p3) continue; buf[line + x] = KK[k] + (r >> 4) < p2 ? C.stencil : C.black; continue; }
        if (isNew) { if (r >= q0) continue; buf[line + x] = KK[k] < L ? C.black : C.stencil; continue; }
        buf[line + x] = C.black; continue;
      }
      if (isOld && 272 - KK[k] - (r >> 4) < p1) continue;
      if (isNew && (KK[k] + (r >> 3) - 16 < Cf || KK[k] >= L)) continue;
      const u = U[k], v = V[k];
      let c;
      switch (m) {
        case M_SNAKE: {
          if (v <= -3) c = C.yellow;                                           // the belly
          else {
            const q = (u - sn) % 10, qq = q < 0 ? q + 10 : q;
            const dd = (qq > 5 ? qq - 5 : 5 - qq) * 2 + (v > 3 ? v - 3 : 3 - v);
            c = dd < 5 ? C.black : C.green;                                      // diamonds down the back
          }
          break;
        }
        case M_ROPE: {
          const q = (u * 2 + v - rp) % 10;
          c = (q < 0 ? q + 10 : q) < 2 ? C.black : C.yellow;
          break;
        }
        case M_RIBBON: {
          const th = 7 + ((SIN8[(u * 9 - rb) & 255] * 2) >> 7);       // 5..9: a black fold that rolls along the lower edge
          c = v >= th ? C.black : v <= -6 && th > 8 ? C.white : C.red;
          break;
        }
        case M_BLADE: {
          if (v < 0) c = C.white;
          else c = gl >= 0 && u >= gl - 2 && u <= gl + 1 ? C.white : C.black;
          break;
        }
        case M_STEM: c = v >= 3 ? C.black : C.green; break;
        case M_ROSE: {
          const sp = (v * 40 + u * 4 + ro) & 255;
          c = v < 2 ? C.black : sp < 44 ? C.black : C.red;
          break;
        }
        case F_BLACK: c = C.black; break;
        case F_RED: c = C.red; break;
        case F_GREEN: c = C.green; break;
        case F_YELLOW: c = C.yellow; break;
        case F_SKIN: c = C.skin; break;
        default: c = C.white;
      }
      buf[line + x] = c;
    }
  }
  g.cost.px += n; g.cost.box += n * 10 + GN * 2 + TH * GW * 2;
}

// ------------------------------------------------------------ how each motif moves

// 0 snake, 1 dagger, 2 ribbon, 3 rope, 4 dagger, 5 ribbon, 6 rose, 7 dagger, 8 rope, 9 snake
const MOTIF = ['snake', 'dagger', 'ribbon', 'rope', 'dagger', 'ribbon', 'rose', 'dagger', 'rope', 'snake'];
const TAU = Math.PI * 2;

/**
 * Fill DX (per warped row) and DY (per column) for one numeral. Every motif
 * bobs on the beat and has its own continuous motion on top. Returns nothing;
 * amplitudes stay within 2-3 px so the silhouette holds.
 */
function motion(kind, i, s, T, p, hop, amp, calm) {
  const ph = i * 1.7;
  let bob = -2.6 * hop * amp, lean = 1.4 * sin((s / 4) * TAU + i * 1.3);
  let wx = 0, kx = 0, wy = 0, ky = 0, sx = 0, twang = 0, pend = 0;
  if (kind === 'snake') {             // the body slithers: waves run down it both ways
    wx = 1.8; kx = TAU / 24; wy = 1.6; ky = TAU / 20; sx = T * 1.2;
  } else if (kind === 'ribbon') {     // the banner flutters, the wave running along it
    wy = 1.9; ky = TAU / 17; wx = 1.2; kx = TAU / 26; sx = T * 1.6;
  } else if (kind === 'rope') {       // the rope swings like a hung line and is tugged on the beat
    lean = 2.4 * sin((s / 2) * TAU + i); wx = 0.8; kx = TAU / 30; sx = T * 0.8; bob = -2.6 * hop * amp;
  } else if (kind === 'dagger') {     // it stabs down on the beat and the blade twangs
    bob = 2.4 * hop * amp; twang = p < 0.8 ? 2.6 * (1 - p / 0.8) * sin(p * TAU * 4) : 0;
    lean = 0; pend = 2.4 * sin((s / 2) * TAU + i) + 1.8 * hop * amp; wx = 0.8; kx = TAU / 30; sx = T;
  } else {                            // the rose on its stem nods in a breeze
    lean = 2.2 * sin((s / 3) * TAU + i); wx = 0.9; kx = TAU / 20; sx = T * 0.9; bob = -2.4 * hop * amp;
  }
  const c = calm;
  for (let gx = 0; gx < GW; gx++) DY[gx] = Math.round(c * (bob + wy * sin(gx * ky - sx * TAU + ph)));
  for (let tr = 0; tr < TH; tr++) {
    const gy = tr - A, fromTop = (GH / 2 - gy) / (GH / 2);
    const tw = twang && gy > 20 ? twang * ((gy - 20) / 34) : 0;
    DX[tr] = Math.round(c * (lean * fromTop + pend * (gy - 10) / 44 + wx * sin(gy * kx - sx * TAU + ph + 1) + tw));
  }
}

// ------------------------------------------------------------ the machines

const REST = [7 + TIP[0], 57 + TIP[1]];                  // where the resting machine's needle sits

/** Where machine j's needle is at turn time tt (-ve before :00), or null if it is not out. */
function needle(tt, slot, d, j) {
  const G = GLYPHS[d], NP = G.NP, X = SLOT_X[slot], Y = SLOT_Y[slot];
  const at = (kk) => { const q = Math.max(0, Math.min(64, kk / 4)), a = q | 0, b = Math.min(64, a + 1), f = q - a; return [X + NP[a * 2] + (NP[b * 2] - NP[a * 2]) * f, Y + NP[a * 2 + 1] + (NP[b * 2 + 1] - NP[a * 2 + 1]) * f]; };
  const home = j === 0 ? REST : [X + 20, 104];
  if (tt < -0.9 || tt > 3.0) return null;
  if (tt < 0.2) { const u = ease.inOutCubic(progress(tt, -0.9, 0.2)), p = at(0); return { x: home[0] + (p[0] - home[0]) * u, y: home[1] + (p[1] - home[1]) * u - 10 * Math.sin(u * Math.PI), buzz: 0 }; }
  if (tt < 1.5) { const p = at(ease.inOutQuad(progress(tt, 0.2, 1.5)) * 256); return { x: p[0], y: p[1], buzz: 1 }; }
  if (tt < 2.4) { const p = at(256 - ease.inOutQuad(progress(tt, 1.5, 2.4)) * 288); return { x: p[0], y: p[1], buzz: 1 }; }
  const u = ease.inOutCubic(progress(tt, 2.4, 3.0)), p = at(0);
  return { x: p[0] + (home[0] - p[0]) * u, y: p[1] + (home[1] - p[1]) * u - 10 * Math.sin(u * Math.PI), buzz: 0 };
}

function drawMachine(g, x, y, buzz, F) {
  const jx = buzz && F & 1 ? 1 : 0, jy = buzz && F & 2 ? 1 : 0;
  g.blit(MACHINE, Math.round(x - TIP[0]) + jx, Math.round(y - TIP[1]) - jy);
  if (buzz) {
    const bx = Math.round(x - TIP[0]) + 18, by = Math.round(y - TIP[1]) + 4;
    if (F & 4) { g.fillRect(bx, by, 2, 1, PAL.black); g.fillRect(bx + 1, by + 3, 2, 1, PAL.black); }
  }
}

// ------------------------------------------------------------ the swallows

function bez(P, u) {
  const a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3;
  return [a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1]];
}
const FLIGHT = [[-20, 70], [60, 74], [84, 0], [182, 8]];
function swallow(g, x, y, flip, F, k) {
  const fr = ((F + k * 5) >> 3) & 1;
  g.blit(SWALLOW[fr], Math.round(x - 10), Math.round(y - 7), { flipX: flip });
}

export default {
  name: 'Tattoo Flash',
  blurb: 'A sheet of American traditional tattoo flash: each numeral is a motif bent into the digit (snake, dagger, banner, rope, rose); the machine re-inks each new minute.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    const nt = ctx.night, night = nt > 0.5;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    const C = night ? C_NIGHT : C_DAY, C2 = night ? C_NIGHT2 : C_DAY2;
    const T = (ctx.date.getTime() % 86400000) / 1000, F = Math.floor(T * 60);
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    // hr: seconds from the hour, from :58.8 before it to :08 after it (null otherwise)
    const hr = nxt.h !== f.h && s >= 58.8 ? s - 60 : prv.h !== f.h && s < 8 ? s : null;
    const hourShow = hr !== null;

    // the hour: a flock of swallows sweeps in with the turn and repaints the flash in its other colourway as it
    // passes (old digits and new alike); it turns and paints it back
    let front = -999, flock = null;
    if (hourShow) {
      if (hr < 1.4) { const x = -30 + 230 * ease.inOutQuad(progress(hr, -1.2, 1.4)); front = x; flock = { x, flip: false }; }
      else if (hr < 2.6) front = 999;
      else if (hr < 5.2) { const x = 190 - 230 * ease.inOutQuad(progress(hr, 2.6, 5.2)); front = x; flock = { x, flip: true }; }
    }
    // the sheet: at midnight the old day's scroll stays until the flock has passed over it
    const wd = hourShow && hr >= 0 && f.h === 0 && hr < 1.4 && front < 150 ? prv.wday : f.wday;
    g.buf.set(sheet(wd, night)); g.cost.px += W * H;
    if (nt > 0 && nt < 1) {
      // dusk and dawn: the lamp's sheet dissolves in over the minute, an ordered dither
      const D = sheet(wd, false), N = sheet(wd, true), th = nt * 16, buf = g.buf;
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) buf[i] = BAYER[((y & 3) << 2) | (x & 3)] < th ? N[i] : D[i];
      g.cost.box += W * H * 3;
    }
    // the scroll waves, a slow ripple running along it (each column shifted through a small copy)
    for (let x = 74; x < W - 2; x++) {
      const o = Math.round(1.3 * sin((x / 38) * TAU - T * TAU * 0.6));
      if (!o) continue;
      for (let y = 0; y < 26; y++) COLB[y] = g.buf[y * W + x];
      for (let y = 2; y < 25; y++) g.buf[y * W + x] = COLB[y - o];
    }
    g.cost.box += 86 * 49 * 2;

    const strike = !hourShow && s >= 27 && s < 29.4;           // the flourish: every motif at once
    const dance = hourShow && hr > -1.2 && hr < 6.5;
    const ph = {
      snake: Math.floor(T * (strike ? 24 : 9)) % 1000, rope: Math.floor(T * (strike ? 40 : 14)) % 1000,
      rib: Math.floor(T * (strike ? 420 : 160)) & 255, rose: Math.floor(T * (strike ? 300 : 60)) & 255, glint: -1,
    };
    const tongues = [];
    for (let i = 0; i < 4; i++) {
      const d = +cur[i];
      let job = null, calm = 1;
      if (cur[i] !== nw[i]) { calm = 1 - progress(s, 57.6, 58.4); if (s >= 58.5) job = { old: s - 58.5 - 0.04 * i }; }
      if (cur[i] !== old[i]) { calm = Math.min(calm, progress(s, 2.4, 3.0)); if (s < 2.6) job = { new: Math.max(0, s - 0.04 * i) }; }
      const beat = strike || dance ? s * 2 : s;
      const p = beat - i * 0.1 - Math.floor(beat - i * 0.1);
      const hop = p < 0.3 ? sin((p / 0.3) * Math.PI) : 0;
      ph.glint = DAGGER[d] && p < 0.4 ? Math.round((p / 0.4) * 40) - 4 : -1;
      const dy = motion(MOTIF[d], i, s, T, p, hop, strike || dance ? 1.5 : 1, calm);
      // left of the front the flash is in its other colourway: behind the flock going out, ahead of it coming back
      drawDigit(g, d, SLOT_X[i], SLOT_Y[i], job, C, C2, front, ph);
      // snakes flick their tongues on the beat
      if (calm > 0.5 && GLYPHS[d].info.heads.length) {
        const tl = p < 0.28 ? sin((p / 0.28) * Math.PI) * (strike || dance ? 7 : 4.5) : 0;
        if (tl > 1.5) for (const hd of GLYPHS[d].info.heads) { const hx = Math.min(GW - 1, Math.max(0, Math.round(hd.snout[0]))), hy = Math.round(hd.snout[1]); tongues.push([SLOT_X[i] + hd.snout[0] + DX[Math.min(TH - 1, Math.max(0, hy + DY[hx] + A))], SLOT_Y[i] + hd.snout[1] + DY[hx], hd.dir, tl]); }
      }
    }
    for (const [x, y, [dx, dy], l] of tongues) {
      const x1 = x + dx * l, y1 = y + dy * l;
      g.line(Math.round(x + dx), Math.round(y + dy), Math.round(x1), Math.round(y1), PAL.red);
      g.line(Math.round(x1), Math.round(y1), Math.round(x1 + dx * 2 - dy * 1.5), Math.round(y1 + dy * 2 + dx * 1.5), PAL.red);
      g.line(Math.round(x1), Math.round(y1), Math.round(x1 + dx * 2 + dy * 1.5), Math.round(y1 + dy * 2 - dx * 1.5), PAL.red);
    }

    // the colon: two stars, a twinkle on the beat
    const tw = s % 1 < 0.15 || (dance && s % 0.5 < 0.15) ? 1 : 0;
    g.blit(STAR[tw], 76, 31); g.blit(STAR[1 - tw], 76, 43);

    // the machines: one per changing digit; the first is the one resting on the bench
    const tt = s >= 50 ? s - 60 : s;
    const tgt = tt < 0 ? nw : cur, src = tt < 0 ? cur : old;
    const ch = [];
    for (let i = 3; i >= 0; i--) if (tgt[i] !== src[i]) ch.push(i);
    let restOut = false;
    ch.forEach((i, j) => {
      const nd = needle(tt - 0.04 * i, i, +tgt[i], j);
      if (!nd) return;
      if (j === 0) restOut = true;
      drawMachine(g, nd.x, nd.y, nd.buzz, F);
    });
    if (!restOut) {
      // at rest it hums on the beat
      const b = s % 1 < 0.35 && !night;
      drawMachine(g, REST[0], REST[1], b ? 1 : 0, F);
    }

    // a swallow crosses on the flourishes
    for (const [t0, back] of [[12, false], [42, true]]) {
      if (hourShow || s < t0 || s > t0 + 2.8) continue;
      const u = ease.inOutQuad(progress(s, t0, t0 + 2.8));
      const [x, y] = bez(FLIGHT, back ? 1 - u : u);
      swallow(g, x, y, back, F, 0);
    }
    if (flock) {
      const V = [[0, 0], [-18, -14], [-18, 14]];
      V.forEach(([dx, dy], k) => {
        const x = flock.x + (flock.flip ? -dx : dx), y = 40 + dy + 3 * sin(T * 5 + k);
        swallow(g, x, y, flock.flip, F, k);
      });
    }
  },
};
