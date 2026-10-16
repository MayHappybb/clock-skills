// Lava Lamp: four rocket lava lamps glow on a shelf in a dark room, and the
// time is their wax. Each numeral is one body of hot wax hanging in its
// lamp's liquid, drawn for the material (lavalamp-glyphs.js): fat strokes
// that sag (thin at the shoulders, heavy at the foot, pear-shaped like the
// glass), wax fillets in every joint, a drip bulb on every open end.
//
// THE TIME IS ALIVE. The wax is a field (a metaball-style potential) so
// whatever touches it merges, necks and pinches off like real wax:
// - every second each numeral takes a beat, staggered left to right: a
//   stretch of anticipation, a squash with a swell, a rebound, and settle;
// - all the time it floats (a slow bob), and ripples run up its strokes;
// - on each beat one lamp buds a blob off the top of its numeral, which
//   rises to the cap, flattens there and sinks back to rejoin, while another
//   lamp's pool sends a blob up to kiss the numeral's foot and fall back;
// - every 15 s a surge runs along the shelf: each heater flares, a light
//   sweeps up the glass, a plume leaves the pool and is swallowed by the
//   numeral, which swells and lifts and sends a big blob up to the cap.
// MINUTE TURN (about 3.6 s, :58 to :01.6): the changing numeral gathers
// itself (a slow squash), then thins evenly until, like any liquid thread, it
// breaks into a string of beads along its own strokes (still reading as the
// old digit); the string contracts as a whole into one floating blob, outer
// beads lagging the inner ones, while the blob drifts up (:00); the blob
// wobbles, then swells out into a string of beads in the new numeral's shape
// and sinks back, and the beads thicken and fuse into it with a small
// overshoot. In between it is only ever a smaller copy of a digit or a blob.
// Changing digits always run on the same schedule, midnight included.
// HOUR: the same turn, plus the lamps heat up: the heaters flare, a heat
// front climbs each glass (staggered) and recolours its wax and liquid to
// the next hour's pair, the room's coloured light follows, then a big plume
// surges up every lamp.
// NIGHT (23-07): darker liquids and a near-black room, so the lamps become
// the night light; backlight down to half.
//
// Colour: classic lamp pairs (lavalamp-room.js), a bright wax in a deep
// liquid of the opposite temperature, four different pairs on the shelf.
// The wax is the strongest contrast, the liquid a calm coloured ground with
// the heater's light rising through it, the room darker still.
//
// Cost: per glass pixel a potential is summed (a bilinear byte lookup of the
// numeral's distance map, the pool, a few blobs over their own small boxes)
// and looked up in a colour table: integer work, billed as box work below
// (esp32c3 ~2.9 ms a frame on average). The room (wall with the lamps' light,
// shelf, metal, glass rims) is drawn into its own 25.6 KB canvas once per hour
// palette and night step, plus a "hot" variant that a flaring heater
// dissolves in round its lamp; each build is ~2.9 ms on esp32c3 and is charged
// to the frame that does it (worst frame ~13.4 ms). RAM: up to four room
// canvases at the hour (102 KB), one 32 x 57 potential box reused per lamp
// (3.6 KB as uint16). Flash: colour tables 64 KB, glyph maps 14 KB, beads,
// spans and the potential table ~2 KB.

import { clockFields, sin, cos, hash } from '../js/kit.js';
import { MAPS, BEADS, ANCH, GW, GH, OX, OY } from './lavalamp-glyphs.js';
import { W, H, CX, GT, GB, LW, LH, NBAND, NLEV, SPAN0, SPAN1, LUT, lutBase, PHI, pairOf, buildRoom } from './lavalamp-room.js';

const TAU = Math.PI * 2;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const pr = (v, a, b) => (v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a));
const io = (x) => { x = x <= 0 ? 0 : x >= 1 ? 1 : x; return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2; };
const outC = (x) => { x = x <= 0 ? 0 : x >= 1 ? 1 : x; return 1 - (1 - x) ** 3; };
/** 0 -> 1 over [a, b], held, 1 -> 0 over [c, d], smooth. */
const bump = (v, a, b, c, d) => sm(pr(v, a, b)) * (1 - sm(pr(v, c, d)));

