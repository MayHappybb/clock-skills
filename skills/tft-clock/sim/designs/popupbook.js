// Pop-up Book: the glass is an open children's pop-up book, seen from
// above the reader's lap, and the time is its pop-ups. Each numeral is a
// die-cut card (popupbook-glyphs.js: chunky cut, ink keyline, the white core
// of the card along its lit edges, a printed pattern) standing on a little
// accordion-folded paper spring on the spread: the hours on the left page,
// the minutes on the right, the gutter between them for a colon. Under each
// stand a pull-tab sticks out of the page block.
//
// Every second is a beat: the book gives a small bounce (the pages rise at
// the gutter), each spring is pressed and throws its card up, and the card
// tips to one side and back, left one second, right the next, in a ripple
// from the first digit to the last; the pull-tabs are tugged as the springs
// press. Each page has a printed slider running in its slot (a sheep, a
// sailboat, a tractor, a bus, a duck...). Every 15 s a bigger beat: a big
// hop at :15, the book pumps at :30, a hop and a big swing at :45.
//
// Minute turn: the reader turns the page. The right-hand leaf's corner curls
// up (anticipation), the leaf swings over the gutter on an arc, leading,
// then trailing, and its edge flops down last with a small bounce. The
// pop-ups do what a pop-up book's do: a spread's pop-ups stand as far as it
// is open. The old minutes fold flat against the lifting leaf and ride it
// away; the old hours fold down as their spread closes; the new minutes rise
// out of the new right page as the leaf uncovers it, and the new hours
// unfold from the back of the leaf as it comes down (tilted with it, upright
// as it lands), overshoot on their springs and settle. Every minute is a new
// spread with its own printed scene and its own four card colours (meadow,
// seaside, snowfield, farm, town, pond). The two digits of a pair always
// fold and rise together, so a lone digit never stands for a pair. Old
// digits are flat before :00, new ones start after.
// The hour: the page turns to the circus chapter, and its centrepiece, a big
// top, unfolds out of the gutter behind the time, body first, then the
// roof, then the flag pops up on its pole and two strings of bunting unfurl
// to the corners; it stays all minute and folds away with the next turn.
//
// Palette: printed inks on cream paper, kept sparse and pale so the paper is
// the calmest and commonest thing on the glass; the cards are the strongest
// contrast, deep saturated card colours with a dark ink keyline. Shading is
// flat tone steps (32 inks x 8 tones per spread): the gutter, the cards'
// shadows on the page (cast by a lamp up and to the left), and the turning
// leaf, which darkens and lightens as it turns from the lamp (dithered
// between steps). At night the paper goes to a dusky blue, the cards keep
// their colour and the backlight drops to 45 %. Hard pixels: card has a
// crisp die-cut edge.
//
// Cost: spreads, glyphs and the big top are byte tables made at load (flash
// ~85 KB). Per frame: two 10 KB working copies of the spreads (sliders and
// shadows stamped in), the page copied through a palette, the leaf drawn as
// 77 columns of the page texture, each card an affine lookup over its box
// into a small scratch, then a neighbour pass for its edges. All charged to
// the estimate as box work.
import { clockFields, to565 } from '../js/kit.js';
import { GLYPH, SW, SH } from './popupbook-glyphs.js';
import { buildSpreads, SLIDES, SPREADS, CIRCUS, PAL, CARD, TW, TH, PX0, PY0, T_FLAT, T_SHADOW, I_PAPER, I_COVER, I_COVER_D, I_BLOCK, I_BLOCK_L, I_WALL, TENT_BODY, TENT_ROOF, TENT_PAL, BUNTING } from './popupbook-art.js';

const W = 160, H = 80;
const K = 0.75;                                   // how much a page's lift shows on the glass
const CX = [23.5, 55.5, 105.5, 137.5], BY = [60, 60, 64, 64];
const UD = [56, 24, 25, 57];                      // each stand's distance from the gutter
const ROW = BY.map((y) => y - PY0);               // its depth on the page (texture row)
const GSPR = GLYPH.map((d) => ({ d, w: SW, h: SH }));
const TEX = buildSpreads(CX.map((x, i) => [x - 9, x + 9, BY[i]]));
const WA = new Uint8Array(TW * TH), WB = new Uint8Array(TW * TH);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const prog = (v, a, b) => (v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a));

