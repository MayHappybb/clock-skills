// Su Song's Clock Tower (水运仪象台), as a Song ruled-line painting (界画)
// on old silk, cut away so the machine shows.
//
// Kaifeng, 1092. On the left the wall of the wheel house is cut open: a
// tank pours a thin stream into the scoops of a great water wheel, and the
// wheel is held by an escapement, the "heavenly scale" (天衡) beam over its
// top. A scoop fills for four and a half seconds; when it is heavy enough
// the beam kicks, the lock lifts, and the whole wheel lurches one scoop
// clockwise and is caught again. Twelve scoops, five seconds each: the
// wheel turns once a minute, and the red-lacquered scoop stands at the top
// on the minute, at 3 o'clock on the quarter: it is the second hand, in
// water. The full scoops ride down the right side and spill into the sump.
//
// The same drive turns everything else, so the rhythm of the face is the
// escapement's: fill, kick, lurch, settle. The armillary sphere on the roof
// steps round with it; the puppets in the doors jolt with it.
//
// How to read the time: the tower's two side doors each frame a wooden
// jack holding a lacquered placard. Left door: the hour (24 h). Right
// door: the minute. The numerals are painted in the Song manner (宋体). The
// gilt plaque under the eaves names the double hour the old way (巳初 is
// 09:00-09:59, 巳正 10:00-10:59). At the minute the doors swing shut on the
// old jack, the jack wheel behind them turns, and the doors open on the
// next one still gliding into place (the door is empty, never wrong, around
// :00). On the hour the hour door does the same, the plaque turns over, and
// the drummer in the middle door beats the drum once for each hour (1-12).
// At every ke (刻, a hundredth of a day: 14 min 24 s, so at odd moments
// like 10:04:48) he turns and strikes the bell.
//
// Look: mineral pigments on aged silk: cinnabar, azurite, malachite, lead
// white, gold, ink-grey tiles; fine ink rules for the architecture (hard
// pixels, it is a ruled-line painting), anti-aliased only for what turns
// (the wheel, the beam, the armillary rings, the water). The silk browns at
// its edges; a collector's seal sits in the corner. The day is the
// painting's light: clouds (祥云) drift by day, the silk goes indigo after
// dusk, lanterns and the doors glow, and the moon comes out.
//
// Cost: the silk is one cached layer; everything else is kit shapes. No
// per-pixel code in the frame.

import { Gfx, hex, mix, scale, clamp, lerp, progress, ease, sin, cos, rand, noise2, clockFields, TAU } from '../js/kit.js';
import { DIGITS, HANZI, shichen } from './suisong-glyphs.js';

// ------------------------------------------------------------ palette
const SILK = hex('d8c49c');
const INK = hex('2c2118');
const INK_SOFT = hex('6a5846');
const CINNABAR = hex('b5432e');
const CINNABAR_DK = hex('843022');
const AZURITE = hex('34588a');
const AZURITE_LT = hex('86a6c6');
const MALACHITE = hex('4a8a6c');
const MALACHITE_LT = hex('92c2a0');
const LEAD = hex('f0e8d6');
const GOLD = hex('d2a646');
const BRONZE = hex('a07a36');
const WOOD = hex('94653a');
const WOOD_DK = hex('5e3c22');
const TILE = hex('5a6068');
const TILE_LT = hex('848a8e');
const STONE = hex('bdb197');
const WATER = hex('5f97c2');
const WATER_LT = hex('cfe4ee');
const NIGHT_INK = hex('1b2346');

const W = 160, H = 80;

// ------------------------------------------------------------ the silk, once
const SILK_LAYER = (() => {
  const s = new Gfx(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // edge browning, slow age stains, then the weave (warp and weft)
      const ex = Math.min(x, W - 1 - x) / 22, ey = Math.min(y, H - 1 - y) / 14;
      const edge = 1 - clamp(Math.min(ex, ey), 0, 1);
      const stain = noise2(x / 23, y / 17, 7) * 0.6 + noise2(x / 7, y / 6, 3) * 0.4;
      let c = mix(SILK, hex('9c8058'), edge * edge * 0.55 + Math.max(0, stain - 0.62) * 0.5);
      const weave = ((y & 1) ? 0.03 : 0) + ((x & 1) ? -0.02 : 0.01) + (rand(x, y, 11) - 0.5) * 0.05;
      c = scale(c, 1 + weave);
      // two old fold creases
      if (x === 41 || x === 119) c = scale(c, 0.95);
      s.pixel(x, y, c, { dither: true });
    }
  return s;
})();

