// Metro: the time is a transit diagram. Each digit is one metro line, drawn
// octilinear (0/45/90 degrees, the square grid's own angles) with white
// station ticks, terminus bars and interchange rings. Trains glide along every
// line and stop at its stations. The Circle line runs round the edge of the
// map: its train laps once a minute, stopping at twelve stations, and reaches
// the depot at the top exactly on the minute. Then the changing digit's line
// is closed (its track goes to grey dashes and is lifted) and a track-laying
// train lays the new route behind it. On the hour the whole map relaxes into
// "geography": every line wanders as the real streets do, until the
// draughtsman's straight-edge sweeps across and straightens it back into the
// diagram (Beck's 1931 idea, replayed every hour).
import * as kit from '../js/kit.js';
import { buildGlyph, CELL } from './metro-lines.js';

const GW = 64, GH = 64, NPX = GW * GH;
const img = new Float32Array(3 * NPX), map = new Float32Array(3 * NPX);

// palette (linear light)
const LINE = [kit.hex('#ff2a1c'), kit.hex('#00c25a'), kit.hex('#2e6bff'), kit.hex('#e83aa8')];
const CIRCLE = kit.hex('#ffd000'), RIVER = kit.hex('#3f86c8'), WHITE = [1, 1, 1];
const GREY = [0.22, 0.22, 0.24], LAYER = kit.hex('#ffb060'), NIGHTBUS = kit.hex('#ff9a20');
const LINE_A = 0.3;             // the line itself; trains are much brighter

// four slots: hours on top, minutes below, the river between them
const SLOT = [[12, 8], [37, 8], [12, 37], [37, 37]];

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => pad(d.getHours()) + pad(d.getMinutes());

// ---------------------------------------------------------------- statics
const glyphs = new Map();
function glyph(slot, d) {
  const k = slot * 10 + d;
  if (!glyphs.has(k)) glyphs.set(k, buildGlyph(d, SLOT[slot][0], SLOT[slot][1], slot * 97 + d * 13));
  return glyphs.get(k);
}

// The river: a fixed octilinear band, and the Circle line round the edge.
const RIVER_PTS = [[-4, 23.5], [4, 31.5], [59, 31.5], [67, 39.5]];
const riverCov = new Float32Array(NPX);
for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
  let d = 1e9;
  for (let k = 0; k + 1 < RIVER_PTS.length; k++) {
    const [ax, ay] = RIVER_PTS[k], [bx, by] = RIVER_PTS[k + 1];
    d = Math.min(d, kit.segDist(x, y, ax, ay, bx, by));
  }
  // the trunk line crosses on a bridge: the river is cut away under it
  riverCov[y * GW + x] = kit.clamp(2 + 0.5 - d);
}
const circle = buildGlyph('circle', 0, 0, 7);

// ----------------------------------------------------------------- drawing
function splat(x, y, r, c, a) {
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(GW - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(GH - 1, Math.ceil(y + r));
  const r2 = r * r;
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const d2 = ((px - x) ** 2 + (py - y) ** 2) / r2;
    if (d2 >= 1) continue;
    const f = a * (1 - d2) * (1 - d2), p = 3 * (py * GW + px);
    img[p] += c[0] * f; img[p + 1] += c[1] * f; img[p + 2] += c[2] * f;
  }
}

/**
 * Paint a line glyph into `map`.
 *   lay: line shown where s < lay (Infinity = all)   close: 0..1 dismantling
 */
function paintGlyph(g, col, a, lay, close, now) {
  const { x0, y0, bw, bh, cov, s, deco, decoS, hole } = g;
  const dashDuty = 1 - 0.55 * kit.smoothstep(0.1, 0.4, close) - 0.45 * kit.smoothstep(0.6, 1, close), grey = close > 0;
  const c = grey ? kit.mix(col, GREY, kit.smoothstep(0, 0.25, close)) : col;
  const fade = grey ? (1 - kit.smoothstep(0.7, 1, close)) * (1 + 0.8 * kit.smoothstep(0.1, 0.25, close)) : 1;
  for (let j = 0; j < bh; j++) {
    const gy = y0 + j;
    if (gy < 0 || gy >= GH) continue;
    for (let i = 0; i < bw; i++) {
      const gx = x0 + i;
      if (gx < 0 || gx >= GW) continue;
      const q = j * bw + i, p = 3 * (gy * GW + gx);
      let lc = cov[q], dc = deco[q];
      if (lc <= 0 && dc <= 0) continue;
      let k = 1, kd = 1;
      if (lay !== Infinity) {
        k = kit.clamp((lay - s[q]) * 0.7 + 0.5);
        kd = kit.clamp((lay - decoS[q]) * 0.25);
      }
      if (grey) {
        // dashes thin out and drift as the track is lifted
        const ph = kit.fract((s[q] + now * 3) / 4);
        k *= kit.smoothstep(dashDuty + 0.12, dashDuty - 0.12, ph) * fade;
        kd *= fade * (1 - close);
      }
      lc *= k * (1 - hole[q]);
      dc *= kd;
      if (lc > 0) { const v = lc * a; map[p] += c[0] * v; map[p + 1] += c[1] * v; map[p + 2] += c[2] * v; }
      if (dc > 0) { const v = dc * a * 1.35; map[p] += v; map[p + 1] += v; map[p + 2] += v; }
    }
  }
}