function spreadOf(key) {
  const f = clockFields(new Date(key * 60000));
  return f.m === 0 ? CIRCUS : ((key % 6) + 6) % 6;
}

// ------------------------------------------------------------ the page turn
// tau: seconds from the minute boundary. The leaf's angle at the gutter
// (0 lying on the right, 180 on the left) on a trapezoid speed profile, and
// a bend: the corner curls up first, the leaf leads, then trails, and the
// edge flops down last.
const SW0 = -1.1, SW1 = 1.2, ACC = 0.25, CURL0 = -1.5, SETTLE = 1.95;
function swingE(u) {
  const v = 1 / (1 - ACC);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < ACC) return (u * u * v) / (2 * ACC);
  if (u > 1 - ACC) return 1 - (v * (1 - u) * (1 - u)) / (2 * ACC);
  return v * (u - ACC / 2);
}
function leafAngles(tau) {
  const u = (tau - SW0) / (SW1 - SW0);
  const th = 180 * swingE(u);
  let b = 0;
  if (tau < SW0) b = 22 * sm((tau - CURL0) / (SW0 - CURL0));
  else if (tau < SW1) b = u < 0.55 ? 22 - 44 * sm(u / 0.55) : -22 + 12 * sm((u - 0.55) / 0.45);
  else if (tau < 1.65) b = -10 * (1 - sm((tau - SW1) / 0.35));
  else if (tau < 1.95) b = -2.5 * Math.sin((Math.PI * (tau - 1.65)) / 0.3);
  return [th, b];
}
const WQ = Float32Array.from({ length: 77 }, (_, u) => Math.pow((u + 0.5) / 77, 1.6));
const LA = new Float32Array(77), LX = new Float32Array(77), LY = new Float32Array(77), LC = new Float32Array(77), LS = new Float32Array(77);
const ORDER = new Int32Array(77);
function profile(th, b) {
  let x = 80, y = 0;
  for (let u = 0; u < 77; u++) {
    const a = ((th + b * WQ[u]) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    LA[u] = a; LC[u] = c; LS[u] = s;
    LX[u] = x + 0.5 * c; LY[u] = y - 0.5 * K * s;
    x += c; y -= K * s;
  }
  // paint low to high: the higher part of a curled sheet is the nearer
  for (let u = 0; u < 77; u++) ORDER[u] = u;
  ORDER.sort((p, q) => LY[q] - LY[p]);
}

// ------------------------------------------------------------ cards
function pattern(k, i, j) {
  switch (k) {
    case 0: return ((i + ((j / 6) & 1) * 3) % 6) < 2 && j % 6 < 2;          // dots
    case 1: return (i + j) % 8 < 3;                                          // stripes
    case 2: return j % 7 < 2;                                                // bands
    case 3: return ((j + Math.abs((i % 8) - 4)) % 8) < 2;                    // zigzag
    default: return ((i + 1) >> 2) & 1;                                      // the big top's stripes
  }
}

let COST = 0;
/**
 * A card at pivot (px, py) (its base, centred), columns along e1 and up
 * along e2 (glass px per sprite px), folded to s of its height.
 */
const SCR = new Uint8Array(100 * 80);           // one card's codes, before its edges are cut
function card(buf, spr, pal, pk, px, py, e1x, e1y, e2x, e2y, s, e) {
  const gl = spr.d, SW = spr.w, SH = spr.h, hb = e + SH * s;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const a of [-SW / 2, SW / 2]) for (const b of [0, hb]) {
    const X = px + a * e1x + b * e2x, Y = py + a * e1y + b * e2y;
    if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
  }
  x0 = Math.max(0, Math.floor(x0) - 1); x1 = Math.min(W - 1, Math.ceil(x1) + 1);
  y0 = Math.max(0, Math.floor(y0) - 1); y1 = Math.min(H - 1, Math.ceil(y1) + 1);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  if (bw <= 0 || bh <= 0 || bw * bh > SCR.length) return;
  const det = e1x * e2y - e1y * e2x, id = 1 / det, is = 1 / s, ie = e > 0.01 ? 4 / e : 0;
  // the print comes into view as the card straightens (squashed, it is only the face colour)
  const pv = (s - 0.6) / 0.32;
  // pass 1: what of the card is at each pixel
  for (let y = y0, k = 0; y <= y1; y++) {
    const dy = y + 0.5 - py;
    for (let x = x0; x <= x1; x++, k++) {
      const dx = x + 0.5 - px;
      const a = (dx * e2y - dy * e2x) * id, bb = (e1x * dy - e1y * dx) * id;
      const i = Math.floor(a + SW / 2);
      let c = 0;
      if (i >= 0 && i < SW && bb >= 0) {
        if (bb >= e) {
          const j = Math.floor(SH - (bb - e) * is);
          if (j >= 0 && gl[j * SW + i] >= 2) c = gl[j * SW + i] === 7 ? 7 : pv > BAYER[((y & 3) << 2) | (x & 3)] && pattern(pk, i, j) ? 5 : 2;
        } else {
          // the paper spring it stands on: an accordion strip, four folds
          const z = Math.floor(bb * ie) & 1;
          if (a >= -4 - z && a < 3 + z) c = z ? 8 : 9;
        }
      }
      SCR[k] = c;
    }
  }
  // pass 2: cut it out: a keyline outside, the lit cut edge along the top and left, shade along the bottom and right
  for (let yy = 0, k = 0; yy < bh; yy++) {
    const row = (y0 + yy) * W + x0;
    for (let xx = 0; xx < bw; xx++, k++) {
      const c = SCR[k];
      const up = yy > 0 ? SCR[k - bw] : 0, dn = yy < bh - 1 ? SCR[k + bw] : 0;
      const lf = xx > 0 ? SCR[k - 1] : 0, rt = xx < bw - 1 ? SCR[k + 1] : 0;
      if (c === 0) {
        if (up | dn | lf | rt) buf[row + xx] = pal[1];
        continue;
      }
      if (c >= 8) { buf[row + xx] = pal[c === 8 ? 3 : 6]; continue; }
      buf[row + xx] = c === 7 ? pal[7] : !up || !lf ? pal[3] : !dn || !rt ? pal[4] : pal[c];
    }
  }
  COST += bw * bh * 3;
}

