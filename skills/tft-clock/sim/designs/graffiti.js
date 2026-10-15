// Graffiti: the brick abutment under a railway bridge (a riveted lattice
// girder across the top, the kerb below), and the time is the crew's piece
// on it: four semi-wildstyle letters drawn for this grid (graffiti-glyphs.js:
// fat bubble-box strokes leaning forward, arrows on the 2, 5 and 7), each
// sprayed in layers: a three-band fade with spray-grain seams, white
// highlight dashes, a near-black outline, a flat 3D block offset down-right
// and a light cutback border, on the crew's own backdrop cloud.
//
// The time is alive every second. The piece bounces to a beat: once a
// second every letter dips, rebounds and settles (squash on the dip), the
// beat rolling left to right, with a lighter bounce on the off-beat; the
// letters rock alternately left and right like a crowd nodding (the
// "bounce" style, made to move). The seams of the fill fade ride a slow wave
// that rolls through the whole piece. On every beat the crew's can hisses
// on one letter in turn: a puff of grain and a shine star. Drips creep down
// from the letters on the beat over the minutes after they were painted.
// Around them, calmer: bubbles rise through the backdrop, pigeons on the
// girder bob their heads to the same beat. Every 15 s a flourish: a bigger
// bounce wave, all four stars pop in a row, and a windscreen glint (by
// night headlights) sweeps the wall.
//
// Minute turn, the way a crew reworks a letter: from about :57 the buff
// roller rolls backdrop paint up and down in 6 px strokes over every letter
// that is about to change (a thin first coat: the old digit ghosts through,
// still readable); at :59 the second coat covers all of them at once,
// evenly. After :00 a can per new letter zig-zags over it and the letter
// builds up as spray does, grain by grain over its whole area (fixed pixel
// rank, so never a partial shape): fill, then outline, then block and
// border, then its shine star pops and it starts to bounce.
// Hour: a train rumbles over the bridge. Its whole-car piece flashes past
// through the lattice, grit (by night sparks) rains from the girder, the
// piece shudders, the pigeons scatter across the wall and glide back later;
// and the crew re-sprays the whole piece in the hour's new colourway, a can
// riding a grainy colour front across it, each letter flashing its star as
// it is reached. The changed letters arrive already in the new paint.
//
// Palette: shaded old brick and dark green steel, calm and low, so the paint
// is the loudest thing; per hour one of six crew colourways (sunset,
// ice, toxic, bubblegum, electric, silver burner): three fill tones, a
// contrasting block, a light cutback, a deep backdrop. Outline near-black,
// shines white. All flat fills and hard pixels; the only textures are the
// medium's own (spray grain at the seams and in the coats, dither). Night:
// the backdrop and wall sink to deep tones, the letters keep their paint,
// and the backlight drops to 55 %.
//
// Cost: one integer pass over the backdrop mask, then each letter's box is
// sampled from its distance field (one bilinear lookup a pixel, a second for
// the 3D block outside the letter), all charged to g.cost.box; sprites and
// rects for the rest. No per-minute caches: every frame is built cold.
// Flash: distance fields 10 x 44 x 52 B = 23 KB, shine masks 23 KB (bytes;
// 2.9 KB as bits), day and night wall 51 KB, backdrop and lattice masks
// 26 KB: ~123 KB. RAM beyond the frame buffer: under 1 KB.
import { clockFields, hash, sin, cos, clamp } from '../js/kit.js';
import { STAR, DRIPS, SH, EXT } from './graffiti-glyphs.js';
import {
  W, H, GIRDER, KERB, WALL_DAY, WALL_NIGHT, GAP, CLOUD, CLOUD_BOT, RANK,
  WAY565 as WAY565_D, WAYC as WAYC_D, WAY565_N, WAYC_N, wayOf, BAYER, can, roller, star, mist,
} from './graffiti-wall.js';
import { paintDigit, drip, dot } from './graffiti-piece.js';
import { pigeons } from './graffiti-pigeons.js';

