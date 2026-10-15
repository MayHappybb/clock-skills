// Dragon Dance: a Chinese New Year woodblock print (nianhua), and the time
// is four dance dragons. Each numeral is the long cloth body of a dragon
// carried on poles: the body IS the digit's stroke (dragondance-glyphs.js),
// its tail tapering at one end, its head held up over the top of the digit
// on the other, dancers under it holding its poles. Hours are a vermilion
// pair, minutes an emerald pair; between them, two dragons playing with the
// flaming pearl over the big drum, the oldest picture there is of a dragon
// dance ("er long xi zhu").
//
// The time is alive every second. The drum is struck on the beat (once a
// second) and on every hit the dancers heave the poles: each dragon is
// lifted 2-3 px and settles, a hump runs down its body from the head to the
// tail, the head snaps its jaws, the dancers step. Between beats the bodies
// never stop: they sway side to side on a two-beat step, a slow undulation
// runs along them, and the gold scales, belly plates and dorsal teeth flow
// along each digit from tail to head, as the cloth slides through the
// dancers' hands, while the outline stays put. Every 15 s a flourish:
// :15 the pearl is tossed in a loop over all four heads, which turn to follow
// it; :30 the roll, a big wave thrown from the first dragon to the last (the
// dancers jump with it); :45 a flash of gold runs down every body.
//
// Minute turn: a changing dragon writhes, head first, out of its numeral
// into the plain double-hump run of the dance (no numeral in any phase),
// from :59.2 to :59.95, and from :00.05 writhes out of that into the new
// numeral, the head leading and the tail last, by :00.8; the dancers shuffle to their
// new places under it. Hour: a string of firecrackers laid along the floor
// goes off from left to right, red paper flying and smoke puffing up; a lion
// dances in across the floor, leaps onto the drum, shakes its head at the
// pearl (the four dragons heave in a roll as it lands), and dances off,
// leaving the floor red with paper that is swept away.
// The digits are never covered but by the lion's back for a moment.
//
// Style and palette: nianhua (Yangjiabu, Taohuawu): a soot-black key block
// with every shape keylined, flat fills of four inks (vermilion, emerald,
// gold, peach pink) and paper white, on warm paper with the pear-wood
// grain of the block. No shading, no gradients, no anti-aliasing: hard
// pixels, as a block prints. The time is the boldest thing: black-keylined
// solid colour; clouds and grain are pale tints with a soft brown line. The
// medium's motion is the cut block's: things step and boil (the pearl's
// flames are recut every 1/8 s), nothing glows or blurs. Night: the same
// block printed on the dark red paper of a door print by lantern light, and
// the backlight down to 55 %.
//
// Cost: each body is stamped into a distance buffer as discs ~1.5 px apart
// (integer work, a table for square roots) and printed through flat inks;
// everything else is sprites and kit shapes. RAM: the distance buffer
// (12.8k x float32 here, int16 + uint16 + int8 on the device: 64 KB), two
// paper frames (51 KB, could be flash). No per-minute caches.

import { clockFields, to565, sin, hash } from '../js/kit.js';
import { GLYPHS, WAVES, N } from './dragondance-glyphs.js';
import { clearBox, stamp, print, BOX, resetBox } from './dragondance-body.js';
import {
  W, H, INK, VERM, EMER, GOLD, PINK, PAPER_DAY, PAPER_NIGHT, DAY, NIGHT, headSprite, NECK, HEAD_W,
  dancerSprites, pearl, drum, CLOUDS_DAY, CLOUDS_NIGHT, CLOUD_KEY, LION, lionBody, lionUp, popStar, cracker,
} from './dragondance-art.js';

const SLOT_X = [10, 44, 96, 130], SLOT_Y = [19, 17, 17, 19];
const FACE = [1, 1, -1, -1];                   // in the wave, every head turns to the pearl
const PX = Array.from({ length: 4 }, () => new Float32Array(N));
const PY = Array.from({ length: 4 }, () => new Float32Array(N));
const PNX = Array.from({ length: 4 }, () => new Float32Array(N));
const PNY = Array.from({ length: 4 }, () => new Float32Array(N));
const PB = Array.from({ length: 4 }, () => new Int8Array(N));
const PR = Array.from({ length: 4 }, () => new Float32Array(N));