/** Its shadow on the page, stamped into a spread texture (bit 64). */
function shadow(tex, d, px, py, e1x, e1y, e2x, e2y, s, e) {
  const gl = GLYPH[d], hb = SH * s;
  const fx = e2x - 0.45 * e2y, fy = 0.32 * e2y;          // the lamp is up and to the left, in front
  px += e * fx; py += e * fy;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const a of [-SW / 2, SW / 2]) for (const b of [0, hb]) {
    const X = px + a * e1x + b * fx, Y = py + a * e1y + b * fy;
    if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
  }
  x0 = Math.max(PX0, Math.floor(x0)); x1 = Math.min(PX0 + TW - 1, Math.ceil(x1));
  y0 = Math.max(PY0, Math.floor(y0)); y1 = Math.min(PY0 + TH - 1, Math.ceil(y1));
  const det = e1x * fy - e1y * fx, id = 1 / det, is = 1 / s;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - py;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - px;
      const a = (dx * fy - dy * fx) * id, bs = (e1x * dy - e1y * dx) * id;
      const i = Math.floor(a + SW / 2);
      if (i < 0 || i >= SW || bs < 0) continue;
      COST++;
      const j = Math.floor(SH - bs * is);
      if (j < 0 || !gl[j * SW + i]) continue;
      tex[(y - PY0) * TW + x - PX0] |= 64;
    }
  }
}

/** The spread's sliders, one per page, running in their slots (clipped at the slot ends). */
function slides(tex, sp, T) {
  const S = SLIDES[sp];
  for (let p = 0; p < 2; p++) {
    const c0 = p * 77, L = 77 + S.w;
    const x = c0 - S.w + Math.floor((T * 15 + p * 40) % L);
    for (let j = 0; j < S.h; j++) for (let i = 0; i < S.w; i++) {
      const v = S.d[j * S.w + i], c = x + i;
      if (v < 0 || c < c0 + 1 || c >= c0 + 76) continue;
      tex[(S.y - PY0 + j) * TW + c] = v;
    }
    COST += S.w * S.h;
  }
}

// ------------------------------------------------------------ the glass
function gutterTone(x) {
  const d = Math.abs(x + 0.5 - 80);
  return d < 1 ? -2 : d < 3 ? -1 : 0;
}
const GT = Int8Array.from({ length: W }, (_, x) => gutterTone(x));

