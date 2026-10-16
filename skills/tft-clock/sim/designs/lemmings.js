// Lemmings: the time is a level, and the level is being worked.
//
// A side view of a 1991 Amiga Lemmings level. The trapdoor at the top left
// lets out a lemming every half second; they walk right, over the four
// numerals of the time, which are brickwork piers standing on stepped
// ground, and off the far end, where they open umbrellas and float down to
// the flaming exit. They do what lemmings do: fall into every dip, climb any
// wall they can, cross the gaps on builders' stairs, walk on and on. The time
// is read from the skyline the crowd is walking over.
//
// The minute: around :47 the player's crosshair picks out workers on the
// numeral that is about to change. Either three diggers sink shafts down
// through it (falling through its hollows, spraying brick), or bombers count
// down 5-4-3-2-1 over their heads, "Oh no!", and blow it away crater by
// crater. Nothing of the old numeral is left by :59.5. After :00 a builder
// walks the new numeral's strokes in order, laying bricks behind him: up the
// stem, along the bar, across the bowl; the walkers already use it as he goes.
//
// The hour: the nuke. At :51 the hatch shuts, every lemming on screen gets a
// countdown, and the whole crowd goes off in a ripple of confetti with the
// old hours. At :00 the hatch opens at release rate 99 and a flood of a
// hundred lemmings pours over the new level while the builders raise it; the
// level's tileset changes with the hour (earth, hell, crystal, marble, candy),
// dissolved in like an Amiga screen fade.
//
// Palette: each tileset is the game's own: dark textured ground with a lit
// top edge, bricks in three tones, near-black sky; lemmings are always green
// hair, blue robe. Hard pixels everywhere: it is a sprite game.
//
// Cost: the frame is a copy of the tileset's prebuilt background, the four
// numerals' live pixels from per-pixel lay/remove times, and ~40-130 sprite
// blits. Walkers are simulated (here from their release, on the device one
// step a frame), against a route recomputed only while terrain changes.
import { rand, hex, mix, to565, R, G, B, font3x5, sprite } from '../js/kit.js';
import { DW, DH, ROUTE, routeAt, WALK, FALL, CLIMB, DIG, BUILD, OHNO, BROLLY } from './lemmings-glyphs.js';
import {
  W, H, SLOTS, STEEL, HATCH, EXIT, GROUND, layer, aliveAt, pathAt, spawnsFor, simulate, fieldsOf,
} from './lemmings-world.js';

// ------------------------------------------------------------ tilesets

