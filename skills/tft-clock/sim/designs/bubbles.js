// Soap Bubbles: the time is four numerals of soap foam, fat bubble letters
// blown from a wand. Each numeral is a bold 2 px skin of film packed with a
// chain of bubble cells strung along its strokes; white film on teal.
//
// Always alive: the foam flows. The cell chain inside every stroke slides
// along it (neighbouring strokes in opposite directions), so bubbles stream
// round the bowl of a 0 and down the stem of a 1 all minute; rims wobble in
// travelling waves of a pixel or two and each numeral bobs on its own float.
// Once a second the bubbles bump on a beat: every cell swells and the skins
// squash and stretch, rippling from the first hour to the last minute. The
// wand in the lower right lets loose bubbles drift up and left across the
// strip, behind the numerals (the film in a counter hides them), and pop
// into rings of drops; every 15 s a gust blows a whole stream across the
// glass and the numerals shiver as it passes.
//
// Minute: from :58.3 the leaving digit's cells pop one by one (the skin
// stays, so it is the same digit, emptying); at :59.35 the empty skin beads
// into drops along its outline that fly apart and fall. After :00 the new
// minutes are blown out of the wand as one small word, swell with an
// overshoot as they float up into place, then fill with foam and wobble to
// rest. Loose bubbles are kept out of an empty or growing slot and off the
// colon, so nothing reads as a stray digit.
//
// Hour: from :57 the wand blows one giant bubble that swells and swallows
// the whole time, a film band and window highlight round its edge. Inside
// it the old numerals pop (:59.5). At :00 it tears from the highlight, the
// rupture running round the rim both ways and flinging its drops off the
// glass, while the new hour inflates in place and a flurry of small bubbles
// from the torn rim drifts out to the edges.
//
// Colour: white #f4fbff film on teal #0e6a73: lit soap film against tinted
// water. 1-bit: one mask of four states (ground, loose ink, digit ground,
// digit ink) written to the glass as two RGB565 values; the only grey is
// sparse stipple and line density. Night dims the backlight only.
//
// Letterforms: skeletons of strokes and arcs, inflated and smooth-unioned
// (puffy joins), tabled once as SDF + tube coordinates (bubbles-glyphs.js).
//
// Cost: one integer pass over each digit's box (three byte lookups, a chain
// table lookup and an integer circle test a pixel, charged to g.cost.box),
// parametric points for rims and drops, and the two-colour write-out. No
// per-minute rebuild. Flash ~204 KB of glyph tables (+~16 KB small tables);
// RAM ~13 KB (the 12.8 KB mask and line tables).

import { to565, hash, clockFields, previousMinute, clamp, progress, ease, sin } from '../js/kit.js';
import { HOUR, MIN } from './bubbles-glyphs.js';

const W = 160, H = 80, N = W * H;
const INK = to565(0xf4fbff), GROUND = to565(0x0e6a73);
const MARGIN = 7;
const TAU = Math.PI * 2;

// ---- tables (flash)
const BAYER = Uint8Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
const TEX = new Uint8Array(64 * 64);        // a tileable swirl: the film's thickness
for (let y = 0; y < 64; y++)
  for (let x = 0; x < 64; x++) {
    const u = (x / 64) * TAU, v = (y / 64) * TAU;
    const val = 128 + 46 * Math.sin(v + 1.3 * Math.sin(u + 0.7 * Math.sin(v * 2)))
      + 30 * Math.sin(u * 2 + 1.6 * Math.sin(v * 1 + 1)) + 18 * Math.sin(u + v * 3 + 2);
    TEX[y * 64 + x] = Math.max(0, Math.min(255, Math.round(val)));
  }
const NC = 1024;                            // unit circle for parametric rims
const CS = new Float32Array(NC), SN = new Float32Array(NC);
for (let i = 0; i < NC; i++) { CS[i] = Math.cos((i / NC) * TAU); SN[i] = Math.sin((i / NC) * TAU); }

