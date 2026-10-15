// WHAAM! O'Clock: the glass is a page of a 1960s comic, printed in four
// flat inks on newsprint (Lichtenstein's source material), and the time is
// its sound-effect lettering. Three inked panels with paper gutters, one of
// them slanted: on the left the hours burst out of a jagged starburst as a
// giant SFX, breaking the panel border; top right the minutes in a smaller
// burst; bottom right the cast panel, a new scene each minute (the Whaam!
// jet with its pilot, a ray gun in a gloved hand, a clenched fist, the
// crying girl's eyes with the tear). A yellow caption box types out the
// narration (MEANWHILE..., SUDDENLY..., and at the hour "AT ELEVEN...").
//
// The numerals are hand-cut SFX block figures drawn for this panel
// (popart-glyphs.js): chamfered, leaning, open counters, inked with a 2 px
// keyline and a flat block shadow; the yellow plate is printed 1 px out of
// register, so a sliver of white paper shows inside the keyline, as on
// cheap newsprint.
//
// Always alive: the Ben-Day screens drift against the key plate by quarter
// pixels (the dots are anti-aliased coverage tiles), the starbursts turn
// and throb, action lines stream out of the hour burst, and the cast acts
// in flat cels: the jet bobs in streaming speed lines, the ray gun's rings
// pulse, the fist trembles, the girl blinks and her tear runs.
//
// Minute turn: the scene's actor knocks the old minute out: the jet fires a
// rocket up across the gutter (BLAM!), the gun zaps it (ZAP!), the fist
// shoots up out of its panel (POW!), the girl looks up and it breaks
// (CRACK!). The digit is cut into flat shards that fly apart, gone before
// :00; then the new digit slams down from the top of its panel and squashes
// on landing, KA-CHUNK! stamped under it, and the next panel of the strip
// slides into the cast panel. Hour: the jet itself crosses the whole page,
// repainting it in the next hour's colourway behind its tail, and its
// rocket hits the hours: WHAAM! fills the hours panel, all the old numerals
// fly apart out of the blast, and the new ones slam in as it collapses.
// The time is never wrong: old shards are gone by :59.85, new numerals land
// after :00; the hours are unreadable for about a second at the hour.
//
// Palette: the four process inks of the comic page and nothing else: key
// black, cyan, magenta-red and yellow, their overprint blue, on newsprint
// cream, paper white for balloons and the misregistered sliver, a flat skin
// tint. Tones are only Ben-Day dot screens, never gradients. The time is
// always yellow with black ink, the strongest contrast on the page; three
// colourways (one per hour) swap which ink is the ground and which the
// burst. Night: the colourist's night panel: the grounds go deep blue with
// darker dots, the bursts keep their full inks and the yellow numerals are
// the brightest thing on a 40 % backlight.
//
// Hard pixels for the print (dots by coverage table, numerals, bursts,
// gutters); anti-aliasing only where a flat cel glides (the cast, the
// sound-effect bursts, the slanted gutters' edges).
//
// Cost: the page is one integer pass over the glass (a dot-tile lookup, a
// polar-map lookup for the bursts and action lines, priced as cost.box);
// numerals are signed-distance table lookups; the cast is the kit's
// polygons. Once a minute a changing numeral is cut into shards (one pass
// over its table, ~10k integer ops, cached). Flash: numeral tables 40 KB,
// burst polar maps 51 KB, dot tiles 1.5 KB, letters < 1 KB: ~93 KB.

import { to565, clockFields, clamp, progress, ease, sin, cos, hash } from '../js/kit.js';
import { HOUR, MIN, GM, letter, textWidth } from './popart-glyphs.js';
import { CAST_PAL as CP, jet, missile, raygun, fist, eye, tear, burst } from './popart-cast.js';

const W = 160, H = 80;

// ------------------------------------------------------------ palette
const DAY = { paper: 0xf4ead0, ink: 0x1a1714, white: 0xfffaf0, yellow: 0xffd52a, red: 0xe5262c, cyan: 0x22a0dc, blue: 0x2650b0, skin: 0xf6c3a0 };
const NIGHT = { paper: 0xc4bccf, ink: 0x0a0a18, white: 0xe8ecff, yellow: 0xffdc30, red: 0xe23048, cyan: 0x40b8ff, blue: 0x7a90ff, skin: 0xd8a8b0 };
const GROUND_N = 0x18205a;                  // night panels: the colourist's deep blue under the dots
const DOTC = ['cyan', 'red', 'yellow', 'blue'];