const N = W * H, PI = Math.PI, TAU = 2 * Math.PI;
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const ifloor = (v) => { const t = v | 0; return t > v ? t - 1 : t; };
const frac = (x) => x - ifloor(x);

// ------------------------------------------------------------ the layout (rest poses)
const SLOTS = [
  { ox: 13, yb: 50, sc: 1 }, { ox: 45, yb: 54, sc: 1 },
  { ox: 98, yb: 53, sc: 0.88 }, { ox: 126, yb: 57, sc: 0.88 },
];
const COLON = [[85.5, 33], [83.5, 46]];
/** Per slot, the box any of its digits can ink at rest (with room for the bounce). */
const REST = SLOTS.map((S) => [
  Math.max(0, Math.floor(S.ox + EXT[0] * S.sc - 2)), Math.max(GIRDER, Math.floor(S.yb - (SH - EXT[2]) * S.sc - 3)),
  Math.min(W - 1, Math.ceil(S.ox + EXT[1] * S.sc + 2)), Math.min(KERB - 1, Math.ceil(S.yb + (EXT[3] - SH) * S.sc + 2)),
]);

// ------------------------------------------------------------ the beat
// One bounce a second: a dip, a rebound, a settle (a damped sine, table of 65).
const BEAT = new Float32Array(65);
{
  let mx = 0;
  for (let i = 0; i <= 64; i++) { const p = i / 64; BEAT[i] = Math.exp(-4.6 * p) * Math.sin(TAU * 1.8 * p); mx = Math.max(mx, BEAT[i]); }
  for (let i = 0; i <= 64; i++) BEAT[i] /= mx;
}
const beat = (p) => { const f = p * 64, i = f | 0; return i >= 64 ? BEAT[64] : BEAT[i] + (BEAT[i + 1] - BEAT[i]) * (f - i); };
const FLOURISH = (k) => k === 15 || k === 30 || k === 45;

/** The pose of slot i at second s of the minute, with amplitude amp (0 = still). */
function pose(i, s, amp, rumble) {
  const S = SLOTS[i];
  const big = FLOURISH(ifloor(s)) || FLOURISH(ifloor(s - 0.4));
  const t = s - (big ? 0.11 : 0.06) * i, k = ifloor(t), p = t - k;
  const A = (FLOURISH(k) ? 4.4 : 2.8) * amp;
  const dy = A * beat(p) + 0.8 * amp * (p >= 0.5 ? beat(p - 0.5) : 0) + rumble;
  const Lk = (k + i) & 1 ? 1 : -1, sw = amp * (-Lk + 2 * Lk * sm(p / 0.3));
  return { ox: S.ox, yb: S.yb, sc: S.sc, sx: 1 + 0.012 * dy, sy: 1 - 0.03 * dy, lean: 2.3 * sw, dx: 0.9 * sw, dy };
}

/** Screen point of glyph point (u, v) under pose P. */
const at = (P, u, v) => [P.ox + P.dx + u * P.sc * P.sx + (P.lean * (SH - v)) / SH, P.yb + P.dy - (SH - v) * P.sc * P.sy];

// ------------------------------------------------------------ buff patches
// Every change of a slot is an event (the minute it happened); its buff patch
// is a run of 6 px roller strokes over the slot's rest box, ragged at the ends.
const STROKE = 6, ROLL = 0.35, DRIP_ROOM = 14;
function strokes(i, ev) {
  const [x0, y0, x1, y1] = REST[i], out = [];
  const bot = Math.min(KERB, y1 + DRIP_ROOM);
  for (let x = x0; x <= x1; x += STROKE) {
    const h = hash(ev, x, 21), top = y0 + (h % 3) - 1;
    out.push([x, top, Math.min(STROKE, x1 + 1 - x), bot - top - ((h >>> 4) % 4)]);
  }
  return out;
}
/** The minute key of the last change of slot i at or before minute key mk (fields f). */
function eventOf(i, f, mk) {
  if (i === 3) return mk;
  if (i === 2) return mk - (f.m % 10);
  if (i === 1) return mk - f.m;
  return mk - ((f.h >= 20 ? f.h - 20 : f.h % 10) * 60 + f.m);
}
/**
 * Roll backdrop paint over a box (only where the backdrop is, never over a
 * bubble): k32 = 32 opaque, less is a thin coat the old paint ghosts through.
 */