const GLY_Y = 16;                 // screen row of the glyph box's top
const PIV = GLY_Y + 18;           // squash pivot: the numeral's middle
const MAP_Y = GLY_Y - OY;         // screen row of the map's top
const CAP_Y = 10.5;               // where risen blobs come to rest under the cap
const POOL_Y = 62.4;            // the pool's surface at the glass wall (it domes ~2.3 px higher in the middle)
const SURGES = [14, 29, 44];
const BLOB_A = 407;               // a blob's peak potential: iso radius = R / 2.2
const MOTHER = 10, R_M = 3.2;      // the turn's floating blob: ten beads' worth, each of radius R_M

// ------------------------------------------------------------ schedule

function digitsOf(f) { return [f.hh[0], f.hh[1], f.mm[0], f.mm[1]].map(Number); }

/** Can lamp i run a 4 s bud/kiss cycle that starts at c? */
function free(c, i, J) {
  if (c < 0 || c + 4 > 60) return false;
  if (J.chgIn[i] && c < 2.0) return false;
  if (J.chgOut[i] && c + 4 > 57.6) return false;
  if (J.hourIn && c < 6.8) return false;
  for (const S of SURGES) { const a = S + 0.3 * i; if (c < a + 4.1 && c + 4 > a) return false; }
  return true;
}

/** A point of the numeral (glyph coordinates) on the screen, under the lamp's current transform. */
function place(i, gx, gy, T) {
  return [CX[i] + T.sway + (gx - 12) * T.sx, PIV + (GLY_Y + gy - PIV) * T.sy + T.bob];
}

/** Everything lamp i does at second s: the numeral's transform and thickness, and the blobs. */
function lampState(i, s, t, J) {
  const T = { d: J.cur[i], draw: true, off: 0, sx: 1, sy: 1, bob: 0, sway: 0, wave: 1, flare: 0, sweep: -99, poolUp: 0, blobs: [] };
  // ---- the turn's envelope (does the beat keep going?)
  let tau = 99, turning = false;
  if (J.chgOut[i] && s > 55) { tau = s - 60; turning = true; }
  else if (J.chgIn[i] && s < 5) { tau = s; turning = true; }
  const calm = turning ? 1 - bump(tau, -2.3, -1.9, 1.2, 1.9) : 1;

  // ---- the beat: anticipation, squash with a swell, rebound, settle
  const bt = s - 0.07 * i, b = bt - Math.floor(bt);
  const kick = sin(TAU * 2 * b) * Math.exp(-4 * b);
  const pre = b > 0.8 ? sin(Math.PI * (b - 0.8) / 0.2) ** 2 : 0;
  T.sy = 1 - calm * (0.095 * kick - 0.026 * pre);
  T.off = calm * 0.45 * Math.max(0, kick);
  T.bob = 1.3 * sin(TAU * t / 7.3 + i * 1.9);
  T.wave = 0.6 + 0.4 * calm;
  T.sway = 0.85 * sin(TAU * t / 3.3 + i * 2.6);

  // ---- surges (every 15 s, and the big one after the hour)
  const starts = SURGES.map((S) => [S + 0.3 * i, false]);
  if (J.hourIn) starts.push([1.7 + 0.3 * i, true]);
  for (const [a, big] of starts) {
    const u = s - a;
    if (u < 0 || u > 4.2) continue;
    surge(i, u, big, T);
  }
  if (J.hourIn && s < 3.5) T.flare = Math.max(T.flare, 2 * bump(s, -1, 0, 2.2, 3.5));
  if (J.hourOut && s > 57) T.flare = Math.max(T.flare, 2 * sm(pr(s, 57.8, 59.6)));

  // ---- bud and kiss cycles, on the beat, a lamp apart
  const cb = i + 4 * Math.floor((s - i) / 4);
  if (free(cb, i, J)) bud(i, s - cb, T, 2.4, 1);
  const ck = ((i + 2) % 4) + 4 * Math.floor((s - ((i + 2) % 4)) / 4);
  if (free(ck, i, J)) kiss(i, s - ck, T);

  if (turning) turn(i, tau, T, J);
  T.sx = 1 / T.sy;
  return T;
}