// ------------------------------------------------------------ geometry
const WH = { cx: 30, cy: 51, rim: 20, out: 25 };       // the water wheel
const STREAM_X = 52.5, STREAM_TOP = 32, STREAM_BOT = 48;
const PIVOT = [30, 22];                                // the heavenly scale's pivot
const DOOR_H = { x: 67, y: 36, w: 26, h: 30 };         // hour door
const DOOR_M = { x: 129, y: 36, w: 26, h: 30 };        // minute door
const DOOR_C = { x: 98, y: 48, w: 26, h: 18 };         // drummer's door
const PLAQUE = { x: 96, y: 30, w: 30, h: 17 };
const ARM = { cx: 111, cy: 10, r: 8.5 };               // armillary sphere
const KE = 864;                                        // seconds in a ke (1/100 day)

const bump = (v, c, w) => Math.max(0, 1 - Math.abs(v - c) / w);

// ------------------------------------------------------------ helpers
function polyline(g, pts, w, c, o) {
  for (let i = 1; i < pts.length; i++) g.thickLine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w, c, o);
}

/** A hip roof seen from the front: ridge, slope, eave with upturned corners. */
function roof(g, P, x0, x1, yTop, yEave, inset, { curlL = true, curlR = true } = {}) {
  const pts = [[x0 + inset, yTop], [x1 - inset, yTop], [x1 - 1, yEave - 3], [x1 + (curlR ? 2 : 0), yEave - (curlR ? 4 : 1)],
    [x1 - 1, yEave + 1], [x0 + 1, yEave + 1], [x0 - (curlL ? 2 : 0), yEave - (curlL ? 4 : 1)], [x0 + 1, yEave - 3]];
  g.fillPolygon(pts, P.tile);
  // tile rows: ink-grey lines down the slope
  for (let x = x0 + 3; x < x1 - 1; x += 3) {
    const u = (x - x0) / (x1 - x0);
    const xt = lerp(x0 + inset, x1 - inset, u);
    g.line(Math.round(xt), yTop + 1, x, yEave - 1, P.tileLt);
  }
  g.hline(x0 + inset, yTop, x1 - x0 - 2 * inset, P.ink);                 // ridge
  g.fillRect(x0 + inset - 1, yTop - 1, 2, 2, P.ink);                      // ridge-end ornaments (鸱吻)
  g.fillRect(x1 - inset - 1, yTop - 1, 2, 2, P.ink);
  g.hline(x0, yEave, x1 - x0, P.ink);                                     // eave line
  g.hline(x0 + 1, yEave + 1, x1 - x0 - 2, P.woodDk);
  g.line(x0 + 1, yEave - 3, x0 + inset, yTop, P.ink);                     // hips
  g.line(x1 - 1, yEave - 3, x1 - inset, yTop, P.ink);
  if (curlL) g.line(x0 - 2, yEave - 4, x0 + 1, yEave, P.ink);
  if (curlR) g.line(x1 + 2, yEave - 4, x1 - 1, yEave, P.ink);
}

/** A jack: Song official with the long-winged futou hat, holding a placard with two numerals. */
function jack(g, P, cx, top, robe, digits, lift) {
  const x = Math.round(cx), y = Math.round(top);
  // hat: crown and the long horizontal wings
  g.fillRect(x - 2, y, 5, 3, P.ink);
  g.hline(x - 8, y + 2, 17, P.ink);
  g.pixel(x - 9, y + 1, P.ink); g.pixel(x + 9, y + 1, P.ink);
  // face
  g.fillRect(x - 2, y + 3, 5, 4, P.leadLit);
  g.pixel(x - 1, y + 4, P.ink); g.pixel(x + 1, y + 4, P.ink);
  g.pixel(x, y + 6, P.cheek);
  // shoulders and sleeves
  g.fillRect(x - 7, y + 7, 15, 3, robe);
  g.hline(x - 7, y + 7, 15, P.ink, { a: 0.5 });
  // robe hem and boots under the placard
  g.fillRect(x - 6, y + 26, 13, 2, robe);
  g.fillRect(x - 4, y + 28, 3, 1, P.ink); g.fillRect(x + 2, y + 28, 3, 1, P.ink);
  // the placard: lead white on a red lacquer edge, ink border
  const py = y + 8 - lift;
  g.fillRect(x - 12, py, 25, 19, P.ink);
  g.fillRect(x - 11, py + 1, 23, 17, P.cinnabarDk);
  g.fillRect(x - 10, py + 2, 21, 15, P.leadLit);
  g.blit(DIGITS[digits[0]], x - 10, py + 2, { c: P.ink });
  g.blit(DIGITS[digits[1]], x + 2, py + 2, { c: P.ink });
  // hands gripping the top corners
  g.fillRect(x - 12, py + 1, 2, 2, P.leadLit); g.fillRect(x + 11, py + 1, 2, 2, P.leadLit);
}