/** A train with a motion trail: its own past positions. */
function drawTrain(path, sAt, tt, col, a, ox = 0, oy = 0, warp = null) {
  for (let k = 7; k >= 0; k--) {
    const s = sAt(tt - k * 0.05);
    const [x, y] = path.pos(s);
    let wx = x + ox, wy = y + oy;
    if (warp) { const d = warp(wx, wy); wx -= d[0]; wy -= d[1]; }
    if (k === 0) { splat(wx, wy, 1.9, kit.mix(col, WHITE, 0.7), a * 1.4); }
    else splat(wx, wy, 1.4, kit.mix(col, WHITE, 0.2), a * 0.8 * (1 - k / 8));
  }
}

// ------------------------------------------------------------------ warp
// "Geography": a smooth displacement field per hour, sampled bilinearly.
const fieldCache = { key: -1, dx: new Float32Array(NPX), dy: new Float32Array(NPX) };
function field(seed) {
  if (fieldCache.key === seed) return fieldCache;
  const { dx, dy } = fieldCache;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const q = y * GW + x;
    dx[q] = 2 * (kit.fbm(x * 0.055 + seed * 3.1, y * 0.055, 0.3, 2) - 0.5);
    dy[q] = 2 * (kit.fbm(x * 0.055 + 40, y * 0.055 + seed * 1.7, 2.1, 2) - 0.5);
  }
  fieldCache.key = seed;
  return fieldCache;
}