/** A blob budding off the numeral's top, rising to the cap, resting and sinking back in. */
function bud(i, u, T, rb, big) {
  const d = T.d, [gx, gy] = ANCH[d].top;
  const [ax, ay] = place(i, gx, gy, T);
  const sway = 1.2 * sin(u * 1.7 + i);
  let x = ax, y, a = 1, kx = 1, ky = 1;
  const yIn = ay + rb * 0.9, yOut = ay - rb * 0.95, yCap = CAP_Y + (big - 1) * 0.6;
  if (u < 0.8) { const e = sm(u / 0.8); y = yIn + (yOut - yIn) * e; a = sm(u / 0.5); }
  else if (u < 2.0) { const e = io((u - 0.8) / 1.2); y = yOut + (yCap - yOut) * e; x = ax + sway * e; }
  else if (u < 2.7) { y = yCap; x = ax + sway; const q = bump(u, 2.0, 2.3, 2.4, 2.7); kx = 1 + 0.22 * q; ky = 1 - 0.18 * q; }
  else if (u < 3.6) { const e = io((u - 2.7) / 0.9); y = yCap + (yOut - yCap) * e; x = ax + sway * (1 - e); }
  else { const e = sm((u - 3.6) / 0.4); y = yOut + (yIn - yOut) * e; a = 1 - sm((u - 3.75) / 0.25); }
  T.blobs.push([x, y, rb * 2.2 * kx, rb * 2.2 * ky, a]);
}

/** A blob leaving the pool, kissing the numeral's foot, and falling back. */
function kiss(i, u, T) {
  const d = T.d, [gx, gy] = ANCH[d].bot;
  const [ax, ay] = place(i, gx, gy, T);
  const rb = 2.4, yIn = POOL_Y + 3, yUp = ay + rb * 0.75;
  let y, a = 1, ky = 1;
  if (u < 0.5) { y = yIn; a = sm(u / 0.5); }
  else if (u < 1.6) y = yIn + (yUp - yIn) * io((u - 0.5) / 1.1);
  else if (u < 2.3) { y = yUp; ky = 1 - 0.12 * bump(u, 1.6, 1.8, 2.0, 2.3); }
  else if (u < 3.4) y = yUp + (yIn - yUp) * io((u - 2.3) / 1.1);
  else { y = yIn; a = 1 - sm((u - 3.4) / 0.6); }
  T.blobs.push([ax, y, rb * 2.2 / ky, rb * 2.2 * ky, a]);
}

/** The surge: heater flare, light sweep, a plume swallowed by the numeral, a big bud to the cap. */
function surge(i, u, big, T) {
  T.flare = Math.max(T.flare, 2 * bump(u, 0, 0.5, 2.4, 3.6));
  if (u > 0.1 && u < 1.9) T.sweep = GB + 2 - (GB - GT + 6) * io((u - 0.1) / 1.8);
  T.poolUp = Math.max(T.poolUp, 1.4 * bump(u, 0, 0.4, 0.8, 1.4));
  const sw = bump(u, 1.1, 1.7, 2.5, 3.5);
  T.off += (big ? 0.75 : 0.55) * sw;
  T.bob -= 2.2 * sw;
  T.sy *= 1 + 0.035 * sw;
  // the plume, from inside the pool up into the foot
  const d = T.d, [gx, gy] = ANCH[d].bot;
  const [ax, ay] = place(i, gx, gy, T);
  const rp = big ? 3.9 : 3.3;
  if (u > 0.15 && u < 1.9) {
    const y = POOL_Y + 3.5 + (ay - 1.5 - POOL_Y - 3.5) * io(pr(u, 0.2, 1.5));
    const a = sm(pr(u, 0.15, 0.55)) * (1 - sm(pr(u, 1.35, 1.9)));
    const st = 1 + 0.25 * bump(u, 0.5, 0.8, 1.0, 1.4);       // stretched while it climbs
    T.blobs.push([ax, y, rp * 2.2 / Math.sqrt(st), rp * 2.2 * st, a]);
  }
  if (u > 1.5 && u < 4.2) bud(i, (u - 1.5) * (4 / 2.7), T, big ? 3.0 : 2.7, big ? 1.6 : 1.3);
}

