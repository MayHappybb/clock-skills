// Jewel Time: a match-3 game playing itself, and the time is the level.
//
// The board fills the glass: 20 x 10 cells of faceted jewels (ruby
// cushions, topaz hexagons, emerald lozenges, sapphire cabochons, amethyst
// triangles). The numerals are set into the board itself: each one a piece
// of jewellery, round white brilliants on a gold wire, laid on the grid like
// any other piece. The hours sit high on the left, the minutes low on the
// right, so the time reads as part of the level's layout.
//
// Always alive: an invisible player keeps playing. A hint glow and a nudge,
// a swap, a match pops in a flash of shards, the columns fall (gravity and a
// rebound) and refill from the top; cascades call out NICE / GREAT / SUPER.
// Jewels fall behind the numerals as if they were set in the glass, so the
// time is never broken by the play. A glint of light sweeps the board,
// stars twinkle on the facets, the brilliants throw coloured fire, and every
// few seconds a warm gleam runs along each numeral's stones in stroke order.
//
// Minute turn: the stones of each numeral about to change charge with a
// gold glow; at :58.4 lightning runs along the wire stone to stone and each
// brilliant shatters; the rest of its columns go in the blast before :59.9.
// After :00 the columns refill as one falling stack with the new numeral in
// it, landing row by row, and the gold wire grows between the new stones.
// Hour: a prism colour bomb forms between the hours and the minutes, the
// player swaps it, its shock ring wipes every jewel on the board, the
// changing numerals go up in lightning, a LEVEL UP ribbon sweeps in, and the
// whole board rains back in, column after column. The time is never wrong:
// old stones are all gone before :00, new ones only fall after it.
//
// Palette: jewel tones (no yellow, no white) on a deep plum velvet board, so
// the time owns the only gold and white on the glass: one hue family, the
// brightest thing there, with a dark shadow moat round the wire. The velvet
// shifts with the day (violet by day, wine at dusk, deep indigo at night);
// at night the backlight dims, the jewels darken and the brilliants keep
// their light.
//
// Hard or AA: every sprite is supersampled once (AA edges, faceted shading)
// and blitted, with 4 x 4 sub-pixel copies for whatever moves, so motion
// glides by quarter pixels at no per-pixel cost. The lettering is our own
// chunky bevelled arcade face (match3-art.js).

import { Gfx, hex, sin, clamp, hash, ease, progress } from '../js/kit.js';
import {
  CELL, MOVE, REST, POP, DIA, BOMB as BOMB_SPR, GLOW_GOLD, GLOW_WHITE, GLOW_BIG, HALO, STAR, WORDS, BANNER, GEMS,
  blit, blitAdd, blitTint, spark, dot, c565, mixc, makeSprite, GOLD, GOLD_L, GOLD_D,
} from './match3-art.js';
import { COLS, ROWS, NCELL, NTYPES, DIAMOND, BOMB, SLOTS, digitPath, scriptFor, fallDist, BOUNCE, POPT } from './match3-game.js';

const W = 160, H = 80;

// ------------------------------------------------------------ the board's velvet, by the hour
const DAY = [
  [0, '1a1848', '151340'], [5, '1a1848', '151340'], [7, '2e1a58', '28164e'], [10, '3a1c5e', '331854'],
  [16, '3a1c5e', '331854'], [18.5, '4a1a4c', '421644'], [21, '261a52', '211648'], [24, '1a1848', '151340'],
].map(([h, a, b]) => [h, hex(a), hex(b)]);
function velvet(hour) {
  let k = 1;
  while (DAY[k][0] < hour) k++;
  const a = DAY[k - 1], b = DAY[k], u = (hour - a[0]) / (b[0] - a[0]);
  return [mixc(a[1], b[1], u), mixc(a[2], b[2], u)];
}