const lerpC = (a, b, u) => {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * u), g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * u), bl = (a & 255) + (((b & 255) - (a & 255)) * u);
  return ((r + 0.5) << 16) | ((g + 0.5) << 8) | (bl + 0.5);
};
const PALS = new Map();
/** The palette at night level n (quantised to 1/8): RGB565 inks and a 17-step dot ramp per dot colour. */
function palette(n) {
  const q = Math.round(n * 8);
  let p = PALS.get(q);
  if (p) return p;
  const u = q / 8, c = {}, c565 = {};
  for (const k of Object.keys(DAY)) { c[k] = lerpC(DAY[k], NIGHT[k], u); c565[k] = to565(c[k]); }
  const ground = lerpC(DAY.paper, GROUND_N, u);
  const ramp = {};
  for (const k of DOTC) {
    const r = new Uint16Array(17), dot = lerpC(DAY[k], lerpC(NIGHT[k], GROUND_N, 0.4), u);
    for (let i = 0; i <= 16; i++) r[i] = to565(lerpC(ground, dot, i / 16));
    ramp[k] = r;
  }
  p = { c, ...c565, ramp };
  PALS.set(q, p);
  return p;
}

// ------------------------------------------------------------ Ben-Day dots: coverage tiles (flash)
// Dots on a 4 x 8 staggered lattice (a 45-degree screen), coverage 0..16 per
// pixel for each quarter-pixel phase, for a few dot radii (tones).
const DOT_R = [1.0, 1.2, 1.55];
const DOT = DOT_R.map((r) => {
  const t = new Uint8Array(16 * 32);
  for (let q = 0; q < 16; q++) {
    const ox = (q & 3) / 4, oy = (q >> 2) / 4;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 4; x++) {
        let n = 0;
        for (let sy = 0; sy < 4; sy++)
          for (let sx = 0; sx < 4; sx++) {
            const px = x + (sx + 0.5) / 4 - ox, py = y + (sy + 0.5) / 4 - oy;
            let best = 99;
            for (let j = -1; j <= 2; j++)
              for (let i = -1; i <= 2; i++) {
                const cx = i * 4 + 2 * (((j % 2) + 2) % 2) + 1, cy = j * 4 + 1;
                const d = (px - cx) ** 2 + (py - cy) ** 2;
                if (d < best) best = d;
              }
            if (best < r * r) n++;
          }
        t[q * 32 + y * 4 + x] = n;
      }
  }
  return t;
});

// ------------------------------------------------------------ the bursts: polar maps round each panel's centre (flash)
function polarMap(cx, cy, sx) {
  const R2 = new Uint8Array(W * H), A = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) * sx, dy = y + 0.5 - cy;
      R2[y * W + x] = Math.min(255, Math.round(2 * Math.hypot(dx, dy)));
      A[y * W + x] = Math.round((Math.atan2(dy, dx) / (2 * Math.PI)) * 256) & 255;
    }
  return { R2, A };
}
const BA = [37, 45], BB = [120, 22];
const MAP_A = polarMap(BA[0], BA[1], 0.75), MAP_B = polarMap(BB[0], BB[1], 0.62);

function starProfile(n, tip, valley, seed) {
  const p = new Float32Array(256), pts = [];
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * 256, j = (hash(seed, k) % 1000) / 1000;
    pts.push([a0 + (j - 0.5) * 6, tip * (0.86 + 0.28 * ((hash(seed, k, 1) % 1000) / 1000))]);
    pts.push([a0 + 128 / n + (j - 0.5) * 4, valley * (0.9 + 0.2 * ((hash(seed, k, 2) % 1000) / 1000))]);
  }
  pts.push([pts[0][0] + 256, pts[0][1]]);
  for (let a = 0; a < 256; a++) {
    let k = 0;
    const aa = a < pts[0][0] ? a + 256 : a;
    while (k < pts.length - 2 && pts[k + 1][0] < aa) k++;
    const [a0, r0] = pts[k], [a1, r1] = pts[k + 1], u = (aa - a0) / (a1 - a0);
    p[a] = 2 * (r0 + (r1 - r0) * clamp(u, 0, 1));
  }
  return p;
}
const PROF_A = starProfile(15, 33, 23, 7), PROF_B = starProfile(13, 21, 14.5, 11);
// action lines: a few angles of panel A carry a streaming dash
const LINES_A = new Uint8Array(256);
for (let k = 0; k < 22; k++) LINES_A[hash(5, k) % 256] = 1;
// speed lines for the jet's panel: some rows carry a long white streak
const SPEED = new Int16Array(H).fill(-1);
for (let y = 0; y < H; y++) if (hash(9, y) % 5 === 0) SPEED[y] = hash(9, y, 1) % 128;
// ------------------------------------------------------------ the page layout
// Three panels: A (hours) on the left, B (minutes) top right, C (the cast)
// bottom right. G1 is the slanted gutter between A and the right column, G2
// the one between B and C. Positions are gutter centres; panels keep 3.5 px
// clear of them (2 px of ink border, 1.5 px of paper).
const g1x = (y) => 72 - (6 * (y + 0.5)) / H;
const g2y = (x) => 44 + (x - 70) * 0.035;
const C_TOP = 49, C_X0 = 72;                 // the cast panel's local origin

// ------------------------------------------------------------ the numerals
const KEY = 16, KEY_M = 9;                   // keyline, 1/8 px (hours 2 px, minutes just over 1 px)
const MIS = 1;                               // the yellow plate prints 1 px right and down of the key plate

