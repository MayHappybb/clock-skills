// Here Be Monsters: the glass is the corner of an antique sea chart, a
// copperplate engraving hand-tinted in watercolour, and the time is four sea
// serpents. Each numeral is ONE serpent whose body is laid along the digit's
// pen path, tail to head (seachart-glyphs.js): a 1 rears with its head as the
// flag, a 4 and a 9 plunge head-first down their stems, a 5 and a 7 reach
// along their top bars, a 0 and an 8 bite their own tails. They are drawn as
// the engraver drew sea beasts: an iron-gall keyline, cross-bands engraved
// across the back, the belly side hatched, a white eye, and over it all the
// colourist's wash, verdigris for the hours and vermilion for the minutes.
// The chart is aged rag paper with a pooled sea wash, a graduated neat-line,
// rhumb lines from a compass rose, and the sea engraved as rows of wave
// crests drifting downwind; a galleon tacks to windward across the top.
//
// The time is alive, every second (seachart-serpent.js): each body undulates
// with a wave running from head to tail, a swell bulges down it on the beat,
// rippling left to right through the four, and its engraved bands surge
// forward one band a beat, so the serpent swims through its own coil. On
// each beat one serpent (in turn) snaps its jaws, and spouts if its head is
// up. Flourishes: at :15 and :45 the galleon fires a broadside at a serpent,
// which rears and spouts; at :30 a great swell rolls across the chart and
// every serpent heaves and blows as it passes.
//
// Minute turn: a serpent whose digit changes rears from :57, jaws wide, and
// blows; from :58.6 it sinks, the engraved sea closing over it row by row
// (evenly over the whole digit, so it only thins, never turns into another
// numeral) with splash rings at its head, gone by :59.75. From :00.05 the
// new serpent surfaces the same way in reverse, the sea's lines parting off
// it, and blows at :01.2. Hour: the kraken. From :52 the sea darkens; from
// :54 its arms climb out of the bottom of the chart and writhe, its mantle
// rises in the strait between hours and minutes and its great eye opens; an
// arm goes up after the galleon and she founders and sinks. The serpents
// change under it as usual, on top of it all (it lies behind their moats);
// from :04 it sinks back, the storm clears, and a new galleon sails in.
//
// Palette: a hand-coloured chart's: rag paper and its stains, iron-gall
// ink (full and faded), a pale sea-green wash with darker tidemarks, gold
// and vermilion in the rose, verdigris and vermilion serpents, a lilac grey
// for the kraken. Every pixel is a material looked up in one palette a
// frame, so storm and night are palette moves: by night the chart is seen by
// a guttering candle (umber paper, the engraving glinting, the serpents'
// washes lifted), with the backlight at 45 %. Hard pixels throughout, as an
// engraving is; only the galleon is a sprite drawn over the map.
//
// Cost: one material map (12.8 KB RAM) laid from the static sheet and the
// scrolled crest tile, four serpents drawn from their distance tables (a few
// integer compares a pixel over each glyph's box), the kraken's discs at the
// hour, one palette pass. Nothing is redrawn per minute outside the frame.
// RAM: map 12.8 KB + two 1 KB per-sample tables + the 25.6 KB frame.
// Flash: glyph tables ~212 KB, sheet 12.8 KB, sprites and tables < 2 KB:
// ~227 KB.

import { clockFields, to565, clamp, progress, ease } from '../js/kit.js';
import { M, NMAT, DAY, NIGHT, N, BG, laySheet } from './seachart-sheet.js';
import { GLYPHS } from './seachart-glyphs.js';
import { drawSerpent } from './seachart-serpent.js';
import { SHIP, SHIP_NIGHT, SHIP_W, SHIP_H, galleon, spout, rings, kraken } from './seachart-actors.js';

const MAP = new Uint8Array(N);
const PAL = new Array(NMAT).fill(0), PAL565 = new Uint16Array(NMAT);
const SLOTS = [
  { size: 0, x: 6, y: 13 }, { size: 0, x: 40, y: 13 },
  { size: 1, x: 94, y: 31 }, { size: 1, x: 122, y: 31 },
];
const STORM = { SEA: 0x8fa092, RIM: 0x7d8f80, WAVE: 0x5f6656, PAPER: 0xc9bc98, STAIN: 0xbfae86, RHUMB: 0x8f8068 };

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
function mixc(a, b, u) {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  return ((ar + (((b >> 16) - ar) * u)) << 16) | ((ag + ((((b >> 8) & 255) - ag) * u)) << 8) | (ab + (((b & 255) - ab) * u));
}

/** Where a glyph's head is, in glyph coordinates: the spout point and whether it can blow. */
function headOf(gl) {
  const i = Math.max(0, gl.L - 5), nx = -gl.ty[i], ny = gl.tx[i], e = gl.eye, rr = gl.r * 1.5 + 1;
  return { x: gl.x[i] + nx * e * rr, y: gl.y[i] + ny * e * rr, up: ny * e < -0.45, tipX: gl.x[gl.L], tipY: gl.y[gl.L] };
}
const HEADS = GLYPHS.map((set) => set.map(headOf));