let BASE = { key: -1, c: null };
function base(hourKey, hour, night) {
  const key = hourKey * 4 + ((night * 3 + 0.5) | 0);
  if (BASE.key === key) return BASE.c;
  const c = new Gfx(W, H), [va, vb] = velvet(hour);
  const dim = 1 - 0.25 * night;
  const sc = (col, k) => mixc(0, col, k * dim);
  for (let r = 0; r < ROWS; r++)
    for (let q = 0; q < COLS; q++) {
      const col = (r + q) & 1 ? va : vb;
      c.fillRect(q * CELL, r * CELL, CELL, CELL, sc(col, 1));
      // each cell a shallow well: darker rim at the top-left, lighter low-right
      c.fillRect(q * CELL, r * CELL, CELL, 1, sc(col, 0.72));
      c.fillRect(q * CELL, r * CELL, 1, CELL, sc(col, 0.8));
    }
  // a soft vignette
  for (let i = 0; i < 6; i++) c.rect(i, i, W - 2 * i, H - 2 * i, 0x000000, { a: 0.28 - i * 0.045 });
  BASE = { key, c };
  return c;
}

// gold wire: shadow moat, dark gold, gold, a highlight
function wireLink(g, ax, ay, bx, by, a = 1) {
  g.thickLine(ax + 0.7, ay + 0.9, bx + 0.7, by + 0.9, 6.2, 0x0a0418, { aa: true, a: 0.55 * a });
  g.thickLine(ax, ay, bx, by, 4.2, GOLD_D, { aa: true, a });
  g.thickLine(ax - 0.2, ay - 0.2, bx - 0.2, by - 0.2, 3.0, GOLD, { aa: true, a });
  g.thickLine(ax - 0.7, ay - 0.7, bx - 0.7, by - 0.7, 1.0, GOLD_L, { aa: true, a: 0.85 * a });
}
const ccx = (k) => (k % COLS) * CELL + 4, ccy = (k) => ((k / COLS) | 0) * CELL + 4;

// Each numeral's gold wire, prerendered once as a sprite (40 x 64, alpha):
// slots sit on whole cells, so one sprite per digit serves every slot.
// The same layers as wireLink: socket shadows, the shadow moat, dark gold,
// gold, the highlight. 10 sprites, 2,560 px each.
const segD = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = px - ax - u * dx, ey = py - ay - u * dy;
  return Math.sqrt(ex * ex + ey * ey);
};
const WIRE = Array.from({ length: 10 }, (_, d) => {
  const p = digitPath(d, 0);
  const pt = (k) => [(k % COLS) * CELL + 8, ((k / COLS) | 0) * CELL + 8];
  const segs = p.links.map(([a, b]) => [...pt(a), ...pt(b)]), cells = p.cells.map(pt);
  const near = (x, y, ox, oy) => { let m = 1e9; for (const [ax, ay, bx, by] of segs) { const e = segD(x - ox, y - oy, ax, ay, bx, by); if (e < m) m = e; } return m; };
  return makeSprite(40, 64, (x, y) => {
    if (near(x, y, -0.7, -0.7) < 0.5) return mixc(GOLD, GOLD_L, 0.85);
    if (near(x, y, -0.2, -0.2) < 1.5) return GOLD;
    if (near(x, y, 0, 0) < 2.1) return GOLD_D;
    let sh = near(x, y, 0.7, 0.9) < 3.1 ? 0.55 : 0;
    for (const [cx0, cy0] of cells) if (Math.hypot(x - cx0 - 0.7, y - cy0 - 0.9) < 4.6) { sh = Math.max(sh, 0.5); break; }
    return sh ? [0x0a0418, sh] : -1;
  }, 3);
});
function wireStatic(g, d, i) { blit(g, WIRE[d], SLOTS[i].c0 * CELL - 4, SLOTS[i].r0 * CELL - 4); }

// The moat: a cell's worth of darkened velvet round each numeral, so the
// time floats above the board. Alpha only (48 x 72, one colour), per digit;
// it fades with the numeral at the turn.
const MOAT = Array.from({ length: 10 }, (_, d) => {
  const cells = digitPath(d, 0).cells.map((k) => [(k % COLS) * CELL + 12, ((k / COLS) | 0) * CELL + 12]);
  return makeSprite(48, 72, (x, y) => {
    let m = 1e9;
    for (const [cx0, cy0] of cells) { const e = Math.hypot(x - cx0, y - cy0); if (e < m) m = e; }
    const a = clamp((11.5 - m) / 6, 0, 1);
    return a <= 0 ? -1 : [0, 0.62 * a * (2 - a)];
  }, 2);
});
const MOAT565 = c565(hex('0c0618'));
/** Cells that are a step from a numeral's stones (not the stones), per digit and slot: the jewels there sink deeper. */
const NEAR = {};
function nearCells(d, i) {
  const key = d * 4 + i;
  if (NEAR[key]) return NEAR[key];
  const own = new Set(digitPath(d, i).cells), out = new Set();
  for (const k of own) {
    const c = k % COLS, r = (k / COLS) | 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS) continue;
      const j = rr * COLS + cc;
      if (!own.has(j)) out.add(j);
    }
  }
  return (NEAR[key] = [...out]);
}
const DEEP = new Uint8Array(NCELL);