/**
 * One numeral at glyph top-left (X, Y) in size S, clipped to [x0, x1) x [y0, y1).
 * `sy` squashes about the baseline (the slam), 1 at rest.
 */
function numeral(g, S, d, X, Y, pal, clip, sy = 1) {
  const T = S.sd[d], tw = S.tw, th = S.th, buf = g.buf;
  const ox = Math.round(X) - GM, oy = Math.round(Y) - GM;
  const [x0, y0, x1, y1] = clip;
  const base = oy + GM + S.h;
  const isy = Math.round(65536 / sy), sx = 2 - sy, isx = Math.round(65536 / sx), cxm = ox + (tw >> 1);
  const ya = Math.max(y0, Math.floor(base - (base - oy) * sy)), yb = Math.min(y1, Math.ceil(base + (oy + th - base) * sy));
  const xa = Math.max(x0, Math.floor(cxm - (tw >> 1) * sx)), xb = Math.min(x1, Math.ceil(cxm + (tw >> 1) * sx));
  const sh = S === HOUR ? 3 : 2, key = S === HOUR ? KEY : KEY_M;
  const offF = MIS + MIS * tw, offS = sh + sh * tw;
  const ink = pal.ink, fill = pal.yellow, paper = pal.white;
  let n = 0;
  for (let y = ya; y < yb; y++) {
    const ty = base - oy + ((((y - base) << 1) + 1) * isy >> 17);
    if (ty < sh || ty >= th) continue;
    const row = ty * tw;
    for (let x = xa; x < xb; x++) {
      const tx = (tw >> 1) + ((((x - cxm) << 1) + 1) * isx >> 17);
      if (tx < sh || tx >= tw) continue;
      const k = row + tx, v = T[k];
      n++;
      if (v <= 0) buf[y * W + x] = v > -key ? ink : T[k - offF] <= -key ? fill : paper;
      else if (T[k - offS] <= 0) buf[y * W + x] = ink;
    }
  }
  g.cost.box += n * 5;
}

// ------------------------------------------------------------ shards: a numeral cut into flat pieces
// Three straight cracks through the figure cut it into up to eight pieces;
// each pixel stores its piece and whether it is on a piece's edge (inked).
const SHARDS = new Map();
let shardOps = 0;
function pieces(S, d, seed) {
  const key = (S === HOUR ? 100 : 0) + d * 10 + (seed % 7);
  let P = SHARDS.get(key);
  if (P) return P;
  const T = S.sd[d], tw = S.tw, th = S.th, id = new Uint8Array(tw * th).fill(255);
  const cuts = [];
  for (let c = 0; c < 3; c++) {
    const a = (c / 3) * Math.PI + ((hash(seed, c) % 100) / 100 - 0.5) * 0.9;
    const px = tw / 2 + ((hash(seed, c, 1) % 100) / 100 - 0.5) * tw * 0.3, py = th / 2 + ((hash(seed, c, 2) % 100) / 100 - 0.5) * th * 0.4;
    cuts.push([Math.cos(a), Math.sin(a), px, py]);
  }
  for (let y = 0; y < th; y++)
    for (let x = 0; x < tw; x++) {
      if (T[y * tw + x] > 0) continue;
      let k = 0;
      for (let c = 0; c < 3; c++) if ((x + 0.5 - cuts[c][2]) * cuts[c][1] - (y + 0.5 - cuts[c][3]) * cuts[c][0] > 0) k |= 1 << c;
      id[y * tw + x] = k;
    }
  const box = Array.from({ length: 8 }, () => [1e9, 1e9, -1, -1, 0, 0, 0]);
  const flag = new Uint8Array(tw * th);
  for (let y = 0; y < th; y++)
    for (let x = 0; x < tw; x++) {
      const i = y * tw + x, k = id[i];
      if (k === 255) continue;
      const b = box[k];
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); b[4] += x; b[5] += y; b[6]++;
      const e = x === 0 || y === 0 || x === tw - 1 || y === th - 1 || id[i - 1] !== k || id[i + 1] !== k || id[i - tw] !== k || id[i + tw] !== k;
      flag[i] = e ? 1 : 0;
    }
  shardOps += tw * th * 4;
  P = { id, flag, box };
  SHARDS.set(key, P);
  return P;
}