/** Lattice door leaves (格子门), `shut` 0 open .. 1 closed. */
function leaves(g, P, d, shut) {
  const half = d.w / 2;
  const wl = Math.max(2, Math.round(2 + (half - 2) * shut));
  for (const side of [0, 1]) {
    const x = side ? d.x + d.w - wl : d.x;
    g.fillRect(x, d.y, wl, d.h, P.cinnabar);
    if (wl > 4) {
      // paper lattice in the upper two thirds, a plain panel below
      const lh = Math.round(d.h * 0.62);
      g.fillRect(x + 1, d.y + 2, wl - 2, lh - 2, P.lead);
      for (let yy = d.y + 4; yy < d.y + lh; yy += 3) g.hline(x + 1, yy, wl - 2, P.inkSoft);
      for (let xx = x + 3; xx < x + wl - 1; xx += 3) g.vline(xx, d.y + 2, lh - 2, P.inkSoft);
      g.fillRect(x + 2, d.y + lh + 2, wl - 4, d.h - lh - 5, P.cinnabarDk);
    }
    g.rect(x, d.y, wl, d.h, P.ink);
  }
}

/** The plaque, drawn into its own small canvas, cached by its text. */
const plaqueCache = new Map();
function plaqueLayer(text, P) {
  const key = text + P.key;
  if (plaqueCache.has(key)) return plaqueCache.get(key);
  const c = new Gfx(PLAQUE.w, PLAQUE.h);
  c.fillRect(0, 0, PLAQUE.w, PLAQUE.h, P.ink);
  c.fillRect(1, 1, PLAQUE.w - 2, PLAQUE.h - 2, P.gold);
  c.fillRect(2, 2, PLAQUE.w - 4, PLAQUE.h - 4, P.azurite);
  c.blit(HANZI[text[0]], 3, 3, { c: P.gold });
  c.blit(HANZI[text[1]], 16, 3, { c: P.gold });
  if (plaqueCache.size > 8) plaqueCache.clear();
  plaqueCache.set(key, c);
  return c;
}