/** The minute turn for a changing numeral, tau seconds from the turn (negative before it). */
function turn(i, tau, T, J) {
  const dOld = tau < 0 ? J.cur[i] : J.prv[i], dNew = tau < 0 ? J.nxt[i] : J.cur[i];
  // anticipation: gather (squash) and swell
  const ant = bump(tau, -2.0, -1.45, -1.3, -0.85);
  T.sy *= 1 - 0.055 * ant;
  if (tau < 0) {
    T.d = dOld;
    T.off += 0.4 * ant - 6.0 * io(pr(tau, -1.4, -0.72));
    if (tau > -0.72) T.draw = false;
  } else {
    T.d = dNew;
    const up = outC(pr(tau, 0.7, 1.2)), set = sm(pr(tau, 1.2, 1.6));
    T.off += -6.0 + 6.0 * up + 0.5 * up * (1 - set);
    if (tau < 0.7) T.draw = false;
  }
  // the mother blob: rises a little through the turn, sways, wobbles
  const Mx = CX[i] + 0.8 * sin(tau * 2.3 + i), My = 30 - 7 * sm(pr(tau, -0.62, 0.35)) + 4 * sm(pr(tau, 0.25, 0.95));
  const wob = 0.16 * bump(tau, -0.35, -0.1, 0.15, 0.45) * sin(tau * 11);
  const ampIn = sm(pr(tau, -1.5, -0.95)), ampOut = 1 - sm(pr(tau, 0.9, 1.36));
  if (ampIn <= 0 || ampOut <= 0) return;
  // before :00 the old digit's beads gather into it; after, the new digit's beads leave it.
  // At the mother every bead has the same size and a share of the same total, so the blob
  // is the same whichever digit's beads make it: nothing changes at the instant of :00.
  const out = tau >= 0, BB = BEADS[out ? dNew : dOld], N = BB.length, share = MOTHER / N;
  // The digit contracts into the blob (and the new one swells out of it) as a whole, about its
  // own middle, so at every moment it is a smaller copy of itself or a blob, never another digit;
  // its outer beads lag a little behind the inner ones (follow-through), and the whole contraction
  // drifts up with the blob, so the paths are arcs.
  const [cx0, cy0] = place(i, 12, 18, T);
  for (let k = 0; k < N; k++) {
    const r0 = 2.5 + 0.55 * (BB[k][1] / 36);
    const [hx, hy] = place(i, BB[k][0], BB[k][1], T);
    const dx = hx - cx0, dy = hy - cy0, far = Math.min(1, (dx * dx + dy * dy) * (1 / 300));
    const u = out ? 1 - io(pr(tau, 0.02 + 0.1 * (1 - far), 0.68 + 0.1 * (1 - far))) : io(pr(tau, -0.68 + 0.1 * far, -0.16 + 0.1 * far));
    const x = Mx + dx * (1 - u), y = My + (cy0 - My) * (1 - u) * (1 - u) + dy * (1 - u);
    const R = (r0 + (R_M - r0) * u) * 2.2, a = (1 + (share - 1) * u * u * u) * (out ? ampOut : ampIn);
    T.blobs.push([x, y, R * (1 + wob), R * (1 - wob), a]);
  }
}

// ------------------------------------------------------------ rooms (one per hour palette and night)

const ROOMS = new Map();
function roomFor(h, nq, g, hot = 0) {
  const k = (h * 16 + nq) * 2 + hot;
  let r = ROOMS.get(k);
  if (!r) {
    r = buildRoom(h, nq / 12, hot);
    for (const q in r.cost) g.cost[q] += r.cost[q];
    ROOMS.set(k, r);
    if (ROOMS.size > 4) ROOMS.delete(ROOMS.keys().next().value);
  }
  return r.buf;
}
// which lamp lights each wall column (the split is half-way between lamps)
const COL_LAMP = Uint8Array.from({ length: W }, (_, x) => (x < 38 ? 0 : x < 80 ? 1 : x < 122 ? 2 : 3));

// ------------------------------------------------------------ the frame

const ACC = new Float32Array(LW * LH);
const ROWX = new Float32Array(LH);
const POOLY = new Float32Array(LW);