// ------------------------------------------------------------ pieces

let PX = 0, PY = 0, MOVING = false, LASTEND = -9;
let POSX = new Float32Array(512), POSY = new Float32Array(512), POSM = new Uint8Array(512), POSL = new Float32Array(512);
const OCC = new Int16Array(NCELL);
/** Where gem `id` is at second s (into PX, PY); MOVING if it is mid-path. */
function place(S, id, s) {
  const sg = S.segs[id];
  let x = S.hx[id], y = S.hy[id];
  MOVING = false; LASTEND = -9;
  for (let i = 0; i < sg.length; i += 7) {
    const t0 = sg[i], t1 = sg[i + 1];
    if (s < t0) break;
    if (s >= t1) { x = sg[i + 4]; y = sg[i + 5]; LASTEND = t1; continue; }
    const e = s - t0, mode = sg[i + 6];
    MOVING = true;
    if (mode === 1) {
      const y0 = sg[i + 3], y1 = sg[i + 5], tl = t1 - BOUNCE - t0;
      x = sg[i + 4];
      if (e < tl) y = y0 + fallDist(e);
      else {
        const hgt = (y1 - y0) > 40 ? 1.6 : (y1 - y0) * 0.04;
        y = y1 - hgt * sin((Math.PI * (e - tl)) / BOUNCE);
      }
      if (y > y1 && e < tl) y = y1;
    } else {
      let u = e / (t1 - t0);
      u = mode === 0 ? ease.inOutQuad(u) : ease.inOutCubic(u);
      x = sg[i + 2] + (sg[i + 4] - sg[i + 2]) * u;
      y = sg[i + 3] + (sg[i + 5] - sg[i + 3]) * u;
    }
    break;
  }
  PX = x; PY = y;
}

/** Blit a moving piece (sprite set `set`, 4 x 4 sub-pixel copies) at a fractional position. */
function blitMoving(g, set, x, y, am = 32) {
  const qx = ((x + 64) * 4 + 0.5) | 0, qy = ((y + 128) * 4 + 0.5) | 0;
  blit(g, set[((qy & 3) << 2) | (qx & 3)], (qx >> 2) - 65, (qy >> 2) - 129, am);
}

const LIGHT565 = GEMS.map((G0) => c565(G0.l));
const MID565 = GEMS.map((G0) => c565(G0.m));
const WHITE565 = c565(0xffffff), ICE565 = c565(hex('c8e0ff')), GOLD565 = c565(GOLD);

/** Shards of a popped piece: closed form from its death time. */
function shards(g, S, id, s, x, y) {
  const e = s - S.die[id];
  if (e < 0 || e > 0.5) return;
  const t = S.type[id], n = t === DIAMOND ? 7 : 5, k = 1 - e / 0.5;
  for (let j = 0; j < n; j++) {
    const h = hash(id, j, 77);
    const ang = (h & 1023) / 1024 * 6.2832, sp = 30 + ((h >> 10) & 31) * 1.2;
    const vx = sin(ang + 1.5708) * sp, vy = sin(ang) * sp - 20;
    const px = x + 4.5 + vx * e, py = y + 4.5 + vy * e + 110 * e * e;
    if (t === DIAMOND) { if (j & 1) spark(g, px, py, WHITE565, k * 1.3); else dot(g, px, py, j & 2 ? GOLD565 : ICE565, k); }
    else if (t < NTYPES) dot(g, px, py, j & 1 ? LIGHT565[t] : MID565[t], k * 1.1);
  }
}

