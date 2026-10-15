// Invaders: the 1978 cabinet, and the time is the invasion. The glass is the
// black monitor seen through the cabinet's half-mirror over a painted moon,
// with strips of coloured cellophane glued across it, so everything the game
// draws takes its colour from the height it is at. The four numerals are
// the alien formation itself: each is a 4 x 7 block of invaders (squids on
// top, crabs in the middle, octopi below, as in the arcade), the colon two
// small squids. Below them the bunkers and the laser base; the saucer lane
// on top.
//
// Always alive: the formation marches in lock-step to the four-note thump,
// two steps a second. On every step each alien moves 2 px and flips its legs,
// and the step ripples through the formation from the bottom row up (the
// arcade moved one alien per frame), so the numerals shear and settle twice
// a second. The march reverses at the edges and every third reversal the
// whole formation drops a pixel; it regroups at the top before the turn.
// The aliens drop bombs; the base glides under them and shoots them out of
// the air, or they crater the bunkers. Flourishes: the saucer crosses at :15
// and :45 and is shot down; at :30 the thump races (the frenzy of a nearly
// cleared wave) for two seconds.
//
// Minute turn: the base sweeps under the leaving numerals twice (from about
// :57.3, earlier when several digits leave, so it never runs faster than
// 2 px a frame), shooting every other alien of each leaving digit on the
// first pass and the rest on the second (each bursts into the arcade's
// starburst): a leaving digit only thins, first to itself dotted, then away,
// and is gone by :59.7.
// After :00 a saucer crosses and beams the new wave down: each new alien
// warps in out of a reversed starburst, the dotted half of the digit first,
// then the rest, so a new digit fills evenly; it is whole by :01. The
// bunkers are rebuilt for the new wave.
// Hour: the mothership (twice the saucer) brings the new hour, the base
// shoots it down in a burst of rays and debris, and the cellophane strips
// cascade: every strip's colour rolls down the glass through all five.
//
// Palette: the cellophane, and nothing else for the game: red over the
// saucer lane, amber, white and cyan through the formation, the classic
// green over the bunkers and the base. Every sprite is one-colour phosphor;
// colour comes only from the strip it is under, so a numeral is banded. The
// painted moon behind is three dim violets, calm under the bright phosphor,
// with a few twinkling stars. Night dims the backlight; the strips stay
// saturated, so the far digits still read.
//
// Restrained effects, all the cabinet's own: the step ripple, the hum bar
// (the rotated monitor's raster roll: a soft band of lifted black drifting
// sideways across the glass, 22 px/s), twinkling stars, and at the hour the
// strip cascade.
//
// Cost: the game is drawn as a byte mask (sprite pixel lists), then one
// integer pass composites it through a per-row strip table over the painted
// backdrop (or its hum-bar twin, by an ordered dither). The minute's script
// is planned once a minute (~5-10k integer ops, charged to the frame that
// plans it). RAM: the mask 12.8 KB, up to four minute plans (~6 KB), the
// tables (0.6 KB). Flash: the backdrop and its lifted twin 2 x 25.6 KB, and
// under 1 KB of sprites and font.
import { sin, cos, rand, hash, progress, to565, from565, R, G, B } from '../js/kit.js';
import { SPLAT, SPARK, UFO, UFO_BOOM, CANNON, SHIELD, BOMBS, STRIPS, stripOf } from './invaders-art.js';
import { W, H, planFor, cellAt, baseX, shipX, shipLife, ufoX, SHOT_V, BOMB_V, BASE_Y, SHIELD_X, SHIELD_Y, SW, SH, SN } from './invaders-plan.js';

const N = W * H;
const GAME = new Uint8Array(N);        // 0 nothing, 1 phosphor, 2 dim phosphor
const LUT = new Uint16Array(3 * H);    // [level][row] -> RGB565
const GROUND_Y = 76;

// ------------------------------------------------------------ the painted moon (flash)

const SKY = 0x06070d, ROCK = 0x18132b, PIT = 0x0f0c1e, PLANET = 0x14223c, LIT = 0x2b4c7c;
const BACK = new Uint16Array(N);
const STARS = [];
{
  const top = (x) => 67 + Math.round(1.6 * Math.sin(x * 0.07) + Math.sin(x * 0.19 + 1));
  const CRATERS = [[20, 73, 6, 1.6], [61, 71, 4, 1.2], [104, 74, 7, 1.8], [141, 72, 5, 1.4], [84, 78, 4, 1.2]];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let c = SKY;
      if (y >= top(x)) {
        c = ROCK;
        for (const [cx, cy, rx, ry] of CRATERS) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 < 1) c = PIT;
      }
      const dx = x + 0.5 - 152, dy = y + 0.5 - 4.5;
      if (dx * dx + dy * dy < 25) c = (dx + 2) ** 2 + (dy - 1) ** 2 < 25 ? PLANET : LIT;
      BACK[y * W + x] = to565(c);
    }
  for (let k = 0; STARS.length < 34; k++) {
    const x = hash(k, 1, 11) % W, y = hash(k, 2, 11) % 64;
    if (BACK[y * W + x] !== to565(SKY)) continue;
    STARS.push({ i: y * W + x, b: 1 + (hash(k, 3, 11) % 3), ph: rand(k, 4, 11) * 6.283, sp: 0.6 + rand(k, 5, 11) });
  }
}
const STAR_C = [0, 0x1a1d2e, 0x2a2e46, 0x3e4466, 0x8a92c0].map(to565);