const OFF = new Int8Array(W);
const FLEXW = Float32Array.from({ length: W }, (_, x) => Math.pow(Math.max(0, 1 - Math.abs(x + 0.5 - 80) / 80), 0.7));
/** The book flexes on the beat: the pages rise towards the gutter by up to `a` px. */
function flex(a) {
  for (let x = 0; x < W; x++) OFF[x] = -Math.round(a * FLEXW[x]);
}

function book(buf, texL, palL, texR, palR) {
  const wall = palL[T_FLAT * 32 + I_WALL], cov = palL[T_FLAT * 32 + I_COVER], covd = palL[T_FLAT * 32 + I_COVER_D];
  const bl = palL[T_FLAT * 32 + I_BLOCK], bll = palL[T_FLAT * 32 + I_BLOCK_L];
  buf.fill(wall, 0, 5 * W);
  buf.fill(covd, 5 * W, 6 * W);
  for (let x = 0; x < W; x++) {
    if (x < PX0 || x >= PX0 + TW) {
      for (let y = 6; y < H; y++) buf[y * W + x] = x === 0 || x === W - 1 || y === H - 1 ? covd : cov;
      continue;
    }
    const tex = x < 80 ? texL : texR, pal = x < 80 ? palL : palR, o = OFF[x], tc = x - PX0, gt = T_FLAT + GT[x];
    const top = PY0 + o, bot = PY0 + TH + o;
    for (let y = 6; y < top; y++) buf[y * W + x] = cov;
    for (let r = 0; r < TH; r++) {
      const v = tex[r * TW + tc];
      buf[(top + r) * W + x] = pal[(gt - (v & 64 ? 2 : 0)) * 32 + (v & 31)];
    }
    for (let y = bot; y < 78; y++) buf[y * W + x] = y === 77 ? bll : bl;
    buf[78 * W + x] = cov; buf[79 * W + x] = covd;
  }
  COST += W * (H - 5);
}

/** The turning leaf: its front is spread A's right page, its back spread B's left page. */
function leaf(buf, palA, palB) {
  for (let k = 0; k < 77; k++) {
    const u = ORDER[k];
    const X = Math.floor(LX[u]);
    if (X < 0 || X >= W) continue;
    const front = LC[u] >= 0;
    const s = LS[u], c = LC[u];
    const br = front ? 0.45 * s + 0.89 * c : -0.45 * s - 0.89 * c;
    let tf = T_FLAT + (br - 0.89) * 3.2 + GT[front ? 80 + u : 79 - u];
    if (tf < 0) tf = 0; if (tf > 7) tf = 7;
    const t0 = Math.floor(tf), fr = tf - t0, t1 = Math.min(7, t0 + 1);
    const tex = front ? WA : WB, pal = front ? palA : palB, col = front ? 77 + u : 76 - u;
    const sh = Math.round(LY[u]);
    const edge = Math.abs(LS[u]) > 0.06;      // a lifted sheet shows its edge
    for (let r = 0; r < TH; r++) {
      const y = PY0 + r + sh;
      if (y < 0 || y >= H) continue;
      const w = tex[r * TW + col], v = w & 31;
      const t = (fr > BAYER[((y & 3) << 2) | (X & 3)] ? t1 : t0) - (w & 64 ? 2 : 0);
      buf[y * W + X] = edge && (r === 0 || r === TH - 1 || u === 76) ? pal[Math.max(0, t - 2) * 32 + 4] : pal[(t < 0 ? 0 : t) * 32 + v];
    }
    COST += TH;
  }
}

// ------------------------------------------------------------ rest motion
const PATS = [0, 1, 2, 3];
const E0 = 3;
// every 15 s a bigger beat: :15 a big hop, :30 the book pumps, :45 a hop and a swing
const BIG = (n) => { const k = ((n % 60) + 60) % 60; return k === 15 ? [2.1, 1] : k === 30 ? [1.3, 1.7] : k === 45 ? [1.9, 1.7] : [1, 1]; };
function rest(i, s) {
  const q0 = s - 0.07 * i, n = Math.floor(q0), q = q0 - n, [ms, mr] = BIG(n);
  const g = Math.sin(Math.PI * q) * Math.exp(-2.5 * q) * 2.6;           // tip and return, once a beat
  const dir = n & 1 ? -1 : 1;
  const psi = dir * 0.1 * mr * g;
  // the spring: pressed by the page's bounce, then it throws the card up
  const sp = q < 0.12 ? -1.6 * Math.sin((Math.PI * q) / 0.12) : 4.2 * Math.sin((2 * Math.PI * (q - 0.12)) / 0.88) * Math.exp(-1.8 * (q - 0.12));
  const sv = 1;
  return [psi, sv, sp * ms];
}