function buff(g, x, y, w, h, wi, k32, night) {
  const buf = g.buf, cD = WAY565_D[wi][7], cN = WAY565_N[wi][7], bD = WAY565_D[wi][8], bN = WAY565_N[wi][8], ik = 32 - k32;
  const xa = Math.max(0, x), xb = Math.min(W, x + w), ya = Math.max(0, y), yb = Math.min(H, y + h);
  for (let yy = ya; yy < yb; yy++)
    for (let xx = xa, i = yy * W + xa; xx < xb; xx++, i++) {
      if (CLOUD[i] !== 1) continue;
      const d = buf[i];
      if (d === bD || d === bN) continue;                     // bubbles float over the fresh coat
      const c = night > BAYER[((yy & 3) << 2) | (xx & 3)] ? cN : cD;
      if (k32 >= 32 || d === c) { buf[i] = c; continue; }
      buf[i] = ((((d >> 11) * ik + (c >> 11) * k32) >> 5) << 11) | (((((d >> 5) & 63) * ik + ((c >> 5) & 63) * k32) >> 5) << 5) | (((d & 31) * ik + (c & 31) * k32) >> 5);
    }
  const n = Math.max(0, xb - xa) * Math.max(0, yb - ya);
  g.cost.px += n; g.cost.box += n * 9;
}

/**
 * The backdrop cloud, front-aware (columns left of frontX are already in the
 * new paint, way index wB; the rest in wA) and night-aware (over the fade
 * minute day and night ground dissolve by an ordered dither).
 */
function backdrop(g, wA, wB, frontX, night) {
  const buf = g.buf, A = WAY565_D[wA], B = WAY565_D[wB], An = WAY565_N[wA], Bn = WAY565_N[wB];
  let n = 0;
  for (let y = GIRDER; y < KERB; y++) {
    const rk = (y & 15) << 4, by = (y & 3) << 2;
    for (let x = 0, i = y * W; x < W; x++, i++) {
      const m = CLOUD[i];
      if (!m) continue;
      n++;
      const nb = x < frontX - 3 || (x < frontX && RANK[rk | (x & 15)] < (frontX - x) * 85);
      const P6 = night > BAYER[by | (x & 3)] ? (nb ? Bn : An) : nb ? B : A;
      buf[i] = m === 1 ? P6[7] : m === 2 ? P6[3] : P6[5];
    }
  }
  g.cost.px += n; g.cost.box += W * (KERB - GIRDER) + n * 4;
}

/** Bubbles rising slowly through the backdrop (closed form in the time of day). */
const BUBBLES = Array.from({ length: 12 }, (_, j) => {
  const h = hash(j, 404);
  return { x: 6 + (h % 148), r: 2 + ((h >>> 8) % 3), v: 3 + ((h >>> 12) % 4), y0: (h >>> 16) % 80, per: 3 + (j % 3), ph: j };
});
function bubbles(g, tt, wA, wB, frontX, night) {
  const buf = g.buf;
  let n = 0;
  for (const b of BUBBLES) {
    const y = 80 - ((tt * b.v + b.y0) % 80), x = b.x + 2 * sin((TAU * tt) / b.per + b.ph);
    const wi = x < frontX ? wB : wA, cD = WAY565_D[wi][8], cN = WAY565_N[wi][8], r = b.r, r2 = r * r + 0.5;
    const x0 = Math.max(0, Math.round(x - r)), x1 = Math.min(W - 1, Math.round(x + r)), y0 = Math.max(GIRDER, Math.round(y - r)), y1 = Math.min(KERB - 1, Math.round(y + r));
    for (let yy = y0; yy <= y1; yy++)
      for (let xx = x0; xx <= x1; xx++) {
        const dx = xx + 0.5 - x, dy = yy + 0.5 - y, i = yy * W + xx;
        n++;
        if (dx * dx + dy * dy < r2 && CLOUD[i] === 1) buf[i] = night > BAYER[((yy & 3) << 2) | (xx & 3)] ? cN : cD;
      }
  }
  g.cost.box += n * 5; g.cost.px += n;
}