const THEMES = [
  { name: 'earth', sky: ['#020208', '#0c0c26', '#1a1640'], earth: ['#2e1a0c', '#4c2c14', '#6e4220'], top: ['#58c83e', '#2c8426'],
    brick: ['#ffd48a', '#ea9a40', '#b0602a'], plank: '#fff0b0' },
  { name: 'hell', sky: ['#060102', '#1a0406', '#3a0a0c'], earth: ['#260806', '#4a120e', '#702016'], top: ['#ff9a2a', '#c8401a'],
    brick: ['#fff2b8', '#f2c444', '#a8741c'], plank: '#ffffff' },
  { name: 'crystal', sky: ['#01040c', '#041428', '#0a2a44'], earth: ['#10163a', '#1e2c66', '#30489a'], top: ['#8af4ff', '#3a9ed0'],
    brick: ['#ffd2ff', '#e474e4', '#9a34a6'], plank: '#ffffff' },
  { name: 'marble', sky: ['#040408', '#141224', '#28223c'], earth: ['#2c2834', '#4a4454', '#6c6478'], top: ['#e8cc6a', '#9a8434'],
    brick: ['#ffffff', '#d4daea', '#8a92ac'], plank: '#ffe08a' },
  { name: 'candy', sky: ['#0c0210', '#240a2c', '#401446'], earth: ['#3c1a12', '#5c3020', '#80482e'], top: ['#ffb8dc', '#e874ac'],
    brick: ['#e4fff4', '#6ae6b6', '#24966e'], plank: '#ffffff' },
].map((t) => ({
  ...t, sky: t.sky.map(hex), earth: t.earth.map(hex), top: t.top.map(hex), brick: t.brick.map(hex), plank: hex(t.plank),
}));

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const d565 = (c, x, y, k = 0) => {
  // ordered dither of a colour with an extra brightness offset k (0..1 of one step)
  const t = (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
  const q = (v, n) => { const s = Math.max(0, Math.min(255, v)) * n / 255; const r = Math.floor(s + t * k); return r > n ? n : r; };
  return (q(R(c), 31) << 11) | (q(G(c), 63) << 5) | q(B(c), 31);
};
const lerpC = (stops, u) => {
  const n = stops.length - 1, f = Math.max(0, Math.min(n, u * n)), i = Math.min(n - 1, f | 0);
  return mix(stops[i], stops[i + 1], f - i);
};

const STEEL_C = [hex('#e8eef4'), hex('#a4b0bc'), hex('#626c78'), hex('#3a404a')];
const WOOD = [hex('#d8a060'), hex('#a06a34'), hex('#5a3418')];

/** Background (sky, ground, steel, exit arch) per tileset, as RGB565. */
function buildBase(th, ti) {
  const b = new Uint16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = lerpC(th.sky, Math.pow(y / (H - 1), 1.3));
    b[y * W + x] = d565(c, x, y, 1);
  }
  // stars, faint
  for (let k = 0; k < 26; k++) {
    const x = (rand(k, ti, 1) * W) | 0, y = (rand(k, ti, 2) * 50) | 0;
    b[y * W + x] = to565(mix(th.sky[1], 0xffffff, 0.25 + rand(k, 3) * 0.35));
  }
  // the ground: strata, pebbles, a lit top edge with tufts
  for (let x = 0; x < W; x++) for (let y = GROUND[x]; y < H; y++) {
    const dy = y - GROUND[x];
    const n = rand(x >> 1, y >> 1, ti * 7) * 0.6 + rand(x, y, 5) * 0.4;
    const strata = Math.sin((y + Math.sin(x * 0.09 + ti) * 3) * 0.55) * 0.5 + 0.5;
    let c = lerpC(th.earth, Math.max(0, Math.min(1, 0.15 + n * 0.55 + strata * 0.3 - dy * 0.012)));
    if (rand(x >> 1, y >> 1, 99 + ti) > 0.93) c = mix(th.earth[2], 0xffffff, 0.15);
    if (dy === 0) c = th.top[0];
    else if (dy === 1) c = rand(x, ti, 4) > 0.35 ? th.top[1] : th.top[0];
    else if (dy === 2 && rand(x, ti, 6) > 0.6) c = th.top[1];
    b[y * W + x] = to565(c);
    if (dy === 0 && rand(x, ti, 8) > 0.7 && y > 0 && !(x >= EXIT.x && x < EXIT.x + EXIT.w)) b[(y - 1) * W + x] = to565(th.top[1]);
  }
  // the colon: riveted steel, which no lemming can dig
  for (const s of STEEL) for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
    const ex = x === s.x || y === s.y ? 0 : x === s.x + s.w - 1 || y === s.y + s.h - 1 ? 2 : 1;
    const rivet = (x === s.x + 1 || x === s.x + s.w - 2) && (y === s.y + 1 || y === s.y + s.h - 2);
    b[y * W + x] = to565(rivet ? STEEL_C[3] : STEEL_C[ex]);
  }
  // the exit: a stone arch with a dark doorway (torches are drawn live)
  const gx = EXIT.x, gy = EXIT.y, gb = GROUND[gx + 4];
  const stone = [mix(th.brick[0], 0x808080, 0.5), mix(th.brick[1], 0x606060, 0.55), mix(th.brick[2], 0x303030, 0.6)];
  for (let y = gy + 3; y < gb; y++) for (let x = gx; x < gx + EXIT.w; x++) {
    const ax = x - (gx + EXIT.w / 2 - 0.5), r = Math.hypot(ax, (y - (gy + 9)) * 0.9);
    const inside = Math.abs(ax) < 4.5 && (y > gy + 9 || r < 4.6);
    const outer = Math.abs(ax) < 8.5 && (y > gy + 9 || r < 8.6);
    if (inside) b[y * W + x] = to565(y > gb - 2 ? 0x000000 : mix(0x000000, th.sky[0], 0.3));
    else if (outer) {
      const brickRow = (y - gy) >> 1, joint = ((x + (brickRow & 1) * 2) & 3) === 0 || ((y - gy) & 1) === 1 && false;
      b[y * W + x] = to565(joint ? stone[2] : (y & 1) ? stone[1] : stone[0]);
    }
  }
  return b;
}