// The hum bar: the rotated monitor's raster rolls, so a band of lifted black
// drifts sideways across the picture; through the half-mirror it lifts the
// painted moon a little too. BACK_HI is the backdrop under the bar (flash).
const LIFT = [7, 9, 15];
const BACK_HI = BACK.map((v) => { const c = from565(v); return to565((Math.min(255, R(c) + LIFT[0]) << 16) | (Math.min(255, G(c) + LIFT[1]) << 8) | Math.min(255, B(c) + LIFT[2])); });
const BAYER = Uint8Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
const PROF = new Uint8Array(W);
const BAR_W = 26, BAR_V = 22;          // half-width px, px/s

// the phosphor through each strip
const STRIP565 = STRIPS.map(to565);
const DIM565 = STRIPS.map((c) => to565(((c >> 1) & 0x7f7f7f) - ((c >> 3) & 0x1f1f1f)));
const SHIELD_RANK = (() => { const r = new Uint16Array(SN); for (let i = 0; i < SN; i++) r[i] = hash(i, 41) % 1024; return r; })();

// ------------------------------------------------------------ drawing into the mask

let blitN = 0;
function blit(m, x, y, v = 1) {
  const p = m.pts;
  for (let k = 0; k < p.length; k += 2) {
    const px = x + p[k], py = y + p[k + 1];
    if (px >= 0 && px < W && py >= 0 && py < H) GAME[py * W + px] = v;
  }
  blitN += p.length >> 1;
}
function blit2(m, x, y, v = 1) {       // twice the size: the mothership
  const p = m.pts;
  for (let k = 0; k < p.length; k += 2)
    for (let j = 0; j < 4; j++) {
      const px = x + p[k] * 2 + (j & 1), py = y + p[k + 1] * 2 + (j >> 1);
      if (px >= 0 && px < W && py >= 0 && py < H) GAME[py * W + px] = v;
    }
  blitN += p.length * 2;
}
function vbar(x, y0, len, v = 1) {
  if (x < 0 || x >= W) return;
  for (let y = Math.max(0, y0); y < Math.min(H, y0 + len); y++) GAME[y * W + x] = v;
  blitN += len;
}
function line(x0, y0, x1, y1, v) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;) {
    if (x0 >= 0 && x0 < W && y0 >= 0 && y0 < H && !GAME[y0 * W + x0]) GAME[y0 * W + x0] = v;
    blitN++;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}

// ------------------------------------------------------------ pieces

const tmp = [0, 0, 0];

/** The saucer (or mothership) that brings minute P's new wave, and its beams. */
function ship(P, tau, s) {
  const [a, b] = shipLife(P.hour);
  if (tau < a || tau > b) return;
  const x = Math.round(shipX(P.hour, P.dir, tau));
  if (tau >= P.ship.th) { if (P.hour) burst(P, tau, x); return; }
  if (P.hour) blit2(UFO, x, -1); else blit(UFO, x, 1);
  // beams down to the aliens being warped in now
  const sx = x + (P.hour ? 11 : 5), sy = P.hour ? 9 : 6;
  for (const c of P.cells) {
    if (c.ta < 0 || tau < c.ta - 0.1 || tau >= c.ta + 0.03) continue;
    cellAt(P, c, tau, tmp);
    line(sx, sy, tmp[0] + 3, tmp[1] + 2, 2);
  }
}

/** The mothership blown apart: rays, then debris falling away. */
function burst(P, tau, x) {
  const u = (tau - P.ship.th) / 1.1;
  if (u >= 1) return;
  const cx = x + 11, cy = 4;
  for (let k = 0; k < 12; k++) {
    const a = k * 0.5236 + 0.26, ca = cos(a), sa = sin(a) * 0.7;
    const r1 = 3 + 22 * Math.sqrt(u), r0 = r1 * (0.35 + 0.5 * u);
    line(cx + ca * r0, cy + sa * r0, cx + ca * r1, cy + sa * r1, u < 0.45 ? 1 : 2);
  }
  if (u < 0.25) blit(UFO_BOOM, cx - 5, cy - 2);
  for (let k = 0; k < 16; k++) {
    const a = rand(P.mk, k, 21) * 6.283, v = 20 + 30 * rand(P.mk, k, 22), t = u * 1.1;
    const px = Math.round(cx + cos(a) * v * t), py = Math.round(cy + sin(a) * v * t * 0.6 + 40 * t * t);
    if (px >= 0 && px < W && py >= 0 && py < H) GAME[py * W + px] = 1;
  }
}