/** The numeral flying apart: u 0..1 since the impact at screen point (ix, iy). */
function shatter(g, S, d, X, Y, u, ix, iy, seed, pal, clip) {
  const P = pieces(S, d, seed), tw = S.tw, T = S.sd[d], buf = g.buf;
  const ox = Math.round(X) - GM, oy = Math.round(Y) - GM;
  const [x0, y0, x1, y1] = clip;
  const key = S === HOUR ? KEY : KEY_M, fill = pal.yellow, ink = pal.ink;
  const reach = (S === HOUR ? 110 : 80) * ease.outQuad(u);
  let n = 0;
  for (let k = 0; k < 8; k++) {
    const b = P.box[k];
    if (!b[6]) continue;
    let dx = ox + b[4] / b[6] - ix, dy = oy + b[5] / b[6] - iy;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    const spin = ((hash(seed, k, 5) % 100) / 100) * 0.6 + 0.7;
    const mx = Math.round(dx * reach * spin), my = Math.round(dy * reach * spin * 0.8 + 50 * u * u);
    const ya = Math.max(y0, oy + b[1] + my), yb = Math.min(y1, oy + b[3] + 1 + my);
    const xa = Math.max(x0, ox + b[0] + mx), xb = Math.min(x1, ox + b[2] + 1 + mx);
    for (let y = ya; y < yb; y++) {
      const row = (y - my - oy) * tw - ox - mx;
      for (let x = xa; x < xb; x++) {
        const i = row + x;
        if (P.id[i] !== k) continue;
        buf[y * W + x] = P.flag[i] || T[i] > -key ? ink : fill;
        n++;
      }
    }
    n += (xb - xa) * (yb - ya);
  }
  g.cost.box += n * 3;
}
// ------------------------------------------------------------ the cast panel's scenes
// Each minute the cast panel shows one scene; its actor knocks the old
// minute out at the turn. The minute before an hour is always the girl.
const SCENES = ['jet', 'gun', 'fist', 'eyes'];
const sceneOf = (mk, m) => (m === 59 ? 3 : m === 0 ? 0 : hash(mk, 77) % 4);
const SCENE_DOT = [2, 1, 0, 1], SCENE_INK = ['cyan', 'yellow', 'red', 'red'];
const SFX = ['BLAM!', 'ZAP!', 'POW!', 'CRACK!'];

/** Where the scene's actor sends its blow from, in screen space. */
function muzzle(sc, ox, t) {
  if (sc === 0) { const [jx, jy] = jetAt(ox, t); return [jx + 30, jy + 12]; }
  if (sc === 1) return [ox + 12 + 38 * Math.cos(-0.3), C_TOP + 12 + 38 * Math.sin(-0.3)];
  return [ox + 42, C_TOP + 10];
}
const jetAt = (ox, t) => [ox + 20 + 3 * sin(t * 0.9), C_TOP + 6 + 1.5 * sin(t * 1.4)];

/** Draw scene `sc` with its left edge at ox; `act` is the action's time since it began (or -1), (tx, ty) its target. */
function scene(g, sc, ox, t, act, tx, ty) {
  if (sc === 0) {
    const [jx, jy] = jetAt(ox, t);
    jet(g, jx, jy, t, { a: -0.06 });
  } else if (sc === 1) {
    const charge = act < 0 ? 0 : progress(act, 0.4, 1.3);
    const shake = charge > 0 ? 0.5 * sin(t * 90) * charge : 0;
    raygun(g, ox + 12, C_TOP + 12 + shake, -0.3 + 0.05 * sin(t * 1.7), t * (1 + 2 * charge), charge, 1.25);
  } else if (sc === 2) {
    // the fist trembles, ready; at the action it drops back to wind up (then the blow is drawn over the page)
    const wind = act < 0 ? 0 : progress(act, 0.2, 0.9) * (1 - progress(act, 0.9, 1.0));
    const blow = act >= 0.9 && act < 2.2;
    if (!blow) {
      const tr = 0.45 * sin(t * 47), y = C_TOP + 9 + wind * 7 + tr;
      fist(g, ox + 42, y);
      for (let k = 0; k < 3; k++) {
        const a = -2.4 + k * 0.6 + 0.08 * sin(t * 7 + k);
        g.thickLine(ox + 42 + 11 * Math.cos(a), y + 3 + 11 * Math.sin(a), ox + 42 + 15 * Math.cos(a), y + 3 + 15 * Math.sin(a), 1.1, CP.ink, { aa: true });
      }
    }
  } else {
    // the girl's eyes: blink, the tear runs; at the action she looks up at the page
    const bl = (t + 0.7) % 3.9, open = bl < 0.16 ? Math.abs(1 - bl / 0.08) : 1;
    const look = act < 0 ? 0 : ease.inOutQuad(progress(act, 0, 0.6));
    const gx = 1.2 * sin(t * 0.7) * (1 - look) + look * (tx - (ox + 42)) * 0.05, gy = -look * 2;
    eye(g, ox + 22, C_TOP + 14, open, clamp(gx, -3, 3), gy, 1);
    eye(g, ox + 62, C_TOP + 14, open, clamp(gx, -3, 3), gy, -1);
    const tu = (t % 4.5) / 4.5;
    tear(g, ox + 27 + tu * 1.5, C_TOP + 21 + tu * 9, 6 + tu * 1.5);
  }
}

// ------------------------------------------------------------ captions
const CAPTIONS = ['MEANWHILE...', 'SUDDENLY...', 'LATER...', 'BUT THEN...', 'AT LAST...', 'MEANWHILE...', 'AND THEN...'];
const HOURS = ['MIDNIGHT', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'NOON'];
function captionOf(f) {
  if (f.m === 0) {
    const w = f.h === 0 ? HOURS[0] : f.h === 12 ? HOURS[12] : HOURS[f.h % 12];
    return w.length >= 8 ? w + '...' : 'AT ' + w + '...';
  }
  return CAPTIONS[hash(f.minuteKey, 3) % CAPTIONS.length];
}