// ------------------------------------------------------------ the face
export default {
  name: 'Su Song',
  blurb: "Su Song's 1092 water-driven clock tower as a Song silk painting: the escapement lurches the wheel every 5 s; jacks in the doors hold the hour and minute.",
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec;
    const tod = f.h * 3600 + f.m * 60 + sec;
    const th = tod / 3600;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);

    // ---- the painting's light: dusk and night darken the silk to indigo
    const dark = th < 4.8 ? 1 : th < 6.8 ? 1 - (th - 4.8) / 2 : th < 17.8 ? 0 : th < 19.8 ? (th - 17.8) / 2 : 1;
    const warm = Math.max(bump(th, 6.2, 1.2), bump(th, 18.2, 1.3));
    const tone = (c) => mix(mix(c, hex('e08a52'), 0.14 * warm), mix(scale(c, 0.42), NIGHT_INK, 0.35), dark * 0.82);
    const lit = clamp((dark - 0.25) / 0.5, 0, 1);    // lanterns and door lamps
    const P = {
      key: Math.round(dark * 20) + ':' + Math.round(warm * 10),
      ink: tone(INK), inkSoft: tone(INK_SOFT), cinnabar: tone(CINNABAR), cinnabarDk: tone(CINNABAR_DK),
      azurite: tone(AZURITE), azuriteLt: tone(AZURITE_LT), malachite: tone(MALACHITE), malachiteLt: tone(MALACHITE_LT),
      lead: tone(LEAD), gold: tone(GOLD), bronze: tone(BRONZE), wood: tone(WOOD), woodDk: tone(WOOD_DK),
      tile: tone(TILE), tileLt: tone(TILE_LT), stone: tone(STONE), water: tone(WATER), waterLt: tone(WATER_LT),
      cheek: tone(hex('e0a090')), silk: tone(SILK),
    };
    // things lit from inside keep their colour at night
    P.leadLit = mix(P.lead, LEAD, lit * 0.8);

    // ---- the escapement's clock: one scoop every five seconds
    const steps = Math.floor(tod / 5), t5 = tod - steps * 5;
    const KICK = 4.3, L0 = 4.45;
    const e = t5 < L0 ? 0 : ease.outBack(progress(t5, L0, 5));        // the lurch, with a catch
    const fill = progress(t5, 0.15, KICK);
    const jolt = t5 > L0 && t5 < L0 + 0.22 ? 1 : 0;                    // the tower shudders

    // ---- silk, light, sky
    g.draw(SILK_LAYER, 0, 0);
    if (dark > 0 || warm > 0) {
      g.fillRect(0, 0, W, H, mix(hex('e08a52'), NIGHT_INK, dark), { a: Math.min(0.85, 0.14 * warm + dark * 0.78), dither: true });
    }
    // stars and moon at night
    if (dark > 0.4) {
      const a = (dark - 0.4) / 0.6;
      for (let i = 0; i < 14; i++) {
        const sx = Math.floor(rand(i, 1, 5) * 160), sy = Math.floor(rand(i, 2, 5) * 22);
        const tw = 0.5 + 0.5 * sin(tod * (1.3 + rand(i, 3) * 2) + i);
        g.pixel(sx, sy, mix(P.silk, hex('f4ecd0'), 0.6 * a * tw));
      }
      g.fillCircle(145, 9, 4.5, mix(P.silk, hex('f6efd8'), a), { aa: true });
      g.fillCircle(147, 8, 4, mix(P.silk, hex('f6efd8'), a * 0.15), { aa: true });
    }
    // clouds: auspicious scrolls drifting left, behind the buildings
    for (let k = 0; k < 3; k++) {
      const span = W + 45;
      const x = ((k * span / 3 + k * 9 - tod * 0.45) % span + span) % span - 22;
      const y = [4.5, 12, 7][k] + sin(tod * 0.1 + k * 2) * 1.2;
      cloud(g, P, x, y, [0.9, 1.1, 0.75][k], dark);
    }
    // the collector's seal and a line of faded inscription
    g.fillRect(3, 2, 7, 7, P.cinnabar, { a: 0.85 });
    g.fillRect(4, 3, 2, 2, P.silk); g.fillRect(7, 3, 2, 1, P.silk); g.fillRect(4, 6, 1, 2, P.silk); g.fillRect(6, 6, 3, 1, P.silk); g.pixel(8, 7, P.silk);
    for (let i = 0; i < 3; i++) g.fillRect(13, 2 + i * 3, 2, 2, P.inkSoft, { a: 0.55 });

    // ================= the wheel house, cut away
    const interior = mix(P.silk, P.ink, 0.22);
    g.fillRect(1, 18, 61, 56, interior);
    g.fillRect(0, 18, 3, 57, P.wood); g.vline(3, 18, 57, P.ink);                 // the cut post
    for (let y = 20; y < 74; y += 3) g.pixel(1, y, P.woodDk);
    g.hline(3, 19, 59, P.woodDk);                                                // tie beam
    roof(g, P, 0, 62, 9, 17, 7, { curlR: false });
    // the tank and its spout
    g.fillRect(48, 20, 11, 11, P.wood);
    g.rect(48, 20, 11, 11, P.ink);
    g.hline(48, 23, 11, P.ink); g.hline(48, 27, 11, P.ink);
    g.fillRect(49, 21, 9, 1, P.water);
    g.fillRect(51, 29, 2, 1, P.ink); g.fillRect(51, 30, 3, 2, P.bronze); g.rect(51, 30, 3, 2, P.ink);
    // the sump
    g.fillRect(3, 74, 59, 6, P.water);
    for (let i = 0; i < 6; i++) {
      const xx = ((i * 11 - tod * 3) % 59 + 59) % 59 + 3;
      g.hline(Math.round(xx), 76 + (i % 3), 3, P.waterLt, { a: 0.7 });
    }
    g.hline(3, 74, 59, P.ink);

    // the wheel: rim, spokes, scoops; clockwise one scoop a lurch
    const rot = (steps + e) * (TAU / 12);
    const { cx, cy } = WH;
    for (let i = 0; i < 12; i++) {
      const a = rot + i * TAU / 12;
      const sa = sin(a), ca = cos(a);
      g.thickLine(cx + sa * 3, cy - ca * 3, cx + sa * WH.rim, cy - ca * WH.rim, 1.4, P.woodDk, { aa: true });
    }
    g.ring(cx, cy, WH.rim - 1.6, WH.rim + 0.8, P.ink, { aa: true });
    g.ring(cx, cy, WH.rim - 0.9, WH.rim + 0.1, P.wood, { aa: true });
    g.ring(cx, cy, 10.2, 11.4, P.woodDk, { aa: true });
    for (let i = 0; i < 12; i++) {
      const a = rot + i * TAU / 12;
      const q = (((i + steps) % 12) + 12) % 12 + e;                      // slot: 0 top, 3 under the stream, 6 bottom
      let water = 0;
      if (q >= 3 && q < 4) water = q === 3 ? fill : 1;
      else if (q >= 4 && q < 5) water = 1;
      else if (q >= 5 && q < 6) water = 1 - (q - 5);
      scoop(g, P, a, i === 0, water);
    }
    g.fillCircle(cx, cy, 4, P.ink, { aa: true });
    g.fillCircle(cx, cy, 3, P.gold, { aa: true });
    g.fillCircle(cx, cy, 1, P.ink, { aa: true });

    // spilled water falling from the scoop going over the bottom
    if (t5 > L0 + 0.05) {
      const k = progress(t5, L0 + 0.05, 5);
      const sx = cx + 6 - k * 4;
      g.thickLine(sx, cy + 23, sx - 1, cy + 23 + 3 * k, 1.6, P.water, { aa: true, a: 1 - k * 0.5 });
    }
    // the stream: thin, never still
    g.fillRect(STREAM_X - 1, STREAM_TOP, 2, STREAM_BOT - STREAM_TOP, P.water);
    for (let y = STREAM_TOP; y < STREAM_BOT; y++) {
      if (((y * 7 - Math.floor(tod * 30)) % 9 + 9) % 9 < 2) g.pixel(Math.floor(STREAM_X) - (y & 1), y, P.waterLt);
    }
    // splash where it lands
    const sp = (tod * 6) % 1;
    g.pixel(STREAM_X - 2 - Math.round(sp * 2), STREAM_BOT - Math.round(sin(sp * Math.PI) * 2), P.waterLt);
    g.pixel(STREAM_X + 1 + Math.round(sp * 2), STREAM_BOT - Math.round(sin(sp * Math.PI + 1) * 2), P.waterLt);

    // the heavenly scale: a beam over the wheel that kicks to free it
    let phi = 0.05 * fill;
    if (t5 >= KICK) phi = lerp(0.05, -0.16, ease.outQuad(progress(t5, KICK, L0)));
    if (t5 >= 4.75) phi = lerp(-0.16, 0, ease.inOutQuad(progress(t5, 4.75, 5)));
    const [px, py] = PIVOT, bc = cos(phi), bs = sin(phi);
    const end = (d) => [px + d * bc, py + d * bs];
    const [lx, ly] = end(-17), [rx, ry] = end(15);
    g.vline(px, 19, 3, P.woodDk);
    g.thickLine(lx, ly, rx, ry, 2, P.ink, { aa: true });
    g.thickLine(lx, ly - 0.3, rx, ry - 0.3, 0.9, P.wood, { aa: true });
    g.fillRect(Math.round(lx) - 1, Math.round(ly) + 1, 4, 4, P.bronze); g.rect(Math.round(lx) - 1, Math.round(ly) + 1, 4, 4, P.ink);
    g.thickLine(rx, ry, rx - 1, ry + 7, 1, P.ink, { aa: true });                 // the link to the lock
    g.thickLine(rx - 1, ry + 7, rx - 3, ry + 8, 1, P.ink, { aa: true });
    g.fillCircle(px, py, 1.3, P.gold, { aa: true });

    // ================= the tower
    // armillary sphere on the open roof terrace, stepping with the wheel
    armillary(g, P, (steps + e) * (TAU / 48), tod);
    // terrace balustrade
    g.fillRect(74, 22, 74, 1, P.woodDk);
    g.hline(74, 18, 74, P.cinnabar); g.hline(74, 19, 74, P.ink);
    for (let x = 74; x <= 147; x += 4) g.vline(x, 19, 3, x % 8 === 2 ? P.ink : P.cinnabar);
    roof(g, P, 62, 158, 22, 29, 10);
    // the bracket sets (斗拱) under the eave
    g.fillRect(62, 30, 97, 3, P.ink);
    for (let x = 63, k = 0; x < 157; x += 4, k++) g.fillRect(x, 30, 3, 2, k & 1 ? P.malachite : P.azurite);
    g.fillRect(62, 33, 97, 2, P.malachite);
    for (let x = 63; x < 157; x += 6) g.fillRect(x, 33, 3, 1, P.malachiteLt);
    g.hline(62, 35, 97, P.ink);
    // walls between the columns
    g.fillRect(65, 36, 29, 30, P.lead);
    g.fillRect(97, 36, 28, 30, P.lead);
    g.fillRect(128, 36, 28, 30, P.lead);
    // columns
    for (const x of [62, 94, 125, 156]) {
      g.fillRect(x, 35, 3, 31, P.cinnabar);
      g.vline(x, 35, 31, P.ink); g.vline(x + 2, 35, 31, P.cinnabarDk);
    }

    // ---- the jacks
    const now = { hh: f.hh, mm: f.mm };
    const nextF = clockFields(new Date(ctx.date.getTime() + 60000));
    const prevF = clockFields(new Date(ctx.date.getTime() - 60000));
    door(g, P, DOOR_H, now.hh, P.cinnabar, nextF.hh !== now.hh, prevF.hh !== now.hh, sec, jolt, lit);
    door(g, P, DOOR_M, now.mm, P.malachite, true, true, sec, jolt, lit);

    // ---- the drummer's door, the drum and the bell
    drummer(g, P, tod, sec, f, jolt, lit);

    // ---- the plaque: turns over on the hour
    const nowText = shichen(f.h), nextText = shichen(nextF.h);
    let pl = plaqueLayer(nowText, P), sy = 1;
    if (nextText !== nowText && sec > 59.5) sy = 1 - ease.inQuad(progress(sec, 59.5, 59.98));
    if (prevF.h !== f.h && sec < 0.6) sy = ease.outBack(progress(sec, 0.05, 0.6));
    if (sy > 0.04) {
      const hh = Math.max(1, Math.round(PLAQUE.h * sy)), top = PLAQUE.y + Math.round((PLAQUE.h - hh) / 2);
      g.fillRect(PLAQUE.x + 4, PLAQUE.y - 2, 1, top - PLAQUE.y + 2, P.ink);         // hanging cords
      g.fillRect(PLAQUE.x + PLAQUE.w - 5, PLAQUE.y - 2, 1, top - PLAQUE.y + 2, P.ink);
      for (let j = 0; j < hh; j++) {
        const src = Math.min(PLAQUE.h - 1, Math.floor(((j + 0.5) / hh) * PLAQUE.h));
        g.clip(PLAQUE.x, top + j, PLAQUE.w, 1);
        g.draw(pl, PLAQUE.x, top + j - src);
        g.unclip();
      }
      // a slow glint across the gilt
      const gx = ((tod * 4) % 90) - 30;
      if (gx > -2 && gx < PLAQUE.w + 2)
        g.fillPolygon([[PLAQUE.x + gx, top], [PLAQUE.x + gx + 3, top], [PLAQUE.x + gx - 1, top + hh], [PLAQUE.x + gx - 4, top + hh]],
          hex('fff4d0'), { a: 0.22 * sy });
    }

    // lanterns under the eave
    for (const lxp of [63, 157]) {
      g.vline(lxp, 30, 2, P.ink);
      if (lit > 0) g.radial(lxp + 0.5, 34, 9, [[0, mix(P.silk, hex('ffb060'), 0.5)], [1, P.silk]], { box: [lxp - 9, 25, 19, 19], a: 0.5 * lit });
      g.fillRoundRect(lxp - 2, 32, 5, 5, 1.5, mix(P.cinnabar, hex('ff7a3a'), lit * 0.8));
      g.hline(lxp - 1, 32, 3, P.gold); g.hline(lxp - 1, 36, 3, P.gold);
      g.pixel(lxp, 37, P.gold);
    }

    // ================= the podium
    g.fillRect(60, 66, 100, 14, P.stone);
    g.hline(60, 66, 100, P.ink);
    g.hline(60, 67, 100, P.woodDk);
    for (let y = 70; y < 80; y += 4) g.hline(60, y, 100, P.inkSoft, { a: 0.6 });
    for (let y = 70, r = 0; y < 80; y += 4, r++)
      for (let x = 62 + (r & 1) * 6; x < 160; x += 12) g.vline(x, y + 1, 3, P.inkSoft, { a: 0.6 });
    // the steps under the drummer's door
    for (let i = 0; i < 3; i++) {
      g.fillRect(100 - i * 3, 68 + i * 4, 22 + i * 6, 4, mix(P.stone, P.lead, 0.4));
      g.hline(100 - i * 3, 68 + i * 4, 22 + i * 6, P.ink);
    }
    g.vline(60, 66, 14, P.ink);
  },
};