// loose bubble sprites: rim offsets (and a highlight) for radius 2..7 and three squashes
const RING = [];
for (let r = 2; r <= 7; r++) {
  const row = [];
  for (const e of [-0.13, 0, 0.13]) {
    const rx = r * (1 + e), ry = r * (1 - e), pts = [], hi = [];
    const R2 = Math.ceil(r * 1.2) + 1;
    for (let y = -R2; y <= R2; y++)
      for (let x = -R2; x <= R2; x++) {
        const q = Math.sqrt(((x) / rx) ** 2 + ((y) / ry) ** 2) * (rx + ry) / 2;
        if (Math.abs(q - (rx + ry) / 2) < 0.55) pts.push(x, y);
        else if (r >= 4 && Math.abs(q - ((rx + ry) / 2 - 2)) < 0.6 && x < 0 && y < 0 && Math.abs(Math.atan2(y, x) + 2.3) < 0.42) hi.push(x, y);
      }
    row.push({ pts: Int8Array.from(pts), hi: Int8Array.from(hi) });
  }
  RING.push(row);
}

// ---- layout: hours big and staggered, minutes smaller and stepping down to the wand
const SLOT = [
  { x: 21, y: 41, G: HOUR }, { x: 61, y: 38, G: HOUR },
  { x: 111, y: 29, G: MIN }, { x: 140, y: 33, G: MIN },
];
const COLON = [[88, 32], [87, 47]];
const WAND = { x: 151, y: 71, r: 7 };        // the wand ring, held up in the lower right corner
const MOUTH = [147, 66];                    // where loose bubbles leave the ring
const PAIR = [125.5, 31];                   // the minutes as a word: they are blown together

// ---- working buffers (RAM)
const mask = new Uint8Array(N);             // 0 ground, 1 loose ink, 2 digit ground, 3 digit ink
const colG = new Int16Array(96), rowG = new Int16Array(96);
const WXr = new Int8Array(96), WYc = new Int8Array(96);
const OFF = new Int16Array(4), ALIVE = new Uint8Array(4 * 64);
// keep-out boxes: slots that are empty or still being blown, where a loose
// bubble would read as a small digit (x0, y0, x1, y1 each)
const KEEP = new Int16Array(4 * 6); let nKeep = 0;
let gEll = null;                               // the giant: loose bubbles merge into it

const digitOf = (f) => [f.hh[0], f.hh[1], f.mm[0], f.mm[1]].map(Number);

// a damped beat kick: 1 at the hit, ringing down
function kick(tau) { return tau < 0 || tau > 1.2 ? 0 : Math.exp(-tau * 4.2); }

let ops = 0;

/**
 * One foam numeral into the mask. The outer skin is a bold 2 px wall; inside,
 * a chain of cells is strung along each stroke and flows along it (`flow`, in
 * half pixels), swelling on the beat (`swell`, quarter pixels). `keep` 0..256:
 * how many of its cells are still there (popping or being blown in).
 */