// colourways of the page, one per hour (the hour's jet repaints the page)
const WAYS = [
  { aDot: 'cyan', aBurst: 'red', bDot: 'red', bBurst: 'cyan' },
  { aDot: 'yellow', aBurst: 'blue', bDot: 'cyan', bBurst: 'red' },
  { aDot: 'red', aBurst: 'cyan', bDot: 'yellow', bBurst: 'blue' },
];
// ------------------------------------------------------------ timing and places
const ACT0 = 57.7, IMPACT = 59.0, SH_END = 59.85;
// the hour's jet: crosses right to left from J0 to J1, fires at JF
const J0 = 56.4, J1 = 58.6, JF = 57.3;
const jetX = (s) => 178 - ((s - J0) / (J1 - J0)) * 300, jetY = (s) => 3 + (s - J0) * 3;
const DEFER = [];
let imp = IMPACT;                            // this turn's impact (the hour's comes later, to keep the blank short)
const HX = [5, 35], HY = [22, 18], MXs = [97, 121], MYs = [7, 5];
const CLIP_A = [3, 3, 75, 77], CLIP_B = [72, 3, 157, 42], CLIP_C = [70, 47, 157, 77], CW = 92;

export default {
  name: 'Whaam!',
  blurb: 'A 1960s comic page: the time is sound-effect lettering in Ben-Day dots, and each minute the cast knocks it out. POW!',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, t = ctx.t, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    shardOps = 0;
    const P = palette(ctx.night), buf = g.buf;
    const nx = clockFields(new Date(ctx.date.getTime() + 60000)), pv = clockFields(new Date(ctx.date.getTime() - 60000));
    const nowD = f.hh + f.mm, nextD = nx.hh + nx.mm, prevD = pv.hh + pv.mm;
    const late = s >= 50, early = s < 3;
    const hourAhead = late && nx.h !== f.h, hourPast = early && pv.h !== f.h;
    imp = hourAhead || hourPast ? 59.2 : IMPACT;

    // ---- the cast panel: this minute's scene, sliding in after the turn
    const scNow = sceneOf(mk, f.m), scPrev = sceneOf(mk - 1, pv.m);
    const sl = early ? ease.inOutQuad(progress(s, 0.4, 2.2)) : 1;
    const oxOld = C_X0 - sl * CW, oxNew = C_X0 + (1 - sl) * CW, slideX = sl < 1 ? Math.round(oxNew - 4) : -1;

    // ---- the colourway, repainted by the hour's jet
    let wayOld = WAYS[f.h % 3], wayNew = wayOld, wipe = 999, bigJet = -999;
    if (hourAhead) {
      wayNew = WAYS[nx.h % 3];
      if (s >= J0) {
        bigJet = jetX(s);
        wipe = s < J1 ? Math.max(-1, Math.round(bigJet - 8)) : -1;
      }
    }

    // ---- the page: ground dots, bursts, action lines (one integer pass)
    const wob = sin(t * 0.8) * 0.75 + 0.75, wob2 = cos(t * 0.57) * 0.75 + 0.75;
    const phx = (wob * 4) | 0, phy = (wob2 * 4) | 0, qo = (((phy & 3) << 2) | (phx & 3)) * 32, ix = phx >> 2, iy = phy >> 2;
    const DA = DOT[1], DB = DOT[0];
    const rotA = (t * 3) | 0, rotB = 256 - ((t * 4) | 0), pulse = 1 + 0.03 * sin(t * 5);
    const PA = new Uint8Array(256), PB = new Uint8Array(256);
    for (let a = 0; a < 256; a++) { PA[a] = Math.min(255, PROF_A[(a + rotA) & 255] * pulse) | 0; PB[a] = Math.min(255, PROF_B[(a + rotB) & 255] * pulse) | 0; }
    const flow = (t * 40) | 0, fast = (t * 120) | 0;
    const rA0 = P.ramp[wayOld.aDot], rA1 = P.ramp[wayNew.aDot], bA0 = P[wayOld.aBurst], bA1 = P[wayNew.aBurst];
    const rB0 = P.ramp[wayOld.bDot], rB1 = P.ramp[wayNew.bDot], bB0 = P[wayOld.bBurst], bB1 = P[wayNew.bBurst];
    const sc0 = sl < 1 ? scPrev : scNow, sc1 = scNow;
    const rC0 = P.ramp[SCENE_INK[sc0]], rC1 = P.ramp[SCENE_INK[sc1]], dC0 = DOT[SCENE_DOT[sc0]], dC1 = DOT[SCENE_DOT[sc1]];
    const xo0 = Math.round(sl < 1 ? oxOld : C_X0), xo1 = Math.round(sl < 1 ? oxNew : C_X0);
    const ink = P.ink, white = P.white;
    const G2 = new Int16Array(W);
    for (let x = 0; x < W; x++) G2[x] = Math.round(g2y(x));
    for (let y = 3; y < 77; y++) {
      const gx = g1x(y) | 0, dRow = ((y - iy) & 7) * 4, sp = SPEED[y];
      for (let x = 3; x < 157; x++) {
        const i = y * W + x, nw = x >= wipe;
        if (x < gx) {
          const r = MAP_A.R2[i], a = MAP_A.A[i], p = PA[a];
          if (r < p - 4) buf[i] = nw ? bA1 : bA0;
          else if (r < p) buf[i] = ink;
          else if (LINES_A[a] && r > p + 6 && ((r - flow) & 31) < 12) buf[i] = ink;
          else buf[i] = (nw ? rA1 : rA0)[DA[qo + dRow + ((x - ix) & 3)]];
        } else if (y < G2[x]) {
          const r = MAP_B.R2[i], a = MAP_B.A[i], p = PB[a];
          if (r < p - 4) buf[i] = nw ? bB1 : bB0;
          else if (r < p) buf[i] = ink;
          else buf[i] = (nw ? rB1 : rB0)[DB[qo + dRow + ((x - ix) & 3)]];
        } else {
          const L = x >= slideX, sc = L ? sc1 : sc0, xl = x - (L ? xo1 : xo0);
          if (sc === 0 && sp >= 0 && ((xl + sp + fast) & 127) < 34) buf[i] = white;
          else buf[i] = (L ? rC1 : rC0)[(L ? dC1 : dC0)[qo + dRow + ((xl - ix) & 3)]];
        }
      }
    }
    g.cost.px += 154 * 74; g.cost.box += 154 * 74 * 7;
    // ---- the cast
    const act = late && !hourAhead && s >= ACT0 ? s - ACT0 : late && hourAhead && s >= ACT0 ? s - ACT0 : -1;
    let jM = 3;
    for (let j = 2; j < 4; j++) if (nextD[j] !== nowD[j]) { jM = j; break; }
    const tx = MXs[jM - 2] + MIN.w / 2, ty = MYs[jM - 2] + 16;
    g.clip(CLIP_C[0], CLIP_C[1], CLIP_C[2] - CLIP_C[0], CLIP_C[3] - CLIP_C[1]);
    if (sl < 1) { scene(g, scPrev, oxOld, t, -1, tx, ty); scene(g, scNow, oxNew, t, -1, tx, ty); }
    else scene(g, scNow, C_X0, t, act, hourAhead ? 20 : tx, hourAhead ? 30 : ty);
    g.unclip();

    // ---- the numerals: at rest, flying apart after the blow, slamming in after :00
    const slams = [];
    const order = [0, 1, 2, 3].filter((j) => early && prevD[j] !== nowD[j]);
    for (let j = 0; j < 4; j++) {
      const S = j < 2 ? HOUR : MIN, X = j < 2 ? HX[j] : MXs[j - 2], Y = j < 2 ? HY[j] : MYs[j - 2], clip = j < 2 ? CLIP_A : CLIP_B;
      if (j < 2) continue;                           // hours are drawn after the borders (they break the frame)
      drawSlot(g, S, +nowD[j], X, Y, clip, P, s, late && nextD[j] !== nowD[j], order.indexOf(j), hourAhead, tx, ty, mk + j, slams);
    }

    // ---- panel borders and gutters (AA on the slanted edges)
    borders(g, P, slideX >= 0 ? oxNew : -1);

    for (let j = 0; j < 2; j++) drawSlot(g, HOUR, +nowD[j], HX[j], HY[j], CLIP_A, P, s, late && nextD[j] !== nowD[j], order.indexOf(j), hourAhead, BA[0], BA[1], mk + j, slams);

    // ---- the caption: typed out after the turn, erased before the next
    const cap = captionOf(f), n = s < 50 ? Math.floor((s - 0.7) * 18) : Math.floor((59.3 - s) * 24);
    const nn = clamp(n, 0, cap.length), cw = Math.max(12, textWidth(cap.slice(0, Math.max(1, nn))) + 6);
    g.fillRect(3, 3, cw + 1, 10, P.c.ink); g.fillRect(3, 3, cw, 9, P.c.yellow);
    if (nn > 0) letter(g, cap, 6, 5, P.c.ink, { n: nn });

    // ---- the blows, which break out of their panels
    if (act >= 0 && !hourAhead) blow(g, scNow, act, s, t, tx, ty, P);
    if (late && !hourAhead && s >= IMPACT && s < SH_END) {
      const e = s - IMPACT, k = e < 0.15 ? ease.outBack(e / 0.15) : 1 - ease.inQuad(progress(e, 0.85, 1.05));
      if (k > 0.02) sfx(g, SFX[scNow], tx, ty, k, mk, P);
    }

    // ---- KA-CHUNK when a new numeral lands
    for (const [x, y, e] of slams) {
      const word = 'KA-CHUNK!', w = textWidth(word);
      const nn = e < 0.9 ? Math.floor(e * 40) : Math.floor((1.25 - e) * 40);
      if (nn > 0) letter(g, word, clamp(x - w / 2, 4, 155 - w), y, P.c.yellow, { n: nn, ink: P.c.ink, skew: 0.25 });
    }

    // ---- the hour: the big jet crosses the page, its rocket goes WHAAM! on the hours
    if (hourAhead && s >= J0 && s < J1) jet(g, bigJet, jetY(s), t, { s: 1.6, flip: true, a: 0.1 });
    if (hourAhead && s >= JF && s < imp) {
      const u = ease.inQuad(progress(s, JF, imp));
      const x0 = jetX(JF) - 66, y0 = jetY(JF) + 6;
      const mx = x0 + (BA[0] - x0) * u, my = y0 + (BA[1] - y0) * u;
      for (let k = 6; k >= 1; k--) {
        const uk = u - k * 0.06;
        if (uk < 0) continue;
        const px = x0 + (BA[0] - x0) * ease.inQuad(uk), py = y0 + (BA[1] - y0) * ease.inQuad(uk), r = 1.5 + k * 0.5;
        g.fillCircle(px, py, r + 1, P.c.ink, { aa: true }); g.fillCircle(px, py, r, P.c.white, { aa: true });
      }
      missile(g, mx, my, Math.atan2(BA[1] - y0, BA[0] - x0));
    }
    const ex = hourAhead && s >= imp ? s - imp : hourPast && s < 0.4 ? s + 60 - imp : -1;
    if (ex >= 0) {
      const k = ex < 0.18 ? ease.outBack(ex / 0.18) : 1 - ease.inQuad(progress(ex, 0.55, 0.92));
      if (k > 0.02) whaam(g, k, t, P);
    }
    for (const a of DEFER) shatter(g, ...a);
    DEFER.length = 0;
    if (shardOps) g.cost.box += shardOps;
  },
};