function cloud(g, P, x, y, s, dark) {
  const c = mix(hex('f6f0e2'), hex('7880a0'), dark), edge = mix(P.inkSoft, hex('3a4060'), dark);
  const blobs = [[0, 0, 3], [4, -1.5, 3.5], [9, 0, 3], [13, 0.8, 2.2], [-4, 1, 2]];
  for (const [bx, by, r] of blobs) g.fillCircle(x + bx * s, y + by * s, r * s + 0.8, edge, { aa: true, a: 0.6 });
  for (const [bx, by, r] of blobs) g.fillCircle(x + bx * s, y + by * s, r * s, c, { aa: true, a: 0.85 });
  // the scroll's curl and its trailing tail
  g.arc(x + 4 * s, y - 1.5 * s, 1.2 * s, 1.9 * s, 0.5, 4.5, edge, { aa: true, a: 0.7 });
  g.thickLine(x - 5 * s, y + 2.5 * s, x - 13 * s, y + 3.2 * s, 1, edge, { aa: true, a: 0.5 });
}

function scoop(g, P, a, red, water) {
  const { cx, cy, rim, out } = WH;
  const ux = sin(a), uy = -cos(a);          // outward
  const vx = cos(a), vy = sin(a);           // the direction the rim moves (clockwise)
  const p = (r, t) => [cx + ux * r + vx * t, cy + uy * r + vy * t];
  // a cup: the back wall leads, the mouth trails
  const body = [p(rim, -3), p(rim, 3), p(out, 3), p(out, -2)];
  g.fillPolygon(body, P.ink, { aa: true });
  const inner = [p(rim + 0.9, -2.2), p(rim + 0.9, 2.2), p(out - 0.9, 2.2), p(out - 0.9, -1.4)];
  g.fillPolygon(inner, red ? P.cinnabar : P.wood, { aa: true });
  if (water > 0.02) {
    const r1 = rim + 1 + (out - rim - 2) * water;
    g.fillPolygon([p(rim + 1, -1.8), p(rim + 1, 1.8), p(r1, 1.8), p(r1, -1.8)], P.water, { aa: true });
  }
}