const ST = { dipA: -99, dipB: -99, dipW: 4, amp: 0, wl: 22, wph: 0, band: 0, period: 5, bulge: 0, bAmp: 0, jaw: 0, cover: 0, wash: 0, shade: 0, dy: 0, bg: BG };

export default {
  name: 'Here Be Monsters',
  blurb: 'An engraved, hand-tinted sea chart: the four numerals are sea serpents coiled in the shape of the time, swimming through their own coils on the beat; each minute the old serpent sinks and the new one surfaces, and at the hour the kraken rises.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, nt = ctx.night;
    ctx.lcd.backlight(1 - 0.55 * nt);
    const T = (ctx.date.getTime() % 86400000) / 1000;
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hourIn = prv.h !== f.h && s < 15, hourOut = nxt.h !== f.h && s >= 50;

    // ---- the hour: storm, kraken, the galleon's fate
    let storm = 0, rise = 0, reach = 0, eyeOpen = 0, sink = 0, shipIn = 1;
    if (hourOut) {
      storm = sm((s - 52) / 4); rise = sm((s - 54) / 3.5); reach = sm((s - 56.5) / 1.5);
      eyeOpen = sm((s - 56) / 0.6); sink = sm((s - 58.2) / 1.6);
    } else if (hourIn) {
      storm = 1 - sm((s - 6) / 4); rise = 1 - sm((s - 4) / 4); eyeOpen = s < 3.5 ? 1 : 1 - sm((s - 3.5) / 0.4);
      sink = s < 6 ? 1 : 0; shipIn = sm((s - 6) / 6);
      // the eye blinks once as the new hour surfaces
      if (s > 1.4 && s < 1.7) eyeOpen = 0;
    }

    // ---- palette: day/night, darkened by the storm
    for (let k = 0; k < NMAT; k++) PAL[k] = nt > 0 ? mixc(DAY[k], NIGHT[k], nt) : DAY[k];
    if (storm > 0) for (const key in STORM) PAL[M[key]] = mixc(PAL[M[key]], nt > 0 ? mixc(STORM[key], NIGHT[M[key]], nt * 0.7) : STORM[key], storm);
    for (let k = 0; k < NMAT; k++) PAL565[k] = to565(PAL[k]);

    // ---- the sea: crests drift downwind (faster in the storm); the beat lifts alternate rows
    const n = Math.floor(s), p = s - n;
    const swellFront = s >= 30 && s < 33 ? -14 + (s - 30) * 72 : -999;
    let cost = laySheet(MAP, T * (1 + storm * 2.5), p < 0.18 ? 1 : 0, swellFront);
    const ship = galleon(T);
    const sx = ship.x + (1 - shipIn) * 64;          // after the hour a new ship sails in from the east
    if (rise > 0) cost += kraken(MAP, rise, T, reach, eyeOpen, ship.x + SHIP_W / 2);

    // ---- flourishes
    const fire = s >= 15 && s < 17.5 ? { t: s - 15, slot: 3 } : s >= 45 && s < 47.5 ? { t: s - 45, slot: 1 } : null;

    // ---- the four serpents
    for (let k = 0; k < 4; k++) {
      const sl = SLOTS[k], d = +cur[k], gl = GLYPHS[sl.size][d], hd = HEADS[sl.size][d];
      const big = sl.size === 0;
      let amp = big ? 1.4 : 1.1, bAmp = 1.0, jaw = 0, cover = 0, spoutT = -1, ringT = -1, spH = big ? 11 : 9;
      // the beat: a swell runs down each body, rippling left to right through the four
      const q = (s + 1 - k * 0.12) % 1, bulge = gl.L + 4 - (gl.L + 14) * sm(q / 0.85);
      // the bands surge forward a band a beat
      const band = -5 * (n + sm(p / 0.5)) - k * 1.3;
      // one serpent a beat snaps its jaws, and blows if it can
      if (n % 4 === k) { jaw = Math.sin(Math.PI * clamp(p / 0.45, 0, 1)); if (hd.up && (n >> 2) % 2 === 0) spoutT = p / 0.95; else ringT = p; }
      // the great swell
      if (swellFront > -999) {
        const dx = swellFront - (sl.x + 12);
        if (dx > -10 && dx < 24) { const u = (dx + 10) / 34; bAmp = 0.7 + 1.1 * Math.sin(Math.PI * u); amp *= 1 + Math.sin(Math.PI * u); }
        if (dx > 0 && dx < 40) { jaw = Math.max(jaw, Math.sin(Math.PI * clamp(dx / 30, 0, 1))); if (hd.up) spoutT = dx / 40; else ringT = dx / 40; }
      }
      // a broadside lands beside it: it rears and blows
      if (fire && fire.slot === k && fire.t > 0.8) {
        const u = clamp((fire.t - 0.8) / 1.5, 0, 1);
        amp *= 1 + 1.2 * Math.sin(Math.PI * u); jaw = Math.max(jaw, Math.sin(Math.PI * u)); spoutT = hd.up ? u : -1;
      }
      if (storm > 0) amp *= 1 + 0.6 * storm;
      // the turn: rear, sink; surface
      if (s >= 57 && cur[k] !== nw[k]) {
        const r = sm((s - 57) / 1.2);
        amp *= 1 + r; jaw = Math.max(jaw, sm((s - 57.4) / 0.4) * (1 - sm((s - 58.6) / 0.3)));
        if (hd.up) spoutT = (s - 57.5) / 1.1; else ringT = (s - 57.5) / 1.1;
        cover = ease.inQuad(progress(s, 58.6, 59.75));
        if (s >= 58.6) { ringT = (s - 58.6) / 1.3; spoutT = -1; }
        if (cover >= 1) { cost += rings(MAP, sl.x + hd.x, sl.y + hd.y + 3, ringT, 12); continue; }
      } else if (s < 2 && cur[k] !== old[k]) {
        cover = 1 - sm((s - 0.05) / 0.95);
        if (cover >= 1) continue;
        ringT = s / 1.2; spoutT = hd.up ? (s - 1.1) / 1 : -1;
      }
      // two coils at a time dip through the waves, travelling down the body
      const dq = (T * 0.5 + k * 0.29) % 1;
      ST.dipA = (gl.L + 10) * (1 - dq) - 5; ST.dipB = ST.dipA - (gl.L + 10) * 0.5; if (ST.dipB < -5) ST.dipB += gl.L + 10;
      ST.amp = Math.min(amp, big ? 2.3 : 1.9); ST.wph = T * 0.9 + k * 0.21; ST.band = band; ST.bulge = bulge; ST.bAmp = bAmp; ST.jaw = jaw;
      ST.cover = cover; ST.wash = big ? M.WASH_H : M.WASH_M; ST.shade = big ? M.SHADE_H : M.SHADE_M; ST.dy = Math.round(cover * 3);
      cost += drawSerpent(MAP, gl, sl.x, sl.y, ST);
      if (spoutT > 0 && spoutT < 1) cost += spout(MAP, sl.x + hd.x, sl.y + hd.y + ST.dy, spoutT, spH);
      if (ringT > 0 && ringT < 1) cost += rings(MAP, sl.x + hd.tipX, sl.y + hd.tipY + 2, ringT, 9);
    }

    // ---- the galleon's broadside: smoke along her side, the ball's arc, the splash
    if (fire) {
      const t = fire.t, sl = SLOTS[fire.slot], hd = HEADS[sl.size][+cur[fire.slot]];
      const fx = sx + SHIP_W / 2, fy = ship.y + 9, tx = sl.x + hd.x + (fire.slot === 3 ? -9 : 10), ty = sl.y + hd.y + 4;
      if (t < 1.4) for (let j = 0; j < 3; j++) {
        const r = 1 + Math.min(1, t * 3) * 1.6 + t * 1.2, a = 1 - t / 1.4;
        if (a > 0.1) cost += smoke(MAP, fx - 5 + j * 5 + t * 2, fy - t * 2, r);
      }
      if (t > 0.1 && t < 0.8) {
        const u = (t - 0.1) / 0.7, bx = fx + (tx - fx) * u, by = fy + (ty - fy) * u - 10 * Math.sin(Math.PI * u);
        const i = Math.round(by) * 160 + Math.round(bx);
        if (by > 3 && by < 76 && MAP[i] < M.INK) { MAP[i] = M.INK; MAP[i + 1] = M.INK; }
      }
      if (t > 0.8) cost += rings(MAP, tx, ty, (t - 0.8) / 1.2, 10) + spout(MAP, tx, ty, (t - 0.8) / 1.0, 8);
    }

    // ---- to the glass
    const buf = g.buf;
    for (let i = 0; i < N; i++) buf[i] = PAL565[MAP[i]];
    g.cost.px += N; g.cost.box += cost * 5 + N * 2;

    // ---- the galleon (a sprite over the map); at the hour she founders
    if (sx > -SHIP_W && sink < 1) {
      const art = (nt > 0.5 ? SHIP_NIGHT : SHIP)[ship.about ? 1 : 0];
      const bob = p < 0.25 ? 1 : 0, yy = Math.round(ship.y + bob + sink * 13);
      g.clip(3, 3, 154, Math.max(0, Math.round(ship.y + SHIP_H - 1) - 3));
      g.blit(art, Math.round(sx), yy, { flipX: ship.flip });
      g.unclip();
    }
  },
};

/** A puff of engraved cannon smoke: a ring of stipple round a pale disc, over ground only. */
function smoke(map, cx, cy, r) {
  let n = 0;
  for (let y = Math.max(3, Math.floor(cy - r - 1)); y <= Math.min(76, cy + r + 1); y++)
    for (let x = Math.max(3, Math.floor(cx - r - 1)); x <= Math.min(156, cx + r + 1); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d2 = dx * dx + dy * dy, p = y * 160 + x;
      n++;
      if (map[p] >= M.INK) continue;
      if (d2 <= r * r) map[p] = M.SMOKE;
      else if (d2 <= (r + 1) * (r + 1) && ((x + y) & 1)) map[p] = M.FAINT;
    }
  return n;
}