/** Lightning from cell a to cell b (centres), jagged, re-struck 30 times a second. */
function bolt(g, ax, ay, bx, by, seed, a) {
  let px = ax, py = ay;
  const dx = bx - ax, dy = by - ay;
  for (let j = 1; j <= 3; j++) {
    const u = j / 3, h = hash(seed, j);
    const off = j === 3 ? 0 : (((h & 255) / 255) - 0.5) * 4;
    const qx = ax + dx * u - dy * off * 0.12, qy = ay + dy * u + dx * off * 0.12;
    g.thickLine(px, py, qx, qy, 2.6, hex('7aa8ff'), { aa: true, a: 0.35 * a });
    g.thickLine(px, py, qx, qy, 1.1, hex('f0f8ff'), { aa: true, a });
    px = qx; py = qy;
  }
}

// ------------------------------------------------------------ the face

export default {
  name: 'Jewel Time',
  blurb: 'A match-3 board playing itself; the time is set into it in gold-wired brilliants, shattered by lightning and dropped in fresh each minute.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, S = scriptFor(f.minuteKey), night = ctx.night;
    ctx.lcd.backlight(1 - 0.6 * night);

    // which numerals' wires are live (animating) this frame
    let live = 0;
    for (const [i, , t0] of S.chains) if (s >= t0 - 1.6) live |= 1 << i;
    for (const [i, , tl] of S.arrive) if (s < tl + 0.8) live |= 1 << i;
    g.draw(base(f.minuteKey - f.m, f.h + 0.5, night), 0, 0);

    // ---- the moats: full at rest, gone with the old numeral, back as the new one lands
    DEEP.fill(0);
    for (let i = 0; i < 4; i++) {
      let w = 1;
      for (const [ci, , t0, t1] of S.chains) if (ci === i) w = Math.min(w, 1 - progress(s, t0 - 0.3, t1));
      for (const [ai, , tl] of S.arrive) if (ai === i) w = Math.min(w, progress(s, tl - 0.1, tl + 0.7));
      if (w <= 0) continue;
      const d = +S.cur[i];
      blitTint(g, MOAT[d], SLOTS[i].c0 * CELL - 8, SLOTS[i].r0 * CELL - 8, MOAT565, (w * 32) | 0);
      if (w > 0.5) for (const k of nearCells(d, i)) DEEP[k] = 1;
    }
    for (let i = 0; i < 4; i++) if (!(live & (1 << i))) wireStatic(g, +S.cur[i], i);

    // ---- where every piece is this frame, and which cell each resting one fills
    const N = S.type.length;
    if (POSX.length < N) { POSX = new Float32Array(N + 256); POSY = new Float32Array(N + 256); POSM = new Uint8Array(N + 256); POSL = new Float32Array(N + 256); }
    OCC.fill(-1);
    for (let id = 0; id < N; id++) {
      if (s < S.born[id] || s >= S.die[id] + 0.5) continue;
      place(S, id, s);
      POSX[id] = PX; POSY[id] = PY; POSM[id] = MOVING ? 1 : 0; POSL[id] = LASTEND;
      if (s < S.die[id] && PX >= 0 && PY >= 0) {
        const c = ((PX + 4) / CELL) | 0, r = ((PY + 4) / CELL) | 0;
        if (c < COLS && r < ROWS) OCC[r * COLS + c] = id;
      }
    }

    // ---- live wires: being eaten by the lightning, or growing between new stones
    for (const [i, d, t0, t1] of S.chains) {
      if (s < t0 - 1.6) continue;
      const p = digitPath(d, i), n = p.cells.length, step = (t1 - t0) / (n - 1);
      for (const [a, b] of p.links) {
        const gone = t0 + step * Math.max(p.rank.get(a), p.rank.get(b));
        if (s < gone) wireLink(g, ccx(a), ccy(a), ccx(b), ccy(b));
      }
    }
    for (const [i, d, tl] of S.arrive) {
      if (s >= tl + 0.8 || s < tl) continue;
      const p = digitPath(d, i), n = p.cells.length;
      for (const [a, b] of p.links) {
        const ra = p.rank.get(a), rb = p.rank.get(b), lo = ra < rb ? a : b, hi = ra < rb ? b : a;
        const u = progress(s, tl + 0.05 + (0.5 * Math.min(ra, rb)) / n, tl + 0.2 + (0.5 * Math.min(ra, rb)) / n);
        if (u <= 0) continue;
        const e = ease.outQuad(u);
        wireLink(g, ccx(lo), ccy(lo), ccx(lo) + (ccx(hi) - ccx(lo)) * e, ccy(lo) + (ccy(hi) - ccy(lo)) * e);
      }
    }

    // ---- glows under the pieces: the charge before the lightning, the hint, the bomb
    for (const [i, d, t0] of S.chains) {
      if (s < t0 - 1.4 || s > t0 + 1.2) continue;
      const p = digitPath(d, i), k = progress(s, t0 - 1.4, t0);
      const pulse = 0.6 + 0.4 * sin(s * 18);
      for (const c of p.cells) {
        if (OCC[c] < 0 || S.type[OCC[c]] !== DIAMOND) continue;
        blitAdd(g, GLOW_GOLD, ccx(c) - 8, ccy(c) - 8, (k * pulse * 26) | 0);
      }
    }
    for (const [t0, t1, a] of S.hints) {
      if (s < t0 || s >= t1) continue;
      const k = sin((Math.PI * (s - t0)) / (t1 - t0));
      blitAdd(g, GLOW_WHITE, (POSX[a] + 0.5 | 0) - 4, (POSY[a] + 0.5 | 0) - 4, (k * 22) | 0);
    }

    // ---- the jewels (then the bomb, then the brilliants on top: jewels fall behind the numerals)
    const glintP = ((s % 7) / 7) * 300 - 40;
    // at night the jewels sink into the velvet (blended over it); the brilliants keep their light
    const jam = (32 - night * 13 + 0.5) | 0;
    const hintA = new Int16Array(4).fill(-1);
    let nh = 0, hintT0 = 0, hintT1 = 1;
    for (const [t0, t1, a, b] of S.hints) if (s >= t0 && s < t1) { hintA[nh++] = a; hintA[nh++] = b; hintT0 = t0; hintT1 = t1; }
    for (let pass = 0; pass < 2; pass++)
      for (let id = 0; id < S.type.length; id++) {
        const t = S.type[id];
        if ((t < NTYPES) !== (pass === 0)) continue;
        if (s < S.born[id] || s >= S.die[id] + POPT) continue;
        let x = POSX[id], y = POSY[id];
        MOVING = POSM[id] === 1;
        if (s >= S.die[id]) {
          if (t === BOMB) continue;
          const k = ((s - S.die[id]) / POPT * 4) | 0;
          blit(g, POP[t < NTYPES ? t : DIAMOND][k > 3 ? 3 : k], (x + 0.5 | 0) - 1, (y + 0.5 | 0) - 1, t < NTYPES ? jam : 32);
          continue;
        }
        if (t === BOMB) {
          const k = progress(s, S.born[id], S.born[id] + 0.4);
          // a prism orb: it swells in with a flash, breathes, three sparks orbit it
          const cxb = x + 4, cyb = y + 4;
          blitAdd(g, HALO, (cxb + 0.5 | 0) - 14, (cyb + 0.5 | 0) - 14, ((0.8 + 0.2 * sin(s * 8)) * k * 32) | 0);
          blitAdd(g, GLOW_WHITE, (cxb + 0.5 | 0) - 8, (cyb + 0.5 | 0) - 8, ((0.5 + 0.5 * sin(s * 8)) * k * 32) | 0);
          const q = ((s * 10) | 0) & 7;
          blit(g, BOMB_SPR[q], (cxb + 0.5 | 0) - 7, (cyb + 0.5 | 0) - 7, (k * 32) | 0);
          for (let j = 0; j < 3; j++) {
            const a = s * 5 + j * 2.094;
            spark(g, cxb + 8 * sin(a + 1.5708), cyb + 5 * sin(a), WHITE565, 1.4 * k);
          }
          continue;
        }
        let hint = false;
        for (let j = 0; j < nh; j++) if (hintA[j] === id) hint = true;
        // acting jewels are at full colour: moving ones (MOVE), the hinted pair
        // (rising to full, then the nudge), and ones that just landed (settling back)
        let act = 0;
        if (hint) {
          const u = (s - hintT0) / (hintT1 - hintT0);
          if (u < 0.35) act = u / 0.35;
          else { y -= 1.1 * Math.abs(sin(((u - 0.35) / 0.65) * Math.PI * 2)); MOVING = true; }
        }
        if (MOVING) { blitMoving(g, MOVE[t < NTYPES ? t : DIAMOND], x, y, t < NTYPES ? jam : 32); continue; }
        const since = s - POSL[id];
        if (since < 0.45) { const k = 1 - since / 0.45; if (k > act) act = k; }
        const d = x + y * 0.8 - glintP, ad = d < 0 ? -d : d;
        let lit = ad < 12 ? (3 - (ad / 4) | 0) : 0;
        if (t === DIAMOND) {
          // the gleam: light runs along each numeral's stones, stroke order, hours first
          const sl = S.slot[id];
          if (sl >= 0) {
            const p = digitPath(+S.cur[sl], sl), r = p.rank.get(((y >> 3) * COLS) + (x >> 3));
            if (r !== undefined) {
              const pos = ((s + 8 - sl * 0.45) % 8) / 1.3 * (p.cells.length - 1), e = r - pos, ae = e < 0 ? -e : e;
              if (ae < 2) { const gl = (3 - ae * 1.5) | 0; if (gl > lit) lit = gl; }
            }
          }
          // the fire pixel walks round the crown as the light sweep passes over it
          const fire = (((d + 1200) / 9) | 0) & 7;
          blit(g, DIA[fire][lit], x - 1, y - 1);
          if (lit === 3) blitAdd(g, STAR[1], x - 3, y - 3, 30);       // a sharp specular cross at the crest
          continue;
        }
        // calm level: 0 deep (beside a numeral), 1 calm; the sweep lifts to 3, acting to 4
        let lv = DEEP[((y + 4) >> 3) * COLS + ((x + 4) >> 3)] ? 0 : 1;
        if (lit >= 2 && lv < lit) lv = lit;
        const la = (act * 4 + 0.5) | 0;
        if (la > lv) lv = la;
        blit(g, REST[t][lv], x - 1, y - 1, jam);
      }

    // ---- shards
    for (let id = 0; id < S.type.length; id++) {
      const dd = s - S.die[id];
      if (dd < 0 || dd > 0.5) continue;
      shards(g, S, id, s, POSX[id], POSY[id]);
    }

    // ---- lightning along the old numerals
    for (const [i, d, t0, t1] of S.chains) {
      if (s < t0 - 0.05 || s > t1 + 0.12) continue;
      const p = digitPath(d, i), n = p.cells.length;
      const q = clamp(((s - t0) / (t1 - t0)) * (n - 1), 0, n - 1), h = q | 0;
      const strike = (s * 30) | 0;
      for (let j = h - 2; j <= h; j++) {
        if (j < 0 || j + 1 >= n) continue;
        const a = j === h ? 1 : j === h - 1 ? 0.55 : 0.25;
        const fr = j === h ? q - h : 1;
        const A = p.cells[j], Bc = p.cells[j + 1];
        bolt(g, ccx(A), ccy(A), ccx(A) + (ccx(Bc) - ccx(A)) * fr, ccy(A) + (ccy(Bc) - ccy(A)) * fr, strike * 31 + j, a);
      }
      const A = p.cells[h], Bc = p.cells[h + 1 < n ? h + 1 : h], fr = q - h;
      blitAdd(g, GLOW_WHITE, (ccx(A) + (ccx(Bc) - ccx(A)) * fr | 0) - 8, (ccy(A) + (ccy(Bc) - ccy(A)) * fr | 0) - 8, 30);
    }

    // ---- the bomb's shock ring
    if (S.bomb && s >= S.bomb.tBlast && s < S.bomb.tBlast + 1.0) {
      const e = s - S.bomb.tBlast, r = e * 110;
      if (e < 0.25) blitAdd(g, GLOW_BIG, S.bomb.cx - 12, S.bomb.cy - 12, ((1 - e / 0.25) * 32) | 0);
      g.ring(S.bomb.cx, S.bomb.cy, r - 1.6, r + 1.6, hex('fff4e0'), { aa: true, a: 0.75 * (1 - e) });
      g.ring(S.bomb.cx, S.bomb.cy, r - 4.5, r - 1.6, hex('c070ff'), { aa: true, a: 0.35 * (1 - e) });
    }

    // ---- sparkles: stars on the brilliants (and now and then a jewel)
    for (let j = 0; j < 5; j++) {
      const P = 1.3 + j * 0.17, ph = s / P + j * 0.37, cyc = ph | 0, u = ph - cyc;
      const h = hash(f.minuteKey, cyc, j);
      let k;
      if (j < 3) {
        const p = digitPath(+S.cur[h & 3], h & 3);
        k = p.cells[(h >> 4) % p.cells.length];
      } else k = (h >> 4) % NCELL;
      const id = OCC[k];
      if (id < 0 || POSM[id]) continue;
      const sz = (sin(u * Math.PI) * 4.4) | 0;
      if (sz > 0) blitAdd(g, STAR[sz > 4 ? 4 : sz], POSX[id] + 2 - 5, POSY[id] + 2 - 5, 30);
    }

    // ---- the resting gleam's head: a warm glint gliding along each still numeral
    for (let i = 0; i < 4; i++) {
      if (live & (1 << i)) continue;
      const p = digitPath(+S.cur[i], i), n = p.cells.length;
      const pos = ((s + 8 - i * 0.45) % 8) / 1.3 * (n - 1);
      if (pos > n - 1) continue;
      const h = pos | 0, fr = pos - h, A = p.cells[h], Bc = p.cells[h + 1 < n ? h + 1 : h];
      const x = ccx(A) + (ccx(Bc) - ccx(A)) * fr, y = ccy(A) + (ccy(Bc) - ccy(A)) * fr;
      const fade = pos < 1 ? pos : pos > n - 2 ? n - 1 - pos : 1;
      blitAdd(g, GLOW_GOLD, (x + 0.5 | 0) - 8, (y + 0.5 | 0) - 8, (fade * 18) | 0);
      blitAdd(g, STAR[2 + (((s * 12) | 0) & 1)], (x - 1.5 + 0.5 | 0) - 5, (y - 1.5 + 0.5 | 0) - 5, (fade * 30) | 0);
    }

    // ---- arrival gleam: a star runs along each new numeral as its wire grows
    for (const [i, d, tl] of S.arrive) {
      const u = progress(s, tl + 0.05, tl + 0.75);
      if (u <= 0 || u >= 1) continue;
      const p = digitPath(d, i), n = p.cells.length, q = u * (n - 1), h = q | 0, fr = q - h;
      const A = p.cells[h], Bc = p.cells[h + 1 < n ? h + 1 : h];
      const x = ccx(A) + (ccx(Bc) - ccx(A)) * fr, y = ccy(A) + (ccy(Bc) - ccy(A)) * fr;
      blitAdd(g, STAR[3 + ((s * 20) & 1)], (x | 0) - 5, (y | 0) - 5, 32);
    }

    // ---- combo call-outs
    for (let pi = 0; pi < S.popups.length; pi++) {
      const [t0, x, y, w] = S.popups[pi];
      const e = s - t0;
      if (e < 0 || e > 0.9) continue;
      if (pi + 1 < S.popups.length && S.popups[pi + 1][0] <= s) continue;   // a newer call-out replaces it
      const rise = 7 * ease.outCubic(e / 0.9), a = e < 0.08 ? e / 0.08 : e > 0.6 ? 1 - (e - 0.6) / 0.3 : 1;
      const spr = WORDS[w][0], yy = y - 4 - rise;
      const q = ((yy + 64) * 4 + 0.5) | 0;
      const sp = WORDS[w][q & 3];
      blit(g, sp, clamp((x - spr.w / 2) | 0, 0, W - spr.w), (q >> 2) - 64, (a * 32) | 0);
    }

    // ---- LEVEL UP (the hour)
    let bu = null;
    if (f.m === 59 && s > 58.5) bu = s - 60;
    else if (f.m === 0 && s < 3.2) bu = s;
    if (bu !== null) {
      const inU = progress(bu, -1.3, -0.85), outU = progress(bu, 2.5, 3.0);
      const x = -78 + 82 * ease.outBack(inU), y = 60 + 24 * ease.inQuad(outU);
      const q = ((x + 128) * 4 + 0.5) | 0;
      blit(g, BANNER[q & 3], (q >> 2) - 128, (y + 0.5) | 0);
    }
  },
};