const inks = (body, fin) => ({ body: to565(body), fin: to565(fin), scale: to565(GOLD), belly: to565(GOLD), tick: to565(INK), key: to565(INK) });
const INK565 = [inks(VERM, EMER), inks(VERM, EMER), inks(EMER, VERM), inks(EMER, VERM)];
const HEADS = [headSprite(VERM, EMER), headSprite(EMER, VERM)];
const DANCERS = [dancerSprites(GOLD, EMER), dancerSprites(PINK, VERM)];
const STEP = new Float32Array(4), FLOW = new Float32Array(4), FLASH = new Float32Array(4);
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const bump = (x) => (x <= -1 || x >= 1 ? 0 : (1 - x * x) * (1 - x * x));

/** The dancers' heave on a beat: up fast, down slow (0..1), `bt` seconds after it. */
const lift = (bt) => (bt < 0 ? 0 : bt < 0.09 ? sm(bt / 0.09) : 1 - sm((bt - 0.09) / 0.55));

const ATT = [[0, 0], [0, 0], [0, 0], [0, 0]], FEET = [[0, 0], [0, 0], [0, 0], [0, 0]];

/**
 * Lay slot k's body for this frame into PX/PY/PNX/PNY/PB/PR: glyph A, or A
 * writhing into B by e (0..1). `hump` is the beat's hump size. Returns the
 * glyph's own head facing (0: free to face the pearl).
 */
function lay(k, A, B, e, T, bt, dy, dx, hump) {
  const X = PX[k], Y = PY[k], NX = PNX[k], NY = PNY[k], BK = PB[k], RR = PR[k];
  const ox = SLOT_X[k] + dx, oy = SLOT_Y[k] + dy;
  ATT[k] = B && e > 0.5 ? B.att : A.att;
  const ee = B ? e : 0;
  FEET[k][0] = SLOT_X[k] + A.att[2] + ((B ? B.att[2] : 0) - A.att[2]) * ee;
  FEET[k][1] = SLOT_X[k] + A.att[3] + ((B ? B.att[3] : 0) - A.att[3]) * ee;
  // the beat's hump runs from the head down to the tail
  const pos = 1.05 - bt * 1.5, amp = hump * (1 - sm(bt / 0.8));
  if (!B) {
    for (let i = 0; i < N; i++) {
      // the hump, on a constant slow undulation running down the body
      const w = bump(((i / (N - 1)) - pos) / 0.14) * amp + 0.7 * sin(i * A.step * 0.26 + T * 7);
      X[i] = ox + A.X[i] + A.NX[i] * w; Y[i] = oy + A.Y[i] + A.NY[i] * w;
      NX[i] = A.NX[i]; NY[i] = A.NY[i]; BK[i] = A.BACK[i]; RR[i] = A.RAD[i];
    }
    STEP[k] = A.step;
    return A.face;
  }
  // writhing from A into B: head first, the tail last, a travelling wiggle at its height
  const LAG = 0.55;
  for (let i = 0; i < N; i++) {
    const s = i / (N - 1), w = sm(e * (1 + LAG) - LAG * (1 - s));
    const wig = 2.2 * sin(Math.PI * w) * sin(s * 14 - T * 9);
    X[i] = ox + A.X[i] + (B.X[i] - A.X[i]) * w;
    Y[i] = oy + A.Y[i] + (B.Y[i] - A.Y[i]) * w + wig;
    BK[i] = w < 0.5 ? A.BACK[i] : B.BACK[i];
    RR[i] = A.RAD[i] + (B.RAD[i] - A.RAD[i]) * w;
  }
  for (let i = 0; i < N; i++) {
    const a = i > 1 ? i - 2 : 0, b = i < N - 2 ? i + 2 : N - 1;
    const tx = X[b] - X[a], ty = Y[b] - Y[a], l = Math.sqrt(tx * tx + ty * ty) || 1;
    NX[i] = -ty / l; NY[i] = tx / l;
  }
  STEP[k] = A.step + (B.step - A.step) * e;
  return sm(e * (1 + LAG)) < 0.5 ? A.face : B.face;
}

/** Where the pearl is: over the drum, bobbing; at :15 tossed in a loop over all four heads. */
function pearlAt(s, T) {
  let x = 80, y = 12 + 1.5 * sin(T * Math.PI);
  const u = (s - 15) / 4;
  if (u > 0 && u < 1) {
    const e = sm(u), a = 2 * Math.PI * e, up = sin(Math.PI * e);
    x = 80 - 56 * sin(a);
    y = y * (1 - up) + 6.5 * up;
  }
  return [x, y];
}