/** Brick texture for a numeral slot: 4 x 3 bricks in running bond, three tones. */
function buildBricks(th, s) {
  const t = new Uint16Array(DW * DH);
  for (let py = 0; py < DH; py++) for (let px = 0; px < DW; px++) {
    const course = (py / 3) | 0, row = py % 3, off = (course & 1) * 2;
    const bi = ((px + off) >> 2), joint = ((px + off) & 3) === 3;
    const v = rand(bi, course, s * 13) * 0.5;
    let c;
    if (row === 2) c = mix(th.brick[2], th.brick[1], 0.15);
    else if (joint) c = mix(th.brick[2], th.brick[1], 0.35);
    else if (row === 0) c = mix(th.brick[0], th.brick[1], 0.3 + v * 0.6);
    else c = mix(th.brick[1], th.brick[2], v * 0.5);
    t[py * DW + px] = to565(c);
  }
  return t;
}

// built once at load (on the device: in flash, or at boot)
const BASES = THEMES.map((th, i) => buildBase(th, i));
const BRICKS = THEMES.map((th) => [0, 1, 2, 3].map((s) => buildBricks(th, s)));
const baseOf = (i) => BASES[i];
const bricksOf = (i) => BRICKS[i];

// ------------------------------------------------------------ sprites

const HATCH_BOX = sprite(`
  kwwwwwwwwwwwwwk
  wlllllllllllllw
  wlmmmmmmmmmmmlw
  wlmkkkkkkkkkmlw
  wlmkkkkkkkkkmlw
  kwwwwwwwwwwwwwk`, { w: WOOD[0], l: WOOD[1], m: WOOD[2], k: 0x1a0e06 });
const FLAP = WOOD[1];
const CONF = [0xff4a4a, 0xffe14a, 0x4aff7a, 0x4ac8ff, 0xff7ae0, 0xffffff];

// ------------------------------------------------------------ the frame