function drawDigit(G, cx, cy, sx, sy, wob, wph, keep, flow, swell, seed) {
  const gw = G.gw, gh = G.gh, sdf = G.sdf, uv = G.uv, vv = G.vv, CH = G.chains;
  const gcx = MARGIN + G.bw / 2, gcy = MARGIN + G.bh / 2;
  const x0 = Math.max(0, Math.floor(cx - (gw / 2) * sx)), x1 = Math.min(W, Math.ceil(cx + (gw / 2) * sx));
  const y0 = Math.max(0, Math.floor(cy - (gh / 2) * sy)), y1 = Math.min(H, Math.ceil(cy + (gh / 2) * sy));
  if (x1 <= x0 || y1 <= y0) return;
  const s = Math.min(sx, sy);
  // thresholds in the table quarter pixels, kept in screen pixels
  const moatQ = Math.round(3.2 * 4 / s), rimQ = Math.round(-2 * 4 / s);
  for (let xx = x0; xx < x1; xx++) {
    colG[xx - x0] = Math.floor(gcx + (xx + 0.5 - cx) / sx);
    WYc[xx - x0] = Math.round(wob * sin(xx * 0.17 + wph * 1.3 + 1));
  }
  for (let yy = y0; yy < y1; yy++) {
    rowG[yy - y0] = Math.floor(gcy + (yy + 0.5 - cy) / sy);
    WXr[yy - y0] = Math.round(wob * sin(yy * 0.14 + wph));
  }
  // per stroke: flow offset (alternating direction) and which cells survive
  const fl = flow | 0, sw = swell | 0;
  for (let k = 0; k < CH.length; k++) {
    const c = CH[k];
    OFF[k] = (((k & 1 ? -fl : fl) % c.P) + c.P) % c.P;
    for (let j = 0; j < c.n; j++) ALIVE[k * 64 + j] = (hash(j, k, seed) & 255) < keep ? 1 : 0;
  }
  for (let yy = y0; yy < y1; yy++) {
    const gyBase = rowG[yy - y0], wx = WXr[yy - y0], row = yy * W;
    for (let xx = x0; xx < x1; xx++) {
      const gx = colG[xx - x0] + wx, gy = gyBase + WYc[xx - x0];
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
      const gi = gy * gw + gx, d = sdf[gi];
      if (d > moatQ && !(vv[gi] & 128)) continue;
      let v = 2;
      if (d <= 0) {
        if (d >= rimQ) v = 3;
        else {
          const sv = vv[gi], k = sv >> 5, c = CH[k];
          let j = uv[gi] + OFF[k]; if (j >= c.P) j -= c.P;
          if (ALIVE[k * 64 + c.cid[j]]) {
            const al = c.du[j] * 2, ac = sv & 31, q = al * al + ac * ac;   // quarter px, squared
            const r = c.rad[j] + sw, r0 = r - 3, r1 = r + 1;
            if (q >= r0 * r0 && q <= r1 * r1) v = 3;
            // a glint in the bigger cells: a short dash on the near side
            else if (r >= 13 && al < 0 && ac < 5 && q >= (r - 9) * (r - 9) && q <= (r - 5) * (r - 5)) v = 3;
          }
        }
      }
      const i = row + xx;
      if (v > mask[i]) mask[i] = v;
    }
  }
  ops += (x1 - x0) * (y1 - y0) * 2;
}

/** A small bubble ring of the colon / wand class (digit priority). */
function solidRing(cx, cy, r, th) {
  const R2 = Math.ceil(r + 3);
  for (let y = Math.max(0, Math.floor(cy - R2)); y < Math.min(H, cy + R2); y++)
    for (let x = Math.max(0, Math.floor(cx - R2)); x < Math.min(W, cx + R2); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, q = Math.sqrt(dx * dx + dy * dy);
      const v = q <= r && q > r - th ? 3 : q <= r + 1.5 ? 2 : 0;
      const i = y * W + x;
      if (v > mask[i]) mask[i] = v;
    }
}

function drop(x, y, big, force) {
  const xi = Math.round(x), yi = Math.round(y);
  const n = big ? 2 : 1;
  for (let j = 0; j < n; j++)
    for (let k = 0; k < n; k++) {
      const px = xi + k, py = yi + j;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const i = py * W + px;
      if (force || mask[i] === 0) mask[i] = force ? 3 : 1;
    }
}