/** One numeral slot through its minute: rest, shatter (before :00), slam (after). */
function drawSlot(g, S, d, X, Y, clip, P, s, leaving, slamIdx, hourAhead, ix, iy, seed, slams) {
  if (leaving && s >= imp) {
    if (s < SH_END) DEFER.push([S, d, X, Y, (s - imp) / (SH_END - imp), ix, iy, seed, P, S === HOUR ? [3, 3, 157, 77] : clip]);
    return;
  }
  if (slamIdx >= 0) {
    const e = s - 0.13 * slamIdx;
    if (e < 0) return;
    const FALL = 0.28;
    if (e < FALL) {
      const u = e / FALL;
      numeral(g, S, d, X, Y - (S.h + 20) * (1 - u * u), P, clip, 1.12);
      return;
    }
    const q = progress(e, FALL, FALL + 0.3), sy = 1 - 0.2 * Math.sin(Math.PI * q) * (1 - q * 0.5);
    numeral(g, S, d, X, Y, P, clip, sy);
    if (e < FALL + 1.25 && slamIdx === 0) slams.push([X + S.w / 2, Y + S.h - 1, e - FALL]);
    return;
  }
  numeral(g, S, d, X, Y, P, clip);
}
/** The actor's blow, from the cast panel up into the minutes: drawn over the page. */
function blow(g, sc, act, s, t, tx, ty, P) {
  const [mx, my] = muzzle(sc, C_X0, t);
  g.clip(3, 3, 154, 74);
  if (sc === 0 && act >= 0.4 && act < 2.3) {
    // the rocket and its trail of flat smoke puffs
    const u = progress(act, 0.4, IMPACT - ACT0), fade = progress(act, IMPACT - ACT0, 2.3);
    const at = (v) => { const e = ease.inQuad(v); return [mx + (tx - mx) * e, my + (ty - my) * e]; };
    for (let k = 7; k >= 1; k--) {
      const uk = u - k * 0.1;
      if (uk < 0) continue;
      const [px, py] = at(uk), r = (1.2 + k * 0.35) * (1 - fade);
      if (r < 0.4) continue;
      g.fillCircle(px, py, r + 1, P.c.ink, { aa: true }); g.fillCircle(px, py, r, P.c.white, { aa: true });
    }
    if (u < 1) { const [px, py] = at(u); missile(g, px, py, Math.atan2(ty - my, tx - mx)); }
  } else if (sc === 1 && act >= 1.1 && act < 1.6) {
    // the zap: a jagged beam, re-drawn every frame
    const pts = [[mx, my]], n = 6, fr = (t * 60) | 0;
    for (let k = 1; k < n; k++) {
      const u = k / n, j = ((hash(fr, k) % 100) / 100 - 0.5) * 7;
      pts.push([mx + (tx - mx) * u - (ty - my) / 40 * j, my + (ty - my) * u + (tx - mx) / 40 * j]);
    }
    pts.push([tx, ty]);
    g.stroke(pts, 4, P.c.ink, { aa: true });
    g.stroke(pts, 2, P.c.yellow, { aa: true });
  } else if (sc === 2 && act >= 0.9 && act < 2.2) {
    // the fist shoots up across the gutter, holds, and goes back
    const rx = C_X0 + 42, ry0 = C_TOP + 16, ry1 = C_TOP + 9;
    let x, y;
    if (act < IMPACT - ACT0) { const u = ease.inQuad(progress(act, 0.9, IMPACT - ACT0)); x = rx + (tx - rx) * u; y = ry0 + (ty + 4 - ry0) * u; }
    else if (act < 1.6) { x = tx; y = ty + 4; }
    else { const u = ease.inOutQuad(progress(act, 1.6, 2.2)); x = tx + (rx - tx) * u; y = ty + 4 + (ry1 - ty - 4) * u; }
    if (act < IMPACT - ACT0 + 0.1) for (let k = -1; k <= 1; k++) g.thickLine(x + k * 5, y + 14, x + k * 5, y + 30, 1, P.c.ink, { aa: true });
    fist(g, x, y);
  }
  g.unclip();
}