export default {
  name: 'Lava Lamp',
  blurb: 'Four lava lamps on a shelf: the numerals are their wax, which beats, buds and kisses the pool every second, and beads up, floats and re-forms each minute.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, t = ctx.date.getTime() / 1000;
    const nt = ctx.night;
    ctx.lcd.backlight(1 - 0.5 * nt);
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = digitsOf(f), pd = digitsOf(prv), nd = digitsOf(nxt);
    const J = {
      cur, prv: pd, nxt: nd,
      chgIn: cur.map((d, i) => d !== pd[i]), chgOut: cur.map((d, i) => d !== nd[i]),
      hourIn: prv.h !== f.h && s < 8, hourOut: nxt.h !== f.h,
    };
    const buf = g.buf;

    // ---- the lamps' state first: their heaters light the room
    const ST = [0, 1, 2, 3].map((i) => lampState(i, s, t, J));
    const heat = ST.map((T) => T.flare / 2), anyHot = heat.some((v) => v > 0.02);

    // ---- the room: at rest, hot round a flaring lamp, and at the hour the last hour's room dissolving out
    const night = nt >= 0.5 ? 1 : 0, nq = Math.round(nt * 12);
    const roomA = roomFor(f.h, nq, g);
    const roomB = J.hourIn && s < 2.7 ? roomFor(prv.h, nq, g) : null, dis = roomB ? 1 - sm(pr(s, 0.2, 2.6)) : 0;
    const roomH = anyHot ? roomFor(f.h, nq, g, 1) : null, roomBH = anyHot && roomB ? roomFor(prv.h, nq, g, 1) : null;
    if (roomB || roomH) {
      for (let i = 0, y = 0; y < H; y++)
        for (let x = 0; x < W; x++, i++) {
          const th = BAYER[((y & 3) << 2) | (x & 3)];
          const hot = roomH && heat[COL_LAMP[x]] > th;
          buf[i] = roomB && dis > th ? (hot ? roomBH[i] : roomB[i]) : hot ? roomH[i] : roomA[i];
        }
      g.cost.px += W * H; g.cost.box += W * H * 3;
    } else { buf.set(roomA); g.cost.px += W * H; }

    // ---- each lamp
    for (let i = 0; i < 4; i++) {
      const T = ST[i];
      const x0 = CX[i] - 16;
      ACC.fill(0);
      let work = LW * LH;
      // the numeral: its distance map, resampled (bob, squash, ripples), thickened or thinned
      if (T.draw) {
        const map = MAPS[T.d], offB = T.off * 16, isx = 1 / T.sx, isy = 1 / T.sy;
        for (let j = 0; j < LH; j++) ROWX[j] = T.sway + T.wave * (0.75 * sin(0.38 * (GT + j) - 3.1 * t + i * 1.7) + 0.4 * sin(0.17 * (GT + j) + 1.7 * t + i));
        for (let j = 0; j < LH; j++) {
          const fv = (GT + j + 0.5 - PIV - T.bob) * isy + PIV - MAP_Y - 0.5;
          if (fv < 0 || fv >= GH - 1) continue;
          const jv = fv | 0, wv = fv - jv, row = jv * GW;
          // thin or swell in proportion to the local stroke radius (the sag makes the foot thicker),
          // so a digit thins evenly everywhere and its thin shoulders do not vanish first
          const gy = fv + 0.5 - OY, rr = 2.45 + 0.9 * (gy < 0 ? 0 : gy > 36 ? 1 : gy / 36);
          const offR = offB * rr * (1 / 2.9);
          const a = SPAN0[j], bnd = SPAN1[j];
          let fu = (x0 + a + 0.5 - CX[i] - ROWX[j]) * isx + 16 - 0.5;
          for (let k = a; k < bnd; k++, fu += isx) {
            if (fu < 0 || fu >= GW - 1) continue;
            const iu = fu | 0, wu = fu - iu, q = row + iu;
            const top = map[q] + (map[q + 1] - map[q]) * wu, bot = map[q + GW] + (map[q + GW + 1] - map[q + GW]) * wu;
            let v = (top + (bot - top) * wv + offR) | 0;
            if (v < 0) continue;
            ACC[j * LW + k] = PHI[v > 511 ? 511 : v];
          }
          work += (bnd - a) * 4;
        }
        g.cost.box += work * 2;
      }
      // the pool, over the heater
      const P0 = 50 - GT;
      for (let k = 0; k < LW; k++) {
        const dx = (k + 0.5 - 16) / 14;
        POOLY[k] = POOL_Y - T.poolUp - 1.6 * (1 - dx * dx) + 0.45 * sin(0.7 * (x0 + k) + 2.3 * t + i * 2.1);
      }
      for (let j = P0; j < LH; j++) {
        const yc = GT + j + 0.5;
        for (let k = SPAN0[j]; k < SPAN1[j]; k++) {
          const v = (128 + 16 * (yc - POOLY[k])) | 0;
          if (v > 0) ACC[j * LW + k] += PHI[v > 511 ? 511 : v];
        }
      }
      g.cost.box += (LH - P0) * LW * 3;
      // the blobs: each over its own box
      for (const [bx, by, rx, ry, a] of T.blobs) {
        if (a <= 0.004) continue;
        const A = BLOB_A * a, irx = 1 / (rx * rx), iry = 1 / (ry * ry);
        const j0 = Math.max(0, Math.floor(by - ry - GT)), j1 = Math.min(LH - 1, Math.ceil(by + ry - GT));
        const k0 = Math.max(0, Math.floor(bx - rx - x0)), k1 = Math.min(LW - 1, Math.ceil(bx + rx - x0));
        for (let j = j0; j <= j1; j++) {
          const dy = GT + j + 0.5 - by, qy = dy * dy * iry;
          if (qy >= 1) continue;
          for (let k = k0; k <= k1; k++) {
            const dx = x0 + k + 0.5 - bx, q = qy + dx * dx * irx;
            if (q < 1) ACC[j * LW + k] += A * (1 - q) * (1 - q);
          }
        }
        g.cost.box += (j1 - j0 + 1) * (k1 - k0 + 1) * 6;
      }
      // shade: potential -> colour, through this lamp's table (and at the hour, the heat front)
      const pNew = pairOf(f.h, i);
      const nb = night ? 1 : 0;
      const baseA = lutBase(pNew, nb), baseN = nt > 0 && nt < 1 ? lutBase(pNew, 1 - nb) : -1;
      let front = -1, baseOld = -1;
      if (J.hourIn && s < 3.5) {
        front = GB + 3 - (GB - GT + 8) * io(pr(s, 0.05 + 0.15 * i, 1.95 + 0.15 * i));
        baseOld = lutBase(pairOf(prv.h, i), nb);
      }
      const glintCol = (j) => Math.floor(16 - (SPAN1[j] - SPAN0[j]) / 2 + 2.2);
      const flare = T.flare, sweep = T.sweep;
      for (let j = 0; j < LH; j++) {
        const y = GT + j, yr = y & 3;
        const fb = (j / LH) * 5.2 + flare + 0.45 * sin(0.21 * y - 1.4 * t + i * 1.3);
        const gc = glintCol(j), inSweep = sweep > -50 && Math.abs(y + 0.5 - sweep) < 1.6;
        const row = j * LW, out = y * W + x0;
        for (let k = SPAN0[j]; k < SPAN1[j]; k++) {
          const th = BAYER[(yr << 2) | ((x0 + k) & 3)];
          let band = (fb + th) | 0;
          if (band > NBAND - 1) band = NBAND - 1;
          let base = baseA;
          if (baseN >= 0 && (night ? 1 - nt : nt) > th) base = baseN;
          if (front >= 0 && y + 3 * th < front) base = baseOld;
          const gl = inSweep || k === gc ? 1 : 0;
          let lev = (ACC[row + k] / 8) | 0;
          if (lev > NLEV - 1) lev = NLEV - 1;
          buf[out + k] = LUT[base + (band * 2 + gl) * NLEV + lev];
        }
        g.cost.px += SPAN1[j] - SPAN0[j];
        g.cost.box += (SPAN1[j] - SPAN0[j]) * 4;
      }
    }
    void hash;
  },
};