export default {
  name: 'Metro',
  blurb: 'the time as a transit map: digit lines with trains, a Circle-line seconds train, track-laying turns, and an hourly Beck straightening',
  layouts: ['hub'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const G = kit.grid(ctx);
    const now = ctx.date.getTime() / 1000;
    const M = Math.floor(now / 60) * 60, age = now - M;
    const next = digitsOf(ctx.date), prev = digitsOf(new Date((M - 60) * 1000));
    const mins = ctx.date.getMinutes();
    // the hour show starts 1.5 s early: the map relaxes before the turn (time still right)
    const hage = mins === 59 ? age - 60 : age, hourTurn = (mins === 0 && age < 6) || (mins === 59 && age > 58);
    map.fill(0); img.fill(0);
    const night = ctx.night;

    // river and Circle line
    for (let q = 0; q < NPX; q++) {
      const r = riverCov[q];
      // the river flows: slow ripples drift downstream
      if (r > 0) { const x = q & 63, y = q >> 6, v = r * (0.12 + 0.07 * Math.sin(x * 0.7 - now * 2.2 + y * 1.3) * Math.sin(x * 0.23 + now * 0.9)); map[3 * q] += RIVER[0] * v; map[3 * q + 1] += RIVER[1] * v; map[3 * q + 2] += RIVER[2] * v; }
    }
    paintGlyph(circle, CIRCLE, LINE_A * 0.8, Infinity, 0, now);

    // timeline of a turn (longer on the hour)
    const closeEnd = 1.2, layEnd = hourTurn && mins === 0 ? 3.4 : 3.0;
    const lines = [];
    for (let k = 0; k < 4; k++) {
      const d = +next[k], changed = d !== +prev[k] && age < layEnd + 0.6;
      const g = glyph(k, d);
      if (!changed) { paintGlyph(g, LINE[k], LINE_A, Infinity, 0, now); lines.push({ g, k, trains: 1 }); continue; }
      // the old line is lifted; the layer sets off while its last grey dashes fade
      const layStart = closeEnd - 0.3;
      if (age < closeEnd) {
        const og = glyph(k, +prev[k]);
        paintGlyph(og, LINE[k], LINE_A, Infinity, age / closeEnd, now);
        lines.push({ g: og, k, trains: 1 - kit.smoothstep(0, 0.3, age) });
      }
      if (age >= layStart && age < layEnd) {
        const u = kit.ease.inOut((age - layStart) / (layEnd - layStart));
        const head = u * (g.L + 1);
        paintGlyph(g, LINE[k], LINE_A, head, 0, now);
        lines.push({ g, k, trains: 0, head });
      } else if (age >= layEnd) {
        paintGlyph(g, LINE[k], LINE_A, Infinity, 0, now);
        lines.push({ g, k, trains: kit.smoothstep(layEnd, layEnd + 0.6, age) });
      }
    }

    // the hour: the map relaxes into geography, then is straightened
    let warpFn = null;
    if (hourTurn) {
      const F = field(ctx.date.getHours());
      const A = 4.5 * kit.ease.inOut(kit.clamp((hage + 1.5) / 1.3));
      const front = kit.lerp(-12, GW + 12, kit.ease.inOut(kit.clamp((hage - 2.5) / 2.0)));
      const amp = (x, y) => A * kit.smoothstep(front - 6, front + 6, (x + y) / 2);
      if (A > 0) {
        for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
          const q = y * GW + x, a = amp(x, y);
          const sx = x + F.dx[q] * a, sy = y + F.dy[q] * a;
          const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
          let r = 0, gg = 0, b = 0;
          for (let n = 0; n < 4; n++) {
            const cx = ix + (n & 1), cy = iy + (n >> 1);
            if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) continue;
            const w = ((n & 1) ? fx : 1 - fx) * ((n >> 1) ? fy : 1 - fy), p = 3 * (cy * GW + cx);
            r += map[p] * w; gg += map[p + 1] * w; b += map[p + 2] * w;
          }
          // fresh ink just behind the straight-edge
          const ink = 1 + 1.6 * Math.max(0, 1 - Math.abs((x + y) / 2 - front + 3) / 4) * (A > 0.5 && front > -8 ? 1 : 0);
          img[3 * q] = r * ink; img[3 * q + 1] = gg * ink; img[3 * q + 2] = b * ink;
        }
        warpFn = (x, y) => {
          const cx = kit.clamp(Math.round(x), 0, GW - 1), cy = kit.clamp(Math.round(y), 0, GH - 1), q = cy * GW + cx, a = amp(x, y);
          return [F.dx[q] * a, F.dy[q] * a];
        };
        // the straight-edge itself: a faint 45-degree rule
        if (front > -8 && front < GW + 8) {
          for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
            const e = Math.abs((x + y) / 2 - front);
            if (e > 1.2) continue;
            const v = 0.1 * (1 - e / 1.2), p = 3 * (y * GW + x);
            img[p] += v; img[p + 1] += v; img[p + 2] += v;
          }
        }
      } else img.set(map);
    } else img.set(map);

    // trains on the digit lines
    for (const { g, k, trains, head } of lines) {
      if (trains > 0) {
        for (const path of g.paths) for (let j = 0; j < path.n; j++) {
          const tc = kit.mix(LINE[k], NIGHTBUS, night);
          if (night > 0.5 && j > 0) continue;
          drawTrain(path, (t) => path.sAt(t + j * path.T / path.n + path.phase), now, tc, trains, 0, 0, warpFn);
        }
      }
      if (head !== undefined) {
        // the track-laying train at the head of the new line
        const at = g.at(head);
        if (at) {
          let [x, y] = at;
          if (warpFn) { const d = warpFn(x, y); x -= d[0]; y -= d[1]; }
          splat(x, y, 2.2, LAYER, 1.0);
          splat(x, y, 1.2, WHITE, 0.8);
          for (let n = 0; n < 3; n++) {
            const h = kit.hash(Math.floor(now * 20), n, k), ang = h * kit.TAU, rr = 1.5 + 2 * kit.hash(n, Math.floor(now * 20), 3);
            splat(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr, 0.9, LAYER, 0.6);
          }
        }
      }
    }
    // the Circle line's train: twelve stations, one lap a minute
    {
      const p = circle.paths[0];
      drawTrain(p, (t) => circle.secAt(t), now, kit.mix(CIRCLE, NIGHTBUS, night * 0.5), 1, 0, 0, warpFn);
    }

    const dim = 1 - 0.7 * night;
    for (let q = 0; q < NPX; q++) {
      const i = G.idx[q];
      if (i < 0) continue;
      ctx.out[3 * i] = img[3 * q] * dim; ctx.out[3 * i + 1] = img[3 * q + 1] * dim; ctx.out[3 * i + 2] = img[3 * q + 2] * dim;
    }
  },
};