function armillary(g, P, theta, tod) {
  const { cx, cy, r } = ARM;
  // stand: a dragon pillar and its cross base
  g.fillRect(cx - 1, cy + r - 1, 3, 4, P.bronze); g.rect(cx - 1, cy + r - 1, 3, 4, P.ink);
  g.fillRect(cx - 5, cy + r + 2, 11, 2, P.ink);
  // the fixed meridian ring
  g.ring(cx, cy, r - 0.6, r + 0.9, P.ink, { aa: true });
  g.ring(cx, cy, r - 0.1, r + 0.4, P.gold, { aa: true });
  // the polar axis leans; rings that turn about it
  const tilt = 0.6, axx = sin(tilt), axy = -cos(tilt), qx = -axy, qy = axx;
  const ring = (rr, phase, c, w) => {
    const k = cos(theta + phase), pts = [];
    for (let i = 0; i <= 16; i++) {
      const u = (i / 16) * TAU, cu = cos(u), su = sin(u);
      pts.push([cx + (axx * cu + qx * su * k) * rr, cy + (axy * cu + qy * su * k) * rr]);
    }
    polyline(g, pts, w, c, { aa: true });
  };
  ring(r - 1.5, 0, P.bronze, 1.1);
  ring(r - 1.5, Math.PI / 2, P.bronze, 1.1);
  // the equator: a fixed tilted ellipse
  const eq = [];
  for (let i = 0; i <= 16; i++) {
    const u = (i / 16) * TAU;
    eq.push([cx + qx * cos(u) * (r - 0.5) + axx * sin(u) * 2.2, cy + qy * cos(u) * (r - 0.5) + axy * sin(u) * 2.2]);
  }
  polyline(g, eq, 1, P.gold, { aa: true });
  // the sighting tube along the axis, and the sun bead riding the turning ring
  g.thickLine(cx - axx * (r + 2), cy - axy * (r + 2), cx + axx * (r + 2), cy + axy * (r + 2), 1.2, P.ink, { aa: true });
  const k = sin(theta);
  g.fillCircle(cx + qx * k * (r - 1.5), cy + qy * k * (r - 1.5), 1.4, mix(P.cinnabar, hex('ff6a3a'), 0.5), { aa: true });
}