// ------------------------------------------------------------ the train (the hour)
const TRAIN_V = 120, CAR = 100, CARS = 3, TRAIN_L = CAR * CARS;
const BODY = 0xb4bac4, WIN_DAY = 0x28323c, WIN_NIGHT = 0xffd878;

// ------------------------------------------------------------ the frame
const WAVE = new Float32Array(W);
const HISS = [0, 1, 2, 3, 2, 1];
const ORDER = [0, 1, 2, 3];

export default {
  name: 'Graffiti',
  blurb: 'A graffiti piece under a railway bridge: the numerals bounce to the beat; each minute the crew rolls out a letter and sprays the next; at the hour a train rumbles over and the piece is re-sprayed in new colours.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey, night = ctx.night;
    ctx.lcd.backlight(1 - 0.45 * night);
    const date = ctx.date;
    const prev = clockFields(new Date(date.getTime() - 60000)), next = clockFields(new Date(date.getTime() + 60000));
    const cur = f.hh + f.mm, pv = prev.hh + prev.mm, nx = next.hh + next.mm;

    // ---- the wall (day and night dissolve by an ordered dither over the fade minute)
    const buf = g.buf;
    if (night <= 0) buf.set(WALL_DAY);
    else if (night >= 1) buf.set(WALL_NIGHT);
    else for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) buf[i] = night > BAYER[((y & 3) << 2) | (x & 3)] ? WALL_NIGHT[i] : WALL_DAY[i];
    g.cost.px += N; g.cost.box += night > 0 && night < 1 ? N * 2 : 0;
    const NT = night > 0.5;
    const WAY565 = NT ? WAY565_N : WAY565_D, WAYC = NT ? WAYC_N : WAYC_D;

    // ---- this minute's jobs
    const outSet = [false, false, false, false], inSet = [false, false, false, false];
    for (let i = 0; i < 4; i++) { if (cur[i] !== nx[i]) outSet[i] = true; if (cur[i] !== pv[i]) inSet[i] = true; }
    const evNext = mk + 1, outStrokes = [];
    for (let i = 0; i < 4; i++) if (outSet[i]) for (const st of strokes(i, evNext)) outStrokes.push(st);
    const tB = 59.0 - outStrokes.length * ROLL;              // the roller starts so it is done by :59
    const buffing = s >= tB - 0.6, coat2 = sm((s - 59.0) / 0.7);
    const spraying = s < 2.6;

    // ---- the hour: new paint, carried across the piece by a re-spray front
    const hourIn = prev.h !== f.h, hourOut = next.h !== f.h;
    const wNew = WAY565[wayOf(f.h)], wOld = WAY565[wayOf(prev.h)];
    const fronting = hourIn && s < 4;
    let frontX = -1, palOld = wNew;
    if (fronting) { palOld = wOld; frontX = s < 0.8 ? -12 : -12 + 184 * sm((s - 0.8) / 2.6); }
    const T = hourOut && s > 56 ? s - 60 : hourIn && s < 5 ? s : null;      // seconds from the hour
    const head = T === null ? -1e9 : TRAIN_V * (T + 1.6);
    const over = T === null ? 0 : sm(head / 40) * (1 - sm((head - TRAIN_L - 140) / 40));
    const rumble = over > 0.05 ? over * (ifloor(s * 13) & 1) : 0;

    // ---- the fill fade: a slow wave rolls through the band edges
    for (let x = 0; x < W; x++) WAVE[x] = 1.8 * sin(0.17 * x - (TAU * 22 / 60) * s);   // 22 rolls a minute: seamless at :00

    // ---- the backdrop and its bubbles
    const evs = [eventOf(0, f, mk), eventOf(1, f, mk), eventOf(2, f, mk), eventOf(3, f, mk)];
    const wiNew = wayOf(f.h), wiOld = fronting ? wayOf(prev.h) : wiNew;
    backdrop(g, wiOld, wiNew, frontX, night);
    bubbles(g, f.h * 3600 + f.m * 60 + s, wiOld, wiNew, frontX, night);

    // ---- poses and coats
    const P = [], dens = [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]];
    for (let i = 0; i < 4; i++) {
      let amp = 1;
      if (outSet[i] && buffing) {
        amp = 1 - sm((s - (tB - 0.6)) / 0.6);
        const q = 1 - coat2; dens[i] = [q, q, q];
      } else if (inSet[i] && spraying) {
        amp = sm((s - 1.6) / 1.0);
        dens[i] = [1 - (1 - sm(s / 0.9)) ** 2, sm((s - 0.35) / 0.8), sm((s - 0.8) / 0.7)];
      }
      P.push(pose(i, s, amp, rumble));
    }
    // slots at work are painted first, so the roller's strokes lie over them only
    const active = (i) => (buffing && outSet[i]) || (spraying && inSet[i]);
    let n = 0;
    for (let i = 0; i < 4; i++) if (active(i)) ORDER[n++] = i;
    const nAct = n;
    for (let i = 0; i < 4; i++) if (!active(i)) ORDER[n++] = i;

    const drawSlot = (i) => {
      const d = +cur[i], [dF, dO, dB] = dens[i];
      if (dF <= 0 && dO <= 0 && dB <= 0) return;
      const fresh = inSet[i] && hourIn;
      paintDigit(g, d, P[i], fresh ? wNew : palOld, wNew, fresh ? -1 : frontX, WAVE, dF, dO, dB);
      // drips creep down on the beat over the minutes after the piece is done
      const age = (mk - evs[i]) * 60 + s - 1.6;
      if (age <= 0 || dF < 1) return;
      const list = DRIPS[d], newPaint = fresh || !fronting || P[i].ox + 8 < frontX;
      const dc = WAYC[wayOf(newPaint ? f.h : prev.h)][2];
      const a = ifloor(age) + sm(frac(age) / 0.4);
      for (let j = 0, kept = 0; j < list.length && kept < 2; j++) {
        const h = hash(evs[i], i * 8 + j, 33);
        if (h % 3 === 0) continue;
        kept++;
        const Lmax = 4 + ((h >>> 3) % 9);
        const [x, y] = at(P[i], list[j][0], list[j][1] - 0.6);
        drip(g, x, y, Math.min(Lmax * Math.min(1, Math.sqrt(a / 50)), CLOUD_BOT[clamp(Math.round(x), 0, W - 1)] - 1 - y), dc);
      }
    };

    for (let k = 0; k < nAct; k++) drawSlot(ORDER[k]);

    // ---- the buff: a roller lays the new patch over the leaving digits (a thin
    // first coat the old digit ghosts through, then the second coat covers it evenly)
    let rollerAt = null;
    if (outStrokes.length && s >= tB) {
      const k32 = Math.round(32 * (0.58 + 0.42 * coat2));
      for (let j = 0; j < outStrokes.length; j++) {
        const [x, y, w, h] = outStrokes[j];
        const q = clamp((s - tB - j * ROLL) / ROLL, 0, 1);
        if (q <= 0) break;
        const hh = Math.round(h * q), up = (j & 1) === 0, yy = up ? y + h - hh : y;
        buff(g, x, yy, w, hh, wayOf(f.h), k32, night);
        if (q < 1) rollerAt = [x + w / 2, up ? yy : yy + hh];
      }
      if (!rollerAt && s < 59.8) {
        const last = outStrokes[outStrokes.length - 1];
        rollerAt = [last[0] + 3, last[1] + 4 + 80 * sm((s - 59.0) / 0.8)];
      }
    }

    for (let k = nAct; k < 4; k++) drawSlot(ORDER[k]);

    // ---- the colon: two fat dots nodding on the off-beat
    for (let j = 0; j < 2; j++) {
      const [cx, cy] = COLON[j];
      const ww = fronting && cx >= frontX ? WAYC[wayOf(prev.h)] : WAYC[wayOf(f.h)];
      dot(g, cx, cy + 1.6 * beat(frac(s + 0.5 + j * 0.25)) + rumble, ww);
    }

    if (rollerAt) roller(g, rollerAt[0], rollerAt[1], WAYC[wayOf(f.h)][7]);

    const wc = WAYC[wayOf(f.h)], w5 = WAY565[wayOf(f.h)];

    // ---- the crew's can: a hiss on every beat, a highlight star where it sprays
    {
      const hide = Math.max(sm((s - (tB - 1.4)) / 0.7), 1 - sm((s - 2.0) / 0.7));
      if (hide < 1) {
        const k = ifloor(s), p = s - k;
        // it works the letters back and forth (0 1 2 3 2 1 ...), so no hop is longer than one letter
        const tgt = (kk) => { const i = HISS[((kk % 6) + 6) % 6], St = STAR[+cur[i]]; return at(P[i], St[0] + 1.5, St[1] + 1.5); };
        const a = tgt(k), b = tgt(k + 1), m = sm((p - 0.3) / 0.68);
        const cx = a[0] + (b[0] - a[0]) * m, cy = a[1] + (b[1] - a[1]) * m - 5 * sin(PI * m) - 50 * hide;
        can(g, cx - 11.5, cy - 11.5, 0.72, 0.69, wc[1], wc[0]);
        if (p < 0.3 && hide < 0.3) {
          mist(g, a[0] + 1, a[1] + 1, 2 + 6 * p, 26, 0.9 - 2.4 * p, w5[6], ifloor(s * 30));
          star(g, a[0] + 2, a[1] + 2, 4 * sin(PI * (p / 0.3)), 0xffffff);
        }
      }
      // the flourish: every star of the piece pops in a wave
      const k = ifloor(s);
      if (FLOURISH(k)) for (let i = 0; i < 4; i++) {
        const q = (s - k - 0.15 - 0.11 * i) / 0.4;
        if (q > 0 && q < 1) { const St = STAR[+cur[i]], [x, y] = at(P[i], St[0] + 1.5, St[1] + 1.5); star(g, x + 2, y + 2, 5 * sin(PI * q), 0xffffff); }
      }
    }

    // ---- spray-in cans: one per new digit, zig-zagging over it while the coats build
    const canSet = s >= 59.3 ? outSet : s < 2.0 ? inSet : null;
    if (canSet) for (let i = 0; i < 4; i++) {
      if (!canSet[i]) continue;
      const [x0, y0, x1, y1] = REST[i];
      const e = s >= 59.3 ? sm((s - 59.3) / 0.7) : 1 - sm((s - 1.5) / 0.5);
      const cx = (x0 + x1) / 2 + 2 + 9 * sin(TAU * 1.3 * s + i), cy = y0 + 4 + 3 * (0.5 - 0.5 * cos(TAU * 0.6 * s + i));
      const yy = cy - (1 - e) * 40;
      can(g, cx - 11.5, yy - 11.5, 0.72, 0.69, wc[1], wc[0]);
      if (s < 1.5) mist(g, cx + 1, yy + 1, 5, 40, 0.8, w5[s < 0.9 ? 1 : 3], ifloor(s * 30) + i * 97);
    }

    // ---- the hour's re-spray: a can rides the colour front across the piece,
    // and every letter it passes flashes its star in the new paint
    if (frontX > -12 && frontX < 172 && hourIn) {
      for (let i = 0; i < 4; i++) {
        const St = STAR[+cur[i]], [x, y] = at(P[i], St[0] + 1.5, St[1] + 1.5), q = (frontX - x) / 24;
        if (q > 0 && q < 1) star(g, x + 2, y + 2, 5 * sin(PI * q), 0xffffff);
      }
      const cy = 18 + 34 * (0.5 - 0.5 * cos(TAU * 1.6 * s));
      can(g, frontX - 9, cy - 11.5, 0.72, 0.69, wc[1], wc[0]);
      mist(g, frontX + 2, cy + 2, 6, 44, 0.85, w5[1], ifloor(s * 30) + 7);
    }

    // ---- the train overhead: its whole-car piece flashes through the lattice,
    // grit (by day) or sparks (by night) rain from the girder, the piece rumbles
    if (over > 0) {
      const way = WAY565[wayOf(T < 0 ? next.h : f.h)];
      const body = to565c(BODY), win = to565c(NT ? WIN_NIGHT : WIN_DAY);
      let cnt = 0;
      for (let y = 2; y < GIRDER - 2; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (!GAP[i]) continue;
          const q = head - x;
          if (q < 0 || q >= TRAIN_L) continue;
          const car = (q / CAR) | 0, cq = q - car * CAR;
          cnt++;
          if (cq < 3 || cq > CAR - 3) continue;            // the coupling: sky between cars
          let c;
          if (y < 4) c = (cq % 14) < 9 ? win : body;
          else {
            const L = ((cq + car * 5) / 13) | 0, lx = (cq + car * 5) % 13;
            c = lx < 1 ? way[3] : y === 7 ? way[4] : way[(L + y) % 3];
          }
          buf[i] = c;
        }
      g.cost.box += cnt * 6; g.cost.px += cnt;
      // falling grit / sparks, each from under the train at its own moment
      const spark = NT ? 0xffd070 : 0x2a2420, tail = NT ? 0xb05a20 : 0x3a302a;
      for (let j = 0; j < 44; j++) {
        const tj = -1.4 + j * 0.1, dt = T - tj;
        if (dt < 0 || dt > 1.4) continue;
        const h = hash(j, 77);
        const x0 = TRAIN_V * (tj + 1.6) - 20 - (h % 240);
        if (x0 < 0 || x0 >= W) continue;
        const x = x0 + ((h >>> 8) % 9 - 4) * dt, y = GIRDER + 1 + 70 * dt * dt;
        if (y >= KERB) continue;
        g.fillRect(Math.round(x), Math.round(y), 1, 1, spark);
        if (NT) g.fillRect(Math.round(x), Math.round(y) - 2, 1, 2, tail);
      }
    }

    // ---- the pigeons on the girder (scared off by the hour's train, back a few seconds later)
    {
      const PT = hourOut && s > 56 ? s - 60 : hourIn && s < 10 ? s : null, hk = Math.floor(mk / 60);
      pigeons(g, s, PT, PT !== null && PT < 0 ? hk : hk - 1, PT !== null && PT < 0 ? hk + 1 : hk, NT);
    }

    // ---- the flourish's light: a passing windscreen glint (day) or headlights (night) sweep the wall
    {
      const k = ifloor(s);
      if (FLOURISH(k)) {
        const q = (s - k) / 1.3;
        if (q < 1) {
          const x = -40 + 240 * q;
          g.fillPolygon([[x, 0], [x + 16, 0], [x - 14, H], [x - 30, H]], NT ? 0xffd890 : 0xfff4dc, { a: (NT ? 0.22 : 0.14) * sin(PI * q) });
        }
      }
    }
  },
};

const C565 = new Map();
function to565c(c) {
  let v = C565.get(c);
  if (v === undefined) { v = (((c >> 19) & 31) << 11) | (((c >> 10) & 63) << 5) | ((c >> 3) & 31); C565.set(c, v); }
  return v;
}