function bunkers(P, s) {
  const prev = planFor(P.mk - 1).shieldFinal, u = progress(s, 0.2, 1.2) * 1024;
  for (let q = 0; q < 4; q++) {
    const st = Uint8Array.from(SHIELD.d);
    if (u < 1024) for (let i = 0; i < SN; i++) if (st[i] && !prev[q][i] && SHIELD_RANK[i] >= u) st[i] = 0;
    for (const h of P.hits) if (h.si === q && h.t <= s) for (const p of h.gone) st[p] = 0;
    const x0 = SHIELD_X[q];
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (st[y * SW + x]) GAME[(SHIELD_Y + y) * W + x0 + x] = 1;
    blitN += SN;
  }
}

/** The strip colour of each row; at the hour the strips cascade down through all five colours. */
function strips(P, s) {
  const t0 = P.hour && P.ship.th < 99 ? P.ship.th + 0.15 : 1e9;
  for (let y = 0; y < H; y++) {
    let k = stripOf(y);
    if (s > t0) {
      const q = Math.floor((s - t0) * 4 - y * 0.06);
      if (q > 0 && q < 10) k = (k + q) % 5;
    }
    LUT[H + y] = STRIP565[k];
    LUT[2 * H + y] = DIM565[k];
  }
}

// ------------------------------------------------------------ the face

export default {
  name: 'Invaders',
  blurb: 'The 1978 cabinet under cellophane strips: the alien formation is the time, marching to the thump; the base shoots each leaving digit down and a saucer beams the new wave in.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const P = planFor(mk);
    GAME.fill(0);
    blitN = 0;

    // ---- the formation: the numerals
    for (const c of P.cells) {
      if (s >= c.th + 0.15) continue;
      if (c.ta >= 0 && s < c.ta) continue;
      cellAt(P, c, s, tmp);
      if (s >= c.th || (c.ta >= 0 && s < c.ta + 0.1)) blit(SPLAT, tmp[0], tmp[1]);
      else blit(c.spr[tmp[2]], tmp[0], tmp[1]);
    }
    // ---- the base's shots at the leaving aliens
    for (const c of P.cells) if (s >= c.tf && s < c.th) vbar(c.sx, Math.round(68 - SHOT_V * (s - c.tf)) - 3, 4);
    // ---- the minute's own shots and bombs
    for (const sh of P.shots) if (s >= sh.t0 && s < sh.t1) vbar(sh.x, Math.round(68 - SHOT_V * (s - sh.t0)) - 3, 4);
    for (const b of P.bombs) {
      if (s < b.t0) continue;
      if (s < b.t1) { blit(BOMBS[b.kind][Math.floor(s * 8) & 1], b.x - 1, Math.round(b.y + BOMB_V * (s - b.t0))); continue; }
      if (s < b.t1 + 0.12) blit(SPARK, b.ex - 1, b.ey - (b.end === 1 ? 2 : 1));
    }
    // ---- the saucer at :15 and :45
    for (const u of P.ufos) {
      if (s < u.t0 || s > u.t0 + 2.8) continue;
      const x = Math.round(ufoX(u, Math.min(s, u.th)));
      if (s < u.th) blit(UFO, x, 1);
      else if (s < u.th + 0.4) blit(UFO_BOOM, x, 1);
    }
    // ---- the ship that brings the new wave: this minute's leaving, the next one's arriving
    ship(P, s, s);
    if (s >= 58.5) ship(planFor(mk + 1), s - 60, s);
    // ---- bunkers, base, ground
    bunkers(P, s);
    blit(CANNON, Math.round(baseX(P, s)) - 4, BASE_Y);
    GAME.fill(1, GROUND_Y * W, GROUND_Y * W + W);

    // ---- the glass: phosphor through the strips over the painted moon
    strips(P, s);
    const T = (mk % 1000) * 60 + s;
    {
      const bx = (T * BAR_V) % W;
      for (let x = 0; x < W; x++) {
        let d = Math.abs(x + 0.5 - bx);
        if (d > W / 2) d = W - d;
        PROF[x] = d >= BAR_W ? 0 : Math.round(16 * (1 - d / BAR_W) * (1 - d / BAR_W) * 1.4);
      }
    }
    const buf = g.buf;
    for (let i = 0, y = 0; y < H; y++)
      for (let x = 0; x < W; x++, i++) {
        const v = GAME[i];
        buf[i] = v ? LUT[v * H + y] : PROF[x] > BAYER[((y & 3) << 2) | (x & 3)] ? BACK_HI[i] : BACK[i];
      }
    // stars twinkle in the painted sky
    for (const st of STARS) {
      if (GAME[st.i]) continue;
      const w = sin(T * st.sp + st.ph);
      buf[st.i] = STAR_C[w > 0.93 ? 4 : st.b];
    }
    g.cost.px += N + blitN;
    g.cost.box += N * 3 + blitN * 4 + STARS.length * 4 + P.cells.length * 30 + P.bombs.length * 6;
    if (P.ops) { g.cost.box += P.ops; P.ops = 0; }
  },
};