/** The hour's lion: [x of its face's centre, y of its face's top, step phase], or null. */
function lionAt(s, bt) {
  if (s < 2.6 || s > 11.6) return null;
  const hop = 2 * lift(bt);
  if (s < 5.6) { const u = sm((s - 2.6) / 3); return [-24 + 104 * u, 60 - hop, (s * 2) % 1]; }
  if (s < 8.6) {
    const up = sm((s - 5.6) / 0.45) * (1 - sm((s - 8.15) / 0.45));
    const shake = s > 6.2 && s < 7.9 ? 2 * sin((s - 6.2) * Math.PI * 4) : 0;
    return [80 + shake, 60 - 16 * up - hop * (1 - up), (s * 2) % 1, up];
  }
  const u = sm((s - 8.6) / 3);
  return [80 + 104 * u, 60 - hop, (s * 2) % 1];
}

const N_CRACK = 19, CRACK_X = (j) => 4 + j * 8, FUSE_V = 60;

/** The firecrackers along the floor, the red paper they throw, the smoke. */
function firecrackers(g, s, P) {
  const xf = (s - 0.4) * FUSE_V - 4;
  for (let j = 0; j < N_CRACK; j++) {
    const x0 = CRACK_X(j), a = (xf - x0) / FUSE_V;
    if (a < 0) { cracker(g, x0, 74); continue; }
    if (a < 0.2) popStar(g, x0 + 2, 73 - a * 10, a < 0.07 ? 3 : a < 0.14 ? 2 : 1);
    // smoke from every other cracker: a puff that rises, swells and thins away
    if ((j & 1) === 0 && a > 0.1 && a < 1.7) {
      const t = a - 0.1, r = 1.5 + 3 * sm(t / 0.6) - 4.5 * sm((t - 1.0) / 0.6);
      if (r > 0.6) {
        const cx = x0 + 2 + 3 * sin(t * 2 + j), cy = 72 - 14 * sm(t / 1.6);
        g.fillCircle(cx, cy, r + 1, P.cline); g.fillCircle(cx, cy, r, P.cloud);
      }
    }
    // three scraps of red paper each: flung up, falling, left lying on the floor
    for (let q = 0; q < 3; q++) {
      const h = hash(j, q, 41), vx = (h % 41) - 20, vy = 30 + ((h >>> 8) % 34);
      const tl = vy / 40;                                     // flight time back down to the floor
      const ta = a < tl ? a : tl;
      const x = x0 + 2 + vx * ta, y = 74 - vy * ta + 40 * ta * ta;
      if (s > 10 + ((h >>> 16) % 100) / 50) continue;         // swept away at the end, scrap by scrap
      if (x >= 0 && x < W) g.fillRect(Math.round(x), Math.round(a < tl ? y : 76), 2, 1, (h >>> 20) & 3 ? VERM : GOLD);
    }
  }
}