/** A sound effect: a burst with the word in it, popped to size k. */
function sfx(g, word, x, y, k, seed, P) {
  const sc = word.length <= 6 ? 2 : 1, w = textWidth(word, sc);
  const rx = (w / 2 + 8) * k, ry = (sc * 6 / 2 + 8) * k;
  x = clamp(x, rx + 2, 158 - rx); y = clamp(y, ry + 2, 78 - ry);
  burst(g, x, y, rx, ry, 11, seed % 7, P.c.yellow, P.c.white);
  if (k > 0.7) letter(g, word, x - w / 2 + 1, y - sc * 3, P.c.red, { scale: sc, ink: P.c.ink, skew: 0.12 });
}

/** The hour's explosion over the hours panel (after Whaam!). */
function whaam(g, k, t, P) {
  const [x, y] = BA;
  burst(g, x, y + 2, 44 * k, 36 * k, 17, 1.3 + t * 0.4, P.c.red, P.c.yellow);
  burst(g, x - 2, y + 1, 18 * k, 14 * k, 9, 0.4 - t * 0.6, P.c.white);
  if (k > 0.7) {
    const w = textWidth('WHAAM!', 2);
    letter(g, 'WHAAM!', x - w / 2, y - 6, P.c.red, { scale: 2, ink: P.c.ink, skew: 0.15, clip: [0, 0, 160, 80] });
  }
}