/** A side door with its jack: the doors shut on the old jack before :00 and open on the new one after. */
function door(g, P, d, text, robe, leaving, arriving, sec, jolt, lit) {
  // the room behind, lit at night
  g.fillRect(d.x, d.y, d.w, d.h, mix(mix(P.ink, P.woodDk, 0.4), hex('c88a48'), lit * 0.6));
  if (lit > 0) g.radial(d.x + d.w / 2, d.y + 6, 16, [[0, hex('f0b868')], [1, mix(P.ink, P.woodDk, 0.4)]], { box: [d.x, d.y, d.w, d.h], a: 0.45 * lit });
  let dx = 0, shut = 0, show = true, lift = 0;
  if (leaving && sec >= 58.8) {
    dx = -12 * ease.inQuad(progress(sec, 58.8, 59.5));
    shut = ease.inOutQuad(progress(sec, 58.95, 59.55));
    if (sec >= 59.55) show = false;
  }
  if (arriving && sec < 1.6) {
    shut = 1 - ease.outQuad(progress(sec, 0.15, 0.7));
    dx = 12 * (1 - ease.outBack(progress(sec, 0.1, 1.0)));
    lift = sec > 1.0 ? Math.round(1.6 * sin(progress(sec, 1.0, 1.6) * Math.PI)) : 0;
  }
  if (show) {
    g.clip(d.x, d.y, d.w, d.h);
    jack(g, P, d.x + d.w / 2 + dx, d.y + 1 + jolt, robe, text, lift);
    g.unclip();
  }
  leaves(g, P, d, shut);
  // the door frame
  g.rect(d.x - 1, d.y - 1, d.w + 2, d.h + 1, P.ink);
}