export default {
  name: 'Dragon Dance',
  blurb: 'A New Year woodblock print: the four numerals are dance dragons carried on poles, heaved on every drum beat; each minute a dragon writhes out of its digit into the next; at the hour, firecrackers and a lion dance.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    const T = (ctx.date.getTime() % 86400000) / 1000;
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.45 * night);
    const P = night > 0.5 ? NIGHT : DAY;
    g.buf.set(night > 0.5 ? PAPER_NIGHT : PAPER_DAY);
    g.cost.px += W * H;

    // ---- cloud scrolls drifting across the print
    const CL = night > 0.5 ? CLOUDS_NIGHT : CLOUDS_DAY;
    for (let k = 0; k < 3; k++) {
      const x = ((k * 71 - T * 2.5) % 213 + 213) % 213 - 40;
      g.draw(CL[k & 1], x, [1, 30, 3][k], { key: CLOUD_KEY });
    }

    // ---- this minute's jobs
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourShow = prv.h !== f.h && s < 12;
    const bt = s % 1;
    // the :30 roll (and at the hour, when the lion lands on the drum)
    const roll = s > 29.8 && s < 32.5 ? s - 30 : hourShow && s > 5.4 && s < 8 ? s - 5.6 : -9;
    const [pxl, pyl] = pearlAt(s, T);
    resetBox();
    const faces = [0, 0, 0, 0], jump = [0, 0, 0, 0];
    let scanned = 0;
    for (let k = 0; k < 4; k++) {
      const bk = bt - k * 0.06;
      let dy = -2.4 * lift(bk < 0 ? bk + 1 : bk);
      // the roll: a big heave thrown from the first dragon to the last
      const rj = bump((roll - k * 0.3 - 0.4) / 0.45);
      dy -= 4 * rj; jump[k] = rj;
      // the dragons sway from side to side, a step each way every two beats
      const sw = 1.3 * sin((T - k * 0.12) * Math.PI);
      const wave = WAVES[FACE[k]];
      let A = GLYPHS[+cur[k]], B = null, e = 0;
      if (s >= 59.2 && cur[k] !== nw[k]) { B = wave; e = sm((s - 59.2) / 0.75); }
      else if (s < 0.85 && cur[k] !== old[k]) { A = wave; B = GLYPHS[+cur[k]]; e = sm((s - 0.05) / 0.75); }
      faces[k] = lay(k, A, B, e, T, bt, dy, sw, 1.3 + 1.6 * rj);
      FLOW[k] = -(T * 6 + Math.floor(T) * 4 + 4 * sm(bt / 0.35)) % 1000;
      // :45 a flash of gold runs down the body from the tail to the head
      FLASH[k] = s > 45 && s < 47.5 ? (s - 45 - k * 0.12) * 110 - 8 : -99;
      scanned += stamp(k, PX[k], PY[k], PNX[k], PNY[k], PB[k], PR[k], STEP[k]);
    }

    // ---- the dancers below, each holding his pole up to the body over him
    const step = Math.floor(T) & 1;
    for (let k = 0; k < 4; k++) {
      for (let j = 0; j < 2; j++) {
        const cx = Math.round(FEET[k][j]), push = Math.round(-lift(bt - k * 0.06 - 0.02) - 3 * jump[k]);
        const hy = 65 + push, a = ATT[k][j];
        g.line(cx, hy, Math.round(PX[k][a] - 0.5), Math.round(PY[k][a] + PR[k][a] - 1.5), INK);
        g.blit(DANCERS[k >> 1][(step + j + k) & 1], cx - 3, hy);
      }
    }

    // ---- the drum and the pearl between the hours and the minutes
    drum(g, 80, 77, 1 - sm(bt / 0.25));
    pearl(g, pxl, pyl, T, P);

    // ---- the bodies, printed
    const bw = BOX[2] - BOX[0], bh = BOX[3] - BOX[1];
    const printed = print(g.buf, BOX[0], BOX[1], BOX[2], BOX[3], INK565, STEP, FLOW, PR, FLASH);
    clearBox(BOX[0], BOX[1], BOX[2], BOX[3]);
    // the bill: ~9 cycles a stamped pixel, a test and a reset a scanned one, ~25 cycles a printed one
    g.cost.box += scanned * 3 + bw * bh * 2 + printed * 8; g.cost.px += printed;

    // ---- the heads, held up over the digits, snapping on the beat, turned to the pearl
    for (let k = 0; k < 4; k++) {
      const X = PX[k], Y = PY[k], ex = X[N - 1], ey = Y[N - 1];
      const near = (pxl - ex) * (pxl - ex) + (pyl - ey) * (pyl - ey) < 400;
      const fc = faces[k] || (pxl >= ex ? 1 : -1);
      const shut = bt < 0.14 || (near && (T * 6) % 1 < 0.5) || (FLASH[k] > 100 && FLASH[k] < 140);
      const hx = fc > 0 ? ex - NECK[0] - 0.5 : ex - (HEAD_W - 1 - NECK[0]) - 0.5;
      g.blit(HEADS[k >> 1][shut ? 1 : 0], Math.round(hx), Math.round(ey - NECK[1] - 1.5), { flipX: fc < 0 });
    }

    // ---- the hour: firecrackers along the floor, then the lion dance
    if (hourShow) {
      firecrackers(g, s, P);
      const L = lionAt(s, bt);
      if (L) {
        const [lx, ly, ph, up = 0] = L;
        const blink = (s > 6.6 && s < 6.8) || (s > 7.5 && s < 7.65);
        // walking, its body trails behind it; reared up on the drum, it hangs below its face
        if (up > 0.5) lionUp(g, lx, ly, ph); else lionBody(g, lx - 9, ly, ph);
        g.blit(LION[blink ? 1 : 0], Math.round(lx - 9.5), Math.round(ly));
      }
    }
  },
};