export default {
  name: 'Lemmings',
  blurb: 'A Lemmings level whose ground is the time: a stream of lemmings walks over brick numerals; each minute diggers or bombers take the old one away and a builder lays the new one, and at the hour the crowd is nuked.',
  fps: 60,

  frame(g, ctx) {
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    const T = ctx.date.getTime() / 1000;
    const m = Math.floor(T / 60), sec = T - m * 60;
    const L = layer(m), f = L.f;
    const ti = f.h % THEMES.length, prevTi = (f.h + 23) % 24 % THEMES.length;
    // the tileset dissolves in over the first second of the hour
    const fade = f.m === 0 && sec < 1.4 ? sec / 1.4 : 1;
    const buf = g.buf;
    const base = baseOf(ti);
    if (fade >= 1) buf.set(base);
    else {
      const old = baseOf(prevTi);
      for (let i = 0; i < W * H; i++) buf[i] = BAYER[((((i / W) | 0) & 3) << 2) | (i & 3)] < fade * 16 ? base[i] : old[i];
      g.cost.box += W * H;
    }
    g.cost.px += W * H; g.cost.calls++;

    // ---- the numerals: every live brick
    const bricks = bricksOf(ti), oldBricks = fade < 1 ? bricksOf(prevTi) : null;
    for (let s = 0; s < 4; s++) {
      const S = SLOTS[s], tex = bricks[s], otex = oldBricks && oldBricks[s];
      for (let py = 0; py < DH; py++) {
        const row = (S.y + py) * W + S.x;
        for (let px = 0; px < DW; px++) {
          if (!aliveAt(L, s, px, py, sec)) continue;
          const j = py * DW + px;
          buf[row + px] = otex && BAYER[(((S.y + py) & 3) << 2) | ((S.x + px) & 3)] >= fade * 16 ? otex[j] : tex[j];
          g.cost.px++;
        }
      }
    }
    g.cost.box += 4 * DW * DH * 2;
    const th = THEMES[ti];

    // ---- builders' stairs where the route crosses a gap
    const P = pathAt(T);
    for (let x = 0; x < W; x++) if (P.bridge[x]) {
      const y = P.p[x];
      g.pixel(x, y, (x % 3) === 2 ? th.brick[1] : th.plank);
      g.pixel(x, y + 1, th.brick[2]);
    }

    // ---- the hatch: shut from the nuke until the hour turns
    const shut = (f.m === 59 && sec > 51.3) || (f.m === 0 && sec < 0.45);
    const open = f.m === 0 && sec < 0.9 ? Math.max(0, (sec - 0.45) / 0.45) : shut ? 0 : 1;

    // ---- the exit's torches
    for (const tx of [EXIT.x + 1, EXIT.x + EXIT.w - 2]) {
      g.fillRect(tx, EXIT.y + 4, 1, 4, WOOD[2]);
      for (let k = 0; k < 4; k++) {
        const fx = tx + ((rand(k, (T * 12) | 0, tx) * 3) | 0) - 1, fy = EXIT.y + 3 - k - ((rand(k, (T * 12) | 0, tx + 1) * 2) | 0);
        g.pixel(fx, fy, k === 0 ? 0xfff2a0 : k === 1 ? 0xffb030 : 0xe84a1a);
      }
    }

    const sprites = [];   // [spr, x, y, flip]
    const parts = [];     // particles: [x, y, c]
    const labels = [];    // countdowns: [n, x, y]
    const clicks = [];    // crosshair: [time, x, y]

    // ---- this minute's and the last minute's workers
    for (const mm of [m - 1, m]) {
      const LL = layer(mm), ss = T - mm * 60;
      LL.slots.forEach((sl, s) => {
        const S = SLOTS[s];
        for (const dg of sl.diggers) {
          clicks.push([mm * 60 + dg.t0 - 0.1, S.x + dg.x, S.y - 4]);
          if (ss < dg.t0 - 0.1 || ss >= dg.t1) continue;
          let py = 0;
          while (py < DH && dg.rows[py + 1] <= ss) py++;
          const y = S.y + py, x = S.x + dg.x;
          sprites.push([DIG[((ss * 6) | 0) & 1], x - 2, y - 7, false]);
          // brick spoil flung up and out of the shaft
          for (let k = 0; k < 6; k++) {
            const tb = Math.floor(ss * 10) / 10 - k * 0.1, age = ss - tb;
            if (tb < dg.t0) continue;
            const id = (tb * 10) | 0, vx = (rand(id, s, dg.x) - 0.5) * 34, vy = -16 - rand(id, s, 7) * 18;
            parts.push([x + vx * age, y - 2 + vy * age + 70 * age * age, th.brick[(id + k) % 3]]);
          }
        }
        for (const bm of sl.bombers) {
          const t5 = bm.t - 5;
          clicks.push([mm * 60 + t5, S.x + bm.x, S.y - 4]);
          if (ss >= t5 && ss < bm.t) {
            let top = DH;
            for (let py = 0; py < DH; py++) if (aliveAt(LL, s, bm.x, py, ss)) { top = py; break; }
            const x = S.x + bm.x, y = S.y + top;
            const left = bm.t - ss;
            sprites.push([left < 1 ? OHNO[((ss * 8) | 0) & 1] : WALK[0], x - 2, y - 8, false]);
            labels.push([Math.ceil(left), x - 1, y - 14]);
          }
          const age = ss - bm.t;
          if (age >= 0 && age < 1.1) for (let k = 0; k < 22; k++) {
            const a = rand(k, s, bm.t * 10) * 6.283, sp = 14 + rand(k, 3, bm.t * 10) * 34;
            parts.push([S.x + bm.x + Math.cos(a) * sp * age, S.y + bm.cy + Math.sin(a) * sp * age - 10 * age + 40 * age * age, CONF[k % 6]]);
          }
        }
        const bd = sl.builder;
        if (bd) {
          clicks.push([mm * 60 + bd.t0 - 0.05, S.x + ROUTE[sl.d].pts[0][0], S.y + ROUTE[sl.d].pts[0][1] - 4]);
          if (ss >= bd.t0 - 0.05 && ss < bd.t1 + 0.2) {
            const [rx, ry, dir, hop, vert] = routeAt(sl.d, Math.max(0, ss - bd.t0) * bd.v);
            const x = S.x + rx, y = S.y + ry;
            if (hop) sprites.push([FALL[1], x - 2, y - 9, dir < 0]);
            else if (vert) sprites.push([CLIMB[((ss * 6) | 0) & 1], x - 3, y - 6, false]);
            else sprites.push([BUILD[((ss * 5) | 0) & 1], x - 2, y - 10, dir < 0]);
          }
        }
      });
    }

    // ---- the walkers
    for (const sp of spawnsFor(T)) {
      const st = simulate(sp, T);
      if (st.gone) continue;
      if (st.blast) {
        const age = T - st.blast;
        if (age < 1.2) for (let k = 0; k < 10; k++) {
          const a = rand(k, sp.id, 1) * 6.283, v = 10 + rand(k, sp.id, 2) * 26;
          parts.push([st.x + Math.cos(a) * v * age, st.y - 4 + Math.sin(a) * v * age + 45 * age * age, CONF[(k + sp.id) % 6]]);
        }
        continue;
      }
      const x = Math.round(st.x), y = Math.round(st.y);
      const nuked = T >= st.nuke;
      if (nuked) labels.push([Math.max(1, Math.ceil(st.nuke + 5 - T)), x - 1, y - (st.brolly ? 18 : 14)]);
      if (st.mode === 1) {
        if (st.brolly) { sprites.push([BROLLY, x - 3, y - 13, false]); sprites.push([FALL[1], x - 2, y - 9, false]); }
        else sprites.push([FALL[((st.age * 8) | 0) & 1], x - 2, y - 8, false]);
      } else if (st.mode === 2) sprites.push([CLIMB[((st.age * 6) | 0) & 1], x - 2, y - 8, false]);
      else if (nuked && st.nuke + 5 - T < 1) sprites.push([OHNO[((T * 8) | 0) & 1], x - 2, y - 8, false]);
      else sprites.push([WALK[((st.age * 8) | 0) & 3], x - 2, y - 8, false]);
    }

    for (const [spr, x, y, flip] of sprites) g.blit(spr, x, y, { flipX: flip });
    // the hatch goes over the lemmings it lets out
    g.blit(HATCH_BOX, HATCH.x, HATCH.y);
    const fl = Math.round(open * 4);
    for (let k = 0; k < 6; k++) {
      // two flaps, hinged at the sides, swinging down
      g.pixel(HATCH.x + 2 + k, HATCH.y + 5 + (open ? Math.round((k / 5) * fl) : 0), FLAP);
      g.pixel(HATCH.x + 12 - k, HATCH.y + 5 + (open ? Math.round((k / 5) * fl) : 0), FLAP);
    }
    for (const [x, y, c] of parts) g.pixel(x, y, c);
    for (const [n, x, y] of labels) g.text(String(n), x, y, { font: font3x5, c: 0xffffff });

    // ---- the player's crosshair, gliding to each lemming it gives a job
    clicks.sort((a, b) => a[0] - b[0]);
    let ci = clicks.findIndex((c) => c[0] > T - 0.35);
    if (ci >= 0 && clicks[ci][0] - T < 0.6) {
      const c = clicks[ci], p = ci > 0 && c[0] - clicks[ci - 1][0] < 0.9 ? clicks[ci - 1] : [c[0] - 0.6, c[1] + 14, c[2] + 10];
      const u = Math.max(0, Math.min(1, (T - (c[0] - 0.45)) / 0.35)), e = u * u * (3 - 2 * u);
      const cx = Math.round(p[1] + (c[1] - p[1]) * e), cy = Math.round(p[2] + (c[2] - p[2]) * e);
      const r = T >= c[0] && T < c[0] + 0.15 ? 3 : 4;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.hline(sx < 0 ? cx - r : cx + r - 1, cy + sy * r, 2, 0xffffff);
        g.vline(cx + sx * r, sy < 0 ? cy - r : cy + r - 1, 2, 0xffffff);
      }
      g.pixel(cx, cy, 0xffffff);
    }
  },
};