/** The page margin, the panel borders and the gutters (the slanted edges anti-aliased). */
function borders(g, P, slideX) {
  const ink = P.c.ink, paper = P.c.paper;
  g.fillRect(0, 0, W, 1, paper); g.fillRect(0, H - 1, W, 1, paper);
  g.fillRect(0, 0, 1, H, paper); g.fillRect(W - 1, 0, 1, H, paper);
  g.fillRect(1, 1, W - 2, 2, ink); g.fillRect(1, H - 3, W - 2, 2, ink);
  g.fillRect(1, 1, 2, H - 2, ink); g.fillRect(W - 3, 1, 2, H - 2, ink);
  const xg = Math.floor(g1x(44));
  for (let x = xg; x < W - 3; x++) spanV(g, x, g2y(x) - 3.5, g2y(x) + 3.5, ink);
  for (let y = 1; y < H - 1; y++) { const c = g1x(y); spanH(g, y, c - 3.5, c + 3.5, ink); }
  for (let y = 1; y < H - 1; y++) { const c = g1x(y); spanH(g, y, c - 1.5, c + 1.5, paper); }
  for (let x = xg + 1; x < W - 1; x++) spanV(g, x, g2y(x) - 1.5, g2y(x) + 1.5, paper);
  if (slideX >= 0) {
    // the next panel of the strip sliding in, with its own gutter
    const y0 = Math.round(g2y(slideX)) + 2, c = Math.round(slideX - 4);
    g.fillRect(c - 3, y0, 7, H - 1 - y0, ink);
    g.fillRect(c - 1, y0 - 1, 3, H - y0, paper);
  }
}

/** Fill row y from x = a to x = b (continuous), blending the two end pixels by coverage. */
function spanH(g, y, a, b, c) {
  const ia = Math.floor(a), ib = Math.floor(b);
  if (ia === ib) { g.pixel(ia, y, c, { a: b - a }); return; }
  g.pixel(ia, y, c, { a: ia + 1 - a });
  if (ib > ia + 1) g.fillRect(ia + 1, y, ib - ia - 1, 1, c);
  if (b > ib) g.pixel(ib, y, c, { a: b - ib });
}
function spanV(g, x, a, b, c) {
  const ia = Math.floor(a), ib = Math.floor(b);
  g.pixel(x, ia, c, { a: ia + 1 - a });
  if (ib > ia + 1) g.fillRect(x, ia + 1, 1, ib - ia - 1, c);
  if (b > ib) g.pixel(x, ib, c, { a: b - ib });
}