export default {
  name: 'Pop-up Book',
  blurb: 'A children\'s pop-up book: the numerals are die-cut cards bobbing on paper springs; each minute the page turns, the old pop-ups fold flat and the new spread opens with the new time rising out of it.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey, buf = g.buf;
    COST = 0;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    const nt = ctx.night >= 0.5 ? 1 : 0;
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm;
    let tau = null;
    if (s >= 57.5) tau = s - 60; else if (s < 2.5) tau = s;
    const keyA = tau !== null && tau >= 0 ? mk - 1 : mk, keyB = keyA + 1;
    const digA = tau !== null && tau >= 0 ? prv.hh + prv.mm : cur, digB = tau !== null && tau >= 0 ? cur : nxt.hh + nxt.mm;
    const spA = spreadOf(keyA), spB = spreadOf(keyB);
    const palA = PAL[spA][nt], palB = PAL[spB][nt];
    const T = (ctx.date.getTime() % 86400000) / 1000;
    WA.set(TEX[spA]); slides(WA, spA, T);
    if (tau !== null) { WB.set(TEX[spB]); slides(WB, spB, T); }

    // jobs for the four cards. Everything follows the leaf, as in a real
    // pop-up book: a pop-up stands as far as its spread is open. Spread A
    // (left page + leaf front) closes as the leaf lifts, so the old cards
    // fold down; spread B (leaf back + the new right page) opens as it lands,
    // so the new cards rise. Cards on the leaf follow its local angle (the
    // corner leads), cards on a flat page the angle at the gutter.
    const jobs = [];
    let th = 0, bend = 0, turning = false;
    if (tau !== null) {
      [th, bend] = leafAngles(tau);
      turning = tau > CURL0 && tau < SETTLE;
      profile(th, bend);
    }
    const ampOld = tau === null || tau >= 0 ? 1 : 1 - sm((tau - CURL0 + 0.6) / 0.6);
    const ampNew = tau === null || tau < 0 ? 1 : sm((tau - SW1 - 0.1) / 0.7);
    for (let i = 0; i < 4; i++) {
      const [psi0, sv0, sp0] = rest(i, s);
      let fold = 1, mode = 'pageA', d = +digA[i], pal = CARD[spA][nt][i], amt = ampOld;
      if (tau !== null && tau > CURL0) {
        const phi = i >= 2 ? (LA[UD[2]] * 180) / Math.PI + (i === 3 ? 3 : 0) : th;   // the pair folds together (a lone digit would read as another time)
        const oldS = i >= 2 ? foldS(prog(phi, 10, 42)) : foldS(prog(th, i === 1 ? 26 : 30, i === 1 ? 84 : 88));
        if (oldS > 0.03 && (i < 2 || th < 90)) { fold = oldS; mode = i >= 2 ? 'front' : 'pageA'; amt = ampOld; }
        else {
          // folded flat, the old card lies on its page as a strip until the leaf covers it
          if (turning) jobs.push({ i, d, pal, mode: i >= 2 ? 'front' : 'pageA', fold: 0.03, psi: 0, e: 0 });
          d = +digB[i]; pal = CARD[spB][nt][i]; amt = i >= 2 ? ampNew : sm((tau - SETTLE) / 0.55);   // the hours start to sway once their leaf is down
          if (i >= 2) { mode = turning ? 'pageB' : 'pageA'; fold = riseS(prog(tau, i === 2 ? 0.08 : 0.11, i === 2 ? 1.0 : 1.03)); }   // as the spread opens, paced so no edge moves over ~2 px a frame
          else {
            const ph = tau >= SETTLE ? 180 : (LA[UD[1]] * 180) / Math.PI;
            mode = turning ? 'back' : 'pageA'; fold = ph < 120 ? 0.03 : riseS(prog(tau, i === 1 ? 0.52 : 0.55, i === 1 ? 1.42 : 1.45));
          }
          // the landing: the new cards dip on their springs and bob back
          if (tau > SW1 - 0.05) { const q = tau - SW1 + 0.05; fold *= 1 - 0.07 * Math.sin(q * 9) * Math.exp(-q * 3.2); }
          if (fold <= 0.03) { if (turning) fold = 0.03; else mode = 'none'; }
        }
      }
      const psi = psi0 * amt, sv = 1 + (sv0 - 1) * amt;
      jobs.push({ i, d, pal, mode, fold: fold * sv, psi, e: (E0 + sp0 * amt) * Math.min(1, fold) });
    }
    // which spread lies where: during the turn A on the left, B on the right; after it B on both
    const settled = tau !== null && tau >= SETTLE;
    const after = settled || (tau !== null && tau >= 0 && !turning);
    const texL = after ? WB : WA, palL = after ? palB : palA;
    const texR = tau !== null && (turning || after) ? WB : WA, palR = tau !== null && (turning || after) ? palB : palA;

    // shadows of standing cards on flat pages
    for (const J of jobs) {
      if (J.mode === 'none') continue;
      // cards on the leaf cast onto the leaf's own paper (it carries their shadows as it turns)
      const tex = J.mode === 'front' ? WA : J.mode === 'back' ? WB : J.i < 2 ? texL : texR;
      const c = Math.cos(J.psi), sn = Math.sin(J.psi);
      shadow(tex, J.d, CX[J.i], BY[J.i], c, sn, sn, -c, J.fold, J.e);
    }
    // the beat: the book gives a little bounce, the pages rise at the gutter
    let fa = 1;
    if (tau !== null) fa = tau < 0 ? 1 - sm((tau + 2.4) / 0.5) : sm((tau - 2.0) / 0.5);
    const q = s - Math.floor(s);
    const F = q < 0.32 ? Math.sin((Math.PI * q) / 0.32) : q < 0.56 ? 0.3 * Math.sin((Math.PI * (q - 0.32)) / 0.24) : 0;
    flex(3.4 * F * fa * (Math.floor(s) === 30 ? 1.9 : 1));
    book(buf, texL, palL, texR, palR);
    const draw = (J) => {
      const S = J.fold;
      if (J.mode === 'front' || J.mode === 'back') {
        const u = UD[J.i];
        const a = LA[u], c = LC[u], sn = LS[u];
        if ((J.mode === 'front') !== (c >= 0)) return;
        const px = LX[u], py = BY[J.i] + LY[u];
        if (J.mode === 'front') card(buf, GSPR[J.d], J.pal, PATS[J.i], px, py, c, -K * sn, -sn, -c, S, J.e);
        else card(buf, GSPR[J.d], J.pal, PATS[J.i], px, py, -c, K * sn, sn, c, S, J.e);
        return a;
      }
      const c = Math.cos(J.psi), sn = Math.sin(J.psi);
      card(buf, GSPR[J.d], J.pal, PATS[J.i], CX[J.i], BY[J.i] + OFF[Math.floor(CX[J.i])], c, sn, sn, -c, S, J.e);
    };
    // the hour's big top stands in the gutter of the chapter spread
    const tent = tentState(spA, spB, tau, th, F * fa);
    if (tent && tent.side === 'A') bigTop(buf, tent, nt, T);
    for (const J of jobs) if (J.mode === 'pageA' || (J.mode === 'pageB' && !turning)) draw(J);
    if (turning) leaf(buf, palA, palB);
    if (tent && tent.side === 'B') bigTop(buf, tent, nt, T);
    if (turning) for (const J of jobs) if (J.mode === 'pageB') draw(J);
    for (const J of jobs) if (J.mode === 'front' || J.mode === 'back') draw(J);
    // pull-tabs along the near edge, one under each stand: tugged as its spring is pressed
    for (let i = 0; i < 4; i++) {
      const pull = Math.max(0, -rest(i, s)[2]) * 1.4 * fa;
      pullTab(buf, Math.floor(CX[i]) - 3, 76 + Math.round(pull), nt);
    }
    g.cost.box += COST * 6; g.cost.px += COST;
  },
};