function looseBubble(x, y, r, sq, film) {
  for (let k = 0; k < nKeep; k++) if (x > KEEP[k * 4] && x < KEEP[k * 4 + 2] && y > KEEP[k * 4 + 1] && y < KEEP[k * 4 + 3]) return;
  if (gEll && ((x - gEll.x) / gEll.rx) ** 2 + ((y - gEll.y) / gEll.ry) ** 2 < 1) return;
  const R = RING[clamp(r, 2, 7) - 2][sq], xi = Math.round(x), yi = Math.round(y);
  const p = R.pts;
  for (let k = 0; k < p.length; k += 2) {
    const px = xi + p[k], py = yi + p[k + 1];
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const i = py * W + px;
    if (mask[i] === 0) mask[i] = 1;
  }
  if (film) {
    const q = R.hi;
    for (let k = 0; k < q.length; k += 2) {
      const px = xi + q[k], py = yi + q[k + 1];
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const i = py * W + px;
      if (mask[i] === 0) mask[i] = 1;
    }
  }
  ops += p.length;
}

export default {
  name: 'Soap Bubbles',
  blurb: 'The time is four soap bubbles blown as fat bubble letters: swirling film, wobbling rims, a beat of bumps; they pop into drops and the wand blows the next.',
  fps: 60,

  frame(g, ctx) {
    ops = 0;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const date = ctx.date, f = ctx.fields, sec = f.sec;
    const T = date.getTime() / 1000;                // absolute seconds: loose bubbles' schedule
    const tl = (date.getTime() % 3600000) / 1000;  // smooth local time for the film (wraps hourly, unseen)
    const cur = digitOf(f), prev = digitOf(previousMinute(date)), next = digitOf(clockFields(new Date(date.getTime() + 60000)));
    const hourShow = next[1] !== cur[1] || next[0] !== cur[0];      // this minute ends an hour
    const wasHour = prev[1] !== cur[1] || prev[0] !== cur[0];       // this minute began one
    mask.fill(0);

    // ---- the gust: a front crossing right to left every 15 s
    const gs = sec % 15, gust = gs > 11.5 && gs < 14.5 && !(sec > 55);
    const gustX = 160 - (gs - 11.5) * 70;

    // ---- the four bubble digits
    const pops = [];
    nKeep = 1; gEll = null;
    KEEP[0] = 80; KEEP[1] = 22; KEEP[2] = 96; KEEP[3] = 56;      // the colon: loose bubbles stay off it
    for (let k = 0; k < 4; k++) {
      const S = SLOT[k];
      let d = cur[k], cx = S.x, cy = S.y, sx = 1, sy = 1, film = 256, show = true;
      // float
      cy += 1.5 * sin(tl * TAU / 5.3 + k * 1.9);
      cx += 0.8 * sin(tl * TAU / 7.1 + k * 2.7);
      // the beat: a bump ripples left to right
      const kb = kick(sec % 1 - k * 0.085);
      const osc = sin((sec % 1 - k * 0.085) * TAU * 2.6);
      sx += 0.05 * kb * osc; sy -= 0.06 * kb * osc;
      let wob = 0.55 + 1.2 * kb;
      if (gust) wob += 1.3 * Math.exp(-(((cx - gustX) / 18) ** 2));
      // leaving: drain, then pop into drops
      const popAt = hourShow ? 59.5 : 59.35;
      if (next[k] !== d && sec >= 58.3) {
        film = 257 * (1 - ease.inOutQuad(progress(sec, 58.3, 59.15)));   // the cells pop one by one
        if (sec >= popAt - 0.15) { const q = progress(sec, popAt - 0.15, popAt); wob += 1.2 * q; sx += 0.03 * q * sin(sec * 90); sy -= 0.03 * q * sin(sec * 90); }
        if (sec >= popAt) { show = false; pops.push([S.G[d], cx, cy, sec - popAt, k]); }
      }
      // arriving: blown after :00
      if (prev[k] !== d && sec < 3) {
        const start = wasHour ? 0.04 + 0.05 * k : 0.05;
        const tau = sec - start;
        if (tau < 0) show = false;
        else {
          const u = progress(tau, 0, 0.95);
          const sc = 0.45 + 0.55 * ease.outBack(u);
          const ring = tau > 0.6 ? Math.exp(-(tau - 0.6) * 2.2) * sin((tau - 0.6) * TAU * 1.7) : 0;
          sx *= sc * (1 + 0.07 * ring); sy *= sc * (1 - 0.07 * ring);
          wob = (wob + 1.2 * Math.exp(-tau * 1.5)) * Math.min(1, sc * sc);   // a small bubble is stiff: it must not pinch
          film = 257 * ease.outQuad(progress(tau, 0.35, 1.25));             // and fill with foam
          if (!wasHour && k >= 2) {          // minutes come out of the wand
            const m = ease.outCubic(progress(tau, 0, 0.9));
            const ox = MOUTH[0] - 14 + (S.x - PAIR[0]) * sc, oy = MOUTH[1] - 6 + (S.y - PAIR[1]) * sc;
            cx = ox + (cx - ox) * m; cy = oy + (cy - oy) * m;
          }
        }
      }
      if ((!show || (prev[k] !== d && sec < 1.4)) && !(next[k] === d && prev[k] === d)) {
        const G = S.G[d], j = nKeep++ * 4;
        KEEP[j] = S.x - G.bw / 2 - 5; KEEP[j + 1] = S.y - G.bh / 2 - 5; KEEP[j + 2] = S.x + G.bw / 2 + 5; KEEP[j + 3] = S.y + G.bh / 2 + 5;
      }
      if (show) drawDigit(S.G[d], cx, cy, sx, sy, wob, tl * 7 + k * 2.1, film, tl * 7 + k * 40, 3 * kb, d * 7 + k);
    }

    // ---- the colon: two small bubbles, bumped on the beat too
    for (let j = 0; j < 2; j++) {
      const kb = kick(sec % 1 - 0.17 - j * 0.04);
      const [x, y] = COLON[j];
      solidRing(x + 0.5 * sin(tl * 1.1 + j * 3), y + 1.2 * sin(tl * TAU / 4.1 + j * 2) - kb * 1.5, 3.4 + 0.5 * kb, 2);
    }

    // ---- the wand: a scalloped plastic ring on a stick, with film across it
    // that bulges out as it blows (the loose bubbles leave from it)
    {
      const blowing = (gs > 11.2 && gs < 14.6 && sec < 55) ? 1 : 0;
      const bulge = 1.5 + 1.5 * sin(T * 9) * (0.3 + blowing);
      for (let ii = 0; ii < NC; ii += 8) {
        const c = CS[ii], sn = SN[ii];
        const rr = WAND.r + (((ii >> 6) & 1) ? 0.6 : -0.4);       // 16 ridges
        for (let w = 0; w < 2; w++) {
          const px = Math.round(WAND.x + c * (rr - w)), py = Math.round(WAND.y + sn * (rr - w));
          if (px >= 0 && px < W && py >= 0 && py < H) mask[py * W + px] = 3;
        }
      }
      // the film: a sparse stipple, its highlight a short arc that bulges up-left
      for (let y = WAND.y - WAND.r + 2; y < Math.min(H, WAND.y + WAND.r - 1); y++)
        for (let x = WAND.x - WAND.r + 2; x < Math.min(W, WAND.x + WAND.r - 1); x++) {
          const dx = x + 0.5 - WAND.x, dy = y + 0.5 - WAND.y, q = dx * dx + dy * dy;
          const i = y * W + x;
          if (q > (WAND.r - 2.5) ** 2 || mask[i]) continue;
          const hx = dx + bulge * 0.7, hy = dy + bulge * 0.7, hq = hx * hx + hy * hy;
          if (hx < -1 && hy < -1 && hq > 9 && hq < 18) mask[i] = 3;
          else if (((x * 3 + y * 5) & 7) === 0 && ((x + y) & 1)) mask[i] = 2 + ((x ^ y) & 1);
          else mask[i] = 2;
        }
      // the stick, straight down off the glass
      for (let y = WAND.y + WAND.r; y < H; y++) for (let x = WAND.x - 1; x <= WAND.x + 1; x++) mask[y * W + x] = 3;
      ops += 600;
    }

    // ---- the giant bubble of the hour
    let giant = null;
    if (hourShow && sec >= 57) {
      const u = ease.inOutCubic(progress(sec, 57, 59.2));
      const wq = sin(sec * TAU * 1.3) * (0.03 + 0.03 * (1 - u));
      giant = {
        x: WAND.x - 6 + (80 - WAND.x + 6) * u, y: WAND.y - 4 + (40 - WAND.y + 4) * u,
        rx: (7 + 71 * u) * (1 + wq), ry: (7 + 31 * u) * (1 - wq), tear: -1,
      };
    } else if (wasHour && sec < 1.2) {
      giant = { x: 80, y: 40, rx: 78, ry: 38, tear: sec };
    }
    if (giant && giant.tear < 0) gEll = giant;

    // ---- loose bubbles from the wand (closed form from their emission slots)
    const SLOTT = 0.125;
    const k1 = Math.floor(T / SLOTT), k0 = k1 - 70;
    for (let k = k0; k <= k1; k++) {
      const te = k * SLOTT, ls = ((te % 60) + 60) % 60, lg = ls % 15;
      const inGust = lg > 11.5 && lg < 14 && ls < 55;
      const hsh = hash(k, 77);
      if ((hsh % 1000) >= (inGust ? 620 : 70)) continue;
      const tau = T - te;
      const r = 2 + ((hsh >>> 10) % (inGust ? 5 : 6));
      const life = 3.2 + ((hsh >>> 14) % 100) / 22;
      if (tau > life + 0.3) continue;
      const ang = -2.25 - ((hsh >>> 20) % 100) / 180 + (inGust ? 0.15 : 0);
      const sp = (inGust ? 34 : 20) + ((hsh >>> 4) % 16);
      const grow = Math.min(1, tau / 0.22);
      const bx = MOUTH[0] + Math.cos(ang) * sp * tau + 2 * sin(tau * 1.7 + k);
      const by = MOUTH[1] + Math.sin(ang) * sp * tau * 0.8 + 1.6 * tau * tau + 2.2 * sin(tau * 2.1 + k * 0.7);
      if (bx < -10 || by < -10 || by > H + 10) continue;
      if (tau <= life) {
        const rr = Math.max(1, Math.round(r * grow));
        if (rr >= 2) looseBubble(bx, by, rr, Math.round(1 + sin(tau * 5 + k)), true);
      } else {
        const q = (tau - life) / 0.3;     // pop: a ring of drops
        for (let j = 0; j < 7; j++) {
          const a = j * 0.9 + k;
          drop(bx + sin(a + 1.5708) * (r + 9 * q), by + sin(a) * (r + 9 * q) + 10 * q * q, false, false);
        }
      }
    }
    // the hour's flurry from the burst
    if (wasHour && sec < 3.5) {
      { const j = nKeep++ * 4; KEEP[j] = 76; KEEP[j + 1] = 20; KEEP[j + 2] = 100; KEEP[j + 3] = 60; }   // and off the colon
      for (let j = 0; j < 26; j++) {
        const hj = hash(j, f.minuteKey, 5);
        const t0 = 0.15 + (hj % 50) / 100, tau = sec - t0, life = 1.4 + ((hj >>> 8) % 100) / 60;
        if (tau < 0) continue;
        const a = ((hj >>> 16) % 628) / 100, sx0 = 80 + 74 * Math.cos(a), sy0 = 40 + 35 * Math.sin(a);   // off the torn rim
        const sp = 6 + (hj >>> 24) % 10;
        const bx = sx0 + Math.cos(a) * sp * tau, by = sy0 + Math.sin(a) * sp * tau * 0.7 - 4 * tau;
        const r = 2 + (hj >>> 12) % 3;
        if (tau < life) looseBubble(bx, by, Math.max(2, Math.round(r * Math.min(1, tau / 0.2))), 1, true);
        else if (tau < life + 0.25) for (let i = 0; i < 6; i++) drop(bx + sin(i + 1.57) * (r + 30 * (tau - life)), by + sin(i) * (r + 30 * (tau - life)), false, false);
      }
    }

    // ---- the giant: rim, its film band, highlight; or its tear and drops
    if (giant) {
      const { x, y, rx, ry, tear } = giant;
      const n = Math.min(NC, Math.ceil((rx + ry) * 3.2)), step = NC / n;
      const torn = tear >= 0 ? clamp(tear / 0.32, 0, 1) * 0.5 : 0;   // fraction of the turn gone each side
      const tearAt = 0.625;                                          // the rupture starts at upper left
      for (let j = 0; j < n; j++) {
        const ii = Math.floor(j * step), a = ii / NC;
        let da = Math.abs(a - tearAt); if (da > 0.5) da = 1 - da;
        const c = CS[ii], s = SN[ii];
        if (da < torn) {
          // behind the tear: drops thrown outward
          if (j % 3) continue;
          const age = tear - (da / 0.5) * 0.32;              // since the tear reached this point
          const hj = hash(j, 9);
          const v = 50 + (hj % 60);
          drop(x + c * (rx + v * age), y + s * (ry + v * age * 0.7) + 60 * age * age, age < 0.12, true);
          continue;
        }
        for (let w = 0; w < 2; w++) {
          const px = Math.round(x + c * (rx - w)), py = Math.round(y + s * (ry - w));
          if (px >= 0 && py >= 0 && px < W && py < H) mask[py * W + px] = 3;
        }
        // film band inside the rim, behind everything else
        for (let w = 3; w < 7; w++) {
          const px = Math.round(x + c * (rx - w)), py = Math.round(y + s * (ry - w));
          if (px < 0 || py < 0 || px >= W || py >= H) continue;
          const i = py * W + px;
          if (mask[i]) continue;
          const h = TEX[((py + Math.floor(tl * 6)) & 63) * 64 + ((px + Math.floor(tl * 3)) & 63)] - Math.floor(tl * 30) + w * 9;
          const tri = h & 63, L = tri < 32 ? tri : 63 - tri;
          if ((L >> 1) - 3 > BAYER[((py & 3) << 2) | (px & 3)]) mask[i] = 1;
        }
        // the window highlight
        if (a > 0.57 && a < 0.69 && rx > 14) for (let w = 6; w < 9; w++) {
          const px = Math.round(x + c * (rx - w)), py = Math.round(y + s * (ry - w));
          if (px >= 0 && py >= 0 && px < W && py < H && mask[py * W + px] < 2) mask[py * W + px] = 1;
        }
      }
      ops += n * 12;
    }

    // ---- popping digits: the empty skin beads up and flies apart
    for (const [G, cx, cy, tau, k] of pops) {
      if (tau > 0.62) continue;
      const D = G.drops, gcx = MARGIN + G.bw / 2, gcy = MARGIN + G.bh / 2;
      const hold = 0.07, m = Math.max(0, tau - hold);
      for (let j = 0; j < D.length; j += 2) {
        const ox = D[j] + 0.5 - gcx, oy = D[j + 1] + 0.5 - gcy;
        const hj = hash(j, k, 31);
        const l = Math.sqrt(ox * ox + oy * oy) + 4;
        const v = 30 + (hj % 50);
        const px = cx + ox + (ox / l) * v * m + ((hj >>> 8) % 20 - 10) * m;
        const py = cy + oy + (oy / l) * v * m + 150 * m * m;
        if (tau < 0.5 || (hj & 1)) drop(px, py, tau < 0.3, true);
      }
      ops += D.length * 4;
    }

    // ---- out to the glass: two colours
    const buf = g.buf;
    for (let i = 0; i < N; i++) buf[i] = mask[i] & 1 ? INK : GROUND;
    g.cost.px += N; g.cost.box += N * 2 + ops * 7;
  },
};