function drummer(g, P, tod, sec, f, jolt, lit) {
  const d = DOOR_C;
  g.fillRect(d.x, d.y, d.w, d.h, mix(mix(P.ink, P.woodDk, 0.4), hex('c88a48'), lit * 0.6));
  if (lit > 0) g.radial(d.x + d.w / 2, d.y + 4, 14, [[0, hex('f0b868')], [1, mix(P.ink, P.woodDk, 0.4)]], { box: [d.x, d.y, d.w, d.h], a: 0.45 * lit });
  g.clip(d.x, d.y, d.w, d.h);
  // what is he doing? the drum on the hour (once per hour, 1-12), the bell at every ke
  const beats = f.h % 12 || 12;
  let drumHit = -1, bellHit = -1, bellAge = 99;
  const hourStart = f.m === 0;
  if (hourStart) {
    const bt = (sec - 1.2) / 0.62;
    if (bt >= 0 && bt < beats) drumHit = bt - Math.floor(bt);     // 0..1 through each beat
  }
  const keAge = tod - Math.floor(tod / KE) * KE;
  if (keAge < 4 && !(hourStart && drumHit >= 0)) { bellAge = keAge; bellHit = keAge < 0.6 ? keAge / 0.6 : -1; }

  const cx = d.x + 13, top = d.y + 1 + jolt;
  // the drum on its stand, left
  const dxm = d.x + 6, dym = d.y + 11;
  const skin = drumHit >= 0 && drumHit < 0.25;
  g.fillRect(dxm - 1, dym + 4, 1, 3, P.woodDk); g.fillRect(dxm + 2, dym + 4, 1, 3, P.woodDk);
  g.fillEllipse(dxm + 0.5, dym, 4.5, 5, P.ink);
  g.fillEllipse(dxm + 0.5, dym, 3.5, 4, P.cinnabar);
  g.fillEllipse(dxm + 1.2, dym, 2.2, 3.2, skin ? mix(P.lead, hex('fff6e0'), 0.7) : mix(P.lead, P.wood, 0.3));
  g.pixel(dxm - 2, dym - 3, P.gold); g.pixel(dxm - 2, dym + 3, P.gold); g.pixel(dxm - 3, dym, P.gold);
  // the bell, right, swinging after a strike
  const swing = bellAge < 4 ? Math.round(1.4 * sin(bellAge * 9) * Math.exp(-bellAge * 0.9)) : 0;
  const bx = d.x + 21 + swing;
  g.hline(d.x + 17, d.y + 2, 9, P.woodDk);
  g.vline(d.x + 21, d.y + 3, 2, P.ink);
  g.fillPolygon([[bx - 1.5, d.y + 5], [bx + 2.5, d.y + 5], [bx + 3.5, d.y + 11], [bx - 2.5, d.y + 11]], P.bronze);
  g.hline(bx - 3, d.y + 11, 7, P.ink); g.hline(bx - 1, d.y + 7, 3, P.gold);
  // the drummer: same jack, azurite robe, sticks in hand
  const x = cx, y = top;
  g.fillRect(x - 2, y, 5, 3, P.ink); g.hline(x - 7, y + 2, 15, P.ink);
  // he turns his head toward what he strikes
  const look = drumHit >= 0 ? -1 : bellAge < 2 ? 1 : 0;
  g.fillRect(x - 2, y + 3, 5, 4, P.lead);
  g.pixel(x - 1 + look, y + 4, P.ink); g.pixel(x + 1 + look, y + 4, P.ink);
  g.fillRect(x - 4, y + 7, 9, 10, P.azurite);
  g.vline(x, y + 8, 9, P.ink, { a: 0.4 });
  // arms: left stick for the drum, right mallet for the bell
  const shoulderL = [x - 3, y + 8], shoulderR = [x + 3, y + 8];
  let hl = [x - 4, y + 12], tipL = [x - 7, y + 9];
  if (drumHit >= 0) {
    const up = drumHit < 0.25 ? 0 : (drumHit - 0.25) / 0.75;          // strike, then wind up for the next
    hl = [x - 5, y + 11 - 3 * up]; tipL = [dxm + 2.5, dym - 1 - 6 * up];
  }
  let hr = [x + 4, y + 12], tipR = [x + 7, y + 9];
  if (bellHit >= 0) {
    const up = bellHit < 0.3 ? 0 : (bellHit - 0.3) / 0.7;
    hr = [x + 5, y + 11 - 2 * up]; tipR = [bx - 2, d.y + 9 - 4 * up];
  }
  g.thickLine(shoulderL[0], shoulderL[1], hl[0], hl[1], 1.6, P.azurite, { aa: true });
  g.thickLine(hl[0], hl[1], tipL[0], tipL[1], 1, P.woodDk, { aa: true });
  g.thickLine(shoulderR[0], shoulderR[1], hr[0], hr[1], 1.6, P.azurite, { aa: true });
  g.thickLine(hr[0], hr[1], tipR[0], tipR[1], 1, P.woodDk, { aa: true });
  g.fillRect(Math.round(hl[0]) - 1, Math.round(hl[1]) - 1, 2, 2, P.lead);
  g.fillRect(Math.round(hr[0]), Math.round(hr[1]) - 1, 2, 2, P.lead);
  g.unclip();
  g.rect(d.x - 1, d.y - 1, d.w + 2, d.h + 1, P.ink);

  // sound: pale rings spreading over the facade from the drum or the bell
  if (drumHit >= 0) {
    const r = 3 + drumHit * 20;
    g.ring(dxm + 0.5, dym, r, r + 1.2, P.lead, { aa: true, a: 0.6 * (1 - drumHit) });
  }
  if (bellAge < 2.5) {
    for (let k = 0; k < 2; k++) {
      const age = bellAge - k * 0.5;
      if (age < 0 || age > 1.6) continue;
      const r = 4 + age * 14;
      g.ring(bx + 0.5, d.y + 8, r, r + 1, P.gold, { aa: true, a: 0.55 * (1 - age / 1.6) });
    }
  }
}