function foldS(p) {
  // anticipation: the card leans up a touch as its spread starts to close, then folds down
  if (p <= 0) return 1;
  if (p < 0.2) return 1 + 0.05 * Math.sin((Math.PI * p) / 0.4);
  return 1.05 * (1 - sm((p - 0.2) / 0.8));
}
function riseS(r) {
  // rises, overshoots a little as the paper straightens, settles
  if (r < 0.75) return 1.07 * sm(r / 0.75);
  return 1.07 - 0.07 * sm((r - 0.75) / 0.25);
}

// ------------------------------------------------------------ pull-tabs
const TAB = [[0x2a2030, 0xc89a62, 0xe9c88f, 0x8a3a2a], [0x1e1a26, 0x6a5a4a, 0x7a6a58, 0x4a2a24]].map((r) => r.map(to565));
function pullTab(buf, x, y, nt) {
  const c = TAB[nt];
  for (let j = 0; y + j < H; j++) for (let i = -1; i < 8; i++) {
    const X = x + i, Y = y + j;
    buf[Y * W + X] = i < 0 || i > 6 ? c[0] : j === 0 ? c[2] : i === 3 && j === 1 ? c[3] : c[1];
  }
  COST += 40;
}

// ------------------------------------------------------------ the big top
const TB_Y = 38;
function tentState(spA, spB, tau, th, F) {
  if (tau === null) return spA === CIRCUS ? { side: 'A', body: 1, roof: 1, flag: 1, bunt: 1, F } : null;
  if (spB === CIRCUS && (tau >= 0 || th > 60)) {
    return { side: 'B', body: riseS(prog(th, 70, 150)), roof: riseS(prog(th, 105, 176)), flag: sm((tau - 1.25) / 0.45), bunt: sm((tau - 1.45) / 1.3), F };
  }
  if (spA === CIRCUS && tau < 0) {
    return { side: 'A', body: foldS(prog(th, 22, 80)), roof: foldS(prog(th, 3, 42)), flag: 1 - sm((tau + 1.95) / 0.35), bunt: 1 - sm((tau + 2.45) / 0.7), F };
  }
  if (spA === CIRCUS && tau >= 0) return null;     // folded away under the leaf
  return null;
}
function bigTop(buf, T0, nt, T) {
  const pal = TENT_PAL[nt], o = OFF[80];
  const by = TB_Y + o;
  const sb = T0.body * (1 + 0.025 * T0.F), sr = T0.roof * (1 + 0.05 * T0.F);
  if (sb > 0.02) card(buf, TENT_BODY, pal, 4, 80, by, 1, 0, 0, -1, sb, 0);
  const ry = by - TENT_BODY.h * sb;
  if (sb > 0.02 && sr > 0.02) card(buf, TENT_ROOF, pal, 4, 80, ry, 1, 0, 0, -1, sr * Math.min(1, sb * 1.5), 0);
  const apex = ry - TENT_ROOF.h * sr * Math.min(1, sb * 1.5) + 1;
  // bunting: two strings run from the top of the pole out to the page corners, unfurling
  if (T0.bunt > 0 && sr > 0.5) {
    for (const side of [-1, 1]) {
      const ey = 8 + T0.F, n = Math.floor(74 * T0.bunt);
      for (let k = 2; k <= n; k++) {
        const u = k / 74, x = Math.round(80 + side * k), y = Math.round(apex + 2 + (ey - apex - 2) * u + 2.5 * Math.sin(Math.PI * u));
        if (y >= 0 && y < H) buf[y * W + x] = pal[1];
        if (k % 7 === 3) {
          const c = BUNTING[(k / 7 | 0) % 4][nt], sw = Math.round(0.8 * Math.sin(T * 5 + k));
          for (let j = 1; j <= 3; j++) for (let i = -2 + j - 1; i <= 2 - j + 1; i++) {
            const X = x + i + (j === 3 ? sw : 0), Y = y + j;
            if (X >= 0 && X < W && Y >= 0 && Y < H) buf[Y * W + X] = c;
          }
        }
      }
      COST += 120;
    }
  }
  // the flag on the pole: it pops up after the landing and flies
  if (T0.flag > 0 && sr > 0.5) {
    const ph = Math.floor(5 * T0.flag), top = Math.round(apex - ph);
    for (let y = top; y < apex; y++) if (y >= 0) buf[y * W + 80] = pal[1];
    if (T0.flag > 0.7) for (let i = 1; i <= 6; i++) {
      const wv = Math.round(Math.sin(T * 7 - i * 0.9) * (i / 6) * 1.2);
      const h = Math.max(1, 3 - (i >> 1));
      for (let j = 0; j < h; j++) { const Y = top + j + wv + (i >> 2); if (Y >= 0) buf[Y * W + 80 + i] = BUNTING[0][nt]; }
    }
  }
}
