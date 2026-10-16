// cubism: the time painted as an analytic cubist still life, seen from
// several places at once, and replayed every hour from 1910 to 1913.
//
// The idea. Braque and Picasso, 1910-12: the subject is cut by long
// straight planes, each plane shows it from a slightly different place,
// and every plane's edge is a fold, lit on one side and in shadow on the
// other, so the whole surface shimmers in ochre, grey and umber. That is
// this face. The subject is the time, in stencil numerals like the ones
// Braque brushed onto "Le Portugais"; eleven long lines swing slowly across
// an oval canvas (the format of their 1911-12 still lifes) and every
// facet they make sees the numerals through its own view: shifted,
// squeezed as if from the side, tilted, sometimes with a second ghost
// contour. As the lines turn, facet edges sweep across the numerals and
// pieces of them slip from one view to the next.
//
// Rhythm, one breath a minute, no beats. Just after the minute arrives
// the planes pull the numerals together until they are nearly whole and
// still (about :06 to :20). Then the analysis begins: the views drift
// apart, slowly, more each second, until by :50 the time is a faceted
// thing you read the way you read a Picasso, with the parts in roughly
// the right place. From :54 the numerals that are about to change are
// scraped back into the ground; at :00 the new ones are brushed in
// through the most broken state and the canvas reassembles.
//
// The hour is art history. A fresh hour is pure analytic painting, all
// brown and grey. Through the hour, facets one at a time become pasted
// papers (papier colle, 1912-13): newsprint, Braque's faux bois, black
// paper and a blue-grey wallpaper. A paper is flat, so it shows the time
// in its true place, unfaceted, in stencil ink, and an older hour is
// easier to read. On the hour the papers are scraped off together and
// the next hour starts again from paint.
//
// Reading it: HH:MM, big stencil numerals; the parts of each numeral are
// a few pixels out of register most of the minute and whole after :00.
// Weekday, day and month are stencilled flat across the foot of the oval
// in French, the way Braque's letters sit on the picture plane, untouched
// by the faceting.
//
// Rendering: one per-pixel pass over the glass. Each pixel works out
// which side of each line it is on (a bit code naming its facet), looks
// the facet's view up in a table (an entry is made the first time a frame
// meets that facet), samples the numerals there (a 160 x 80 coverage
// table rebuilt each frame from ten glyph masks made at load), and maps a
// tone onto a warm or a cool ramp.
// The fold shading is the sum over lines of a short ramp of the signed
// distance. The brush texture, vignette, wood grain, newsprint and
// dissolve noise are tables made once at load. No trig per pixel.
//
// Palette: analytic cubism's own: umber, ochre, buff, warm grey and grey
// green, two ramps from near-black to bone; collage adds newsprint cream,
// faux-bois brown, black and one blue-grey. Hard pixels throughout: the
// facet edges are the point, and the numerals' masks carry their own AA.

import { clamp, lerp, progress, ease, rand, noise, noise2, sin, cos, TAU, clockFields, previousMinute, font5x7, hex, mix } from '../js/kit.js';
import { GLYPH, GW, GH } from './cubism-glyphs.js';

const W = 160, H = 80;
const NL = 11;                // lines cutting the canvas
const NCODE = 1 << NL;

// ------------------------------------------------------------ tables made once

// Brush texture: short directional dabs, -1..1, the canvas grain.
const TEX = new Float32Array(W * H);
{
  for (let i = 0; i < 900; i++) {
    const x0 = rand(i, 1) * W, y0 = rand(i, 2) * H, v = rand(i, 3) * 2 - 1;
    const dir = rand(i, 4) < 0.6 ? 1 : -1, len = 2 + Math.floor(rand(i, 5) * 4);
    for (let k = 0; k < len; k++) {
      const x = Math.floor(x0 + k), y = Math.floor(y0 - dir * k * 0.6);
      if (x >= 0 && y >= 0 && x < W && y < H) TEX[y * W + x] = clamp(TEX[y * W + x] + v, -1, 1);
    }
  }
}

// Oval canvas: 0 at the centre, 1 at the rim; >1 is the frame.
const OVAL = new Float32Array(W * H);
const CXO = 80, CYO = 40, RXO = 79.5, RYO = 39.5;
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) OVAL[y * W + x] = Math.sqrt(((x + 0.5 - CXO) / RXO) ** 2 + ((y + 0.5 - CYO) / RYO) ** 2);

// Faux bois (Braque's decorator's comb): 0..1 grain value.
const WOOD = new Float32Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const warp = noise2(x / 23, y / 9, 7) * 9 + noise2(x / 7, y / 5, 8) * 1.5;
    const v = Math.sin((y * 0.8 + warp + Math.sin(x / 13) * 2.5) * 1.3);
    WOOD[y * W + x] = 0.5 + 0.5 * v;
  }

// Newsprint: rows of tiny dark words; 1 where ink.
const NEWS = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  if (y % 3 === 2) continue;
  let x = 0, wi = 0;
  while (x < W) {
    const len = 2 + Math.floor(rand(wi, (y >> 1) + 3, 11) * 6);
    for (let k = 0; k < len && x + k < W; k++) if (rand(x + k, y, 12) < 0.72) NEWS[y * W + x + k] = 1;
    x += len + 1; wi++;
  }
}

// Dissolve noise for paint being scraped back and brushed in: 0..1.
const DIS = new Float32Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) DIS[y * W + x] = clamp(noise2(x / 3.2, y / 3.2, 21) * 0.75 + rand(x, y, 22) * 0.25, 0, 0.999);

// Two ramps, 64 steps, tone 0..1 to colour (warm: umber to buff; cool: charcoal to bone).
function ramp(stops) {
  const out = new Int32Array(64);
  for (let i = 0; i < 64; i++) {
    const u = i / 63, n = stops.length - 1, k = Math.min(n - 1, Math.floor(u * n)), f = u * n - k;
    out[i] = mix(hex(stops[k]), hex(stops[k + 1]), f);
  }
  return out;
}
const WARM = ramp(['#1c130b', '#4a321c', '#82603a', '#b38c52', '#d4b36e', '#efe0b2']);
const COOL = ramp(['#161714', '#3b3c36', '#6a6b5f', '#969581', '#bdb9a2', '#e2dcc6']);
const FRAME_DARK = hex('#20150d'), FRAME_LIT = hex('#5a3d22');

// Collage papers: [ground light, ground dark, ink].
const PAPER = [
  [hex('#ddd5bb'), hex('#3a332a'), hex('#231c15')],   // newsprint
  [hex('#b07a40'), hex('#6a4220'), hex('#24160c')],   // faux bois
  [hex('#23201c'), hex('#2c2823'), hex('#e3d8bb')],   // black paper, chalk numerals
  [hex('#6a7a84'), hex('#55646e'), hex('#1b1f22')],   // blue-grey wallpaper
];

// ------------------------------------------------------------ the subject

// Where each numeral and the colon sit, unfaceted.
const DX = [13, 40, 96, 123], DY = 18;
const MODEL = new Float32Array(W * H);

function stamp(d, ox, alpha) {
  if (alpha <= 0) return;
  const m = GLYPH[d];
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      const v = m[y * GW + x];
      if (v <= 0) continue;
      const i = (DY + y) * W + ox + x;
      if (alpha >= 1 || DIS[i] < alpha) MODEL[i] = v;
    }
}

function buildModel(digits, alphas) {
  MODEL.fill(0);
  for (let i = 0; i < 4; i++) stamp(+digits[i], DX[i], alphas[i]);
  // colon: two cut squares
  for (const cy of [30, 48])
    for (let y = cy; y < cy + 5; y++) for (let x = 78; x < 83; x++) MODEL[y * W + x] = 1;
}

const sampleModel = (u, v) => {
  const x = u | 0, y = v | 0;
  return u < 0 || v < 0 || x >= W || y >= H ? 0 : MODEL[y * W + x];
};

// ------------------------------------------------------------ the planes

// Each line: a pivot it swings round, a mean angle, and its own slow tempo.
const LINES = Array.from({ length: NL }, (_, k) => {
  const r = (j) => rand(k, j, 31);
  // mostly near-vertical and steep diagonals, a couple of shallow ones
  const steep = k < 7;
  const ang = steep ? (r(1) - 0.5) * 1.2 : Math.PI / 2 + (r(1) - 0.5) * 0.7; // angle of the normal
  return {
    px: 12 + ((k * 0.618 + r(2) * 0.3) % 1) * 136, py: 14 + r(3) * 52,
    ang, swing: 0.18 + r(4) * 0.22, per: 31 + r(5) * 47, ph: r(6) * TAU,
    drift: 6 + r(7) * 10, per2: 43 + r(8) * 60, ph2: r(9) * TAU,
  };
});

const LA = new Float32Array(NL), LB = new Float32Array(NL), LC = new Float32Array(NL), LL = new Float32Array(NL);
// per-facet view tables
const TDX = new Float32Array(NCODE), TDY = new Float32Array(NCODE), TSX = new Float32Array(NCODE), TSH = new Float32Array(NCODE);
const TBASE = new Float32Array(NCODE), TWARM = new Float32Array(NCODE), TECHO = new Float32Array(NCODE);
const TEX2 = new Float32Array(NCODE), TEY2 = new Float32Array(NCODE);
// which frame each facet's entry was made in (made on first use; ~40 facets exist at once)
const TGEN = new Int32Array(NCODE).fill(-1);
let gen = 0;
// open contours along each line: 48 cells of on/off
const CONT = new Uint8Array(NL * 48);

const DAYS = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
const MOIS = ['JANV', 'FEVR', 'MARS', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOUT', 'SEPT', 'OCT', 'NOV', 'DEC'];

// How far apart the views are, over a minute.
function fracture(sec) {
  if (sec < 9) return lerp(1, 0.1, ease.inOutCubic(sec / 9));
  if (sec < 20) return 0.1;
  if (sec < 52) return lerp(0.1, 0.72, ease.inOutQuad((sec - 20) / 32));
  return lerp(0.72, 1, ease.inOutQuad((sec - 52) / 8));
}

// Pasted papers for hour `hk`: cut rectangles, tilted a little, put down
// one every four minutes or so. They never move once pasted.
const NPAPER = 13;
const paperCache = new Map();
function paperList(hk) {
  if (paperCache.has(hk)) return paperCache.get(hk);
  const out = [];
  for (let j = 0; j < NPAPER; j++) {
    const r = (n) => rand(j, hk, 60 + n);
    const w = 18 + r(1) * 30, h = 12 + r(2) * 22;
    // mostly over the band the numerals live in, where they matter
    const cx = 20 + r(3) * 120, cy = 22 + r(4) * 36;
    const t = r(5);
    const type = t < 0.36 ? 0 : t < 0.66 ? 1 : t < 0.86 ? 3 : 2;
    const k = type === 2 ? 0.62 : 1;                    // black paper comes in scraps
    out.push({
      at: 1.5 + j * 4.3 + r(6) * 2.5,                  // minute of the hour it goes down
      cx, cy, hw: k * w / 2, hh: k * h / 2, ang: (r(7) - 0.5) * 0.45, type,
    });
  }
  if (paperCache.size > 4) paperCache.delete(paperCache.keys().next().value);
  paperCache.set(hk, out);
  return out;
}

// This frame's collage: which paper covers each pixel (-1 none), and its shadow.
const PMAP = new Int8Array(W * H), PSH = new Uint8Array(W * H);
const PTYPE = new Int8Array(NPAPER * 2);
function lay(list, mh, scrape, base) {
  for (let j = 0; j < list.length; j++) {
    const P = list[j];
    const a = progress(mh, P.at, P.at + 0.1) * scrape;   // brushed down over 6 s
    if (a <= 0) continue;
    PTYPE[base + j] = P.type;
    const c = Math.cos(P.ang), sn = Math.sin(P.ang);
    const ext = Math.abs(P.hw * c) + Math.abs(P.hh * sn) + 2, eyt = Math.abs(P.hw * sn) + Math.abs(P.hh * c) + 2;
    const x0 = Math.max(0, Math.floor(P.cx - ext)), x1 = Math.min(W, Math.ceil(P.cx + ext));
    const y0 = Math.max(0, Math.floor(P.cy - eyt)), y1 = Math.min(H, Math.ceil(P.cy + eyt));
    const inside = (px, py) => {
      const dx = px - P.cx, dy = py - P.cy;
      const lx = dx * c + dy * sn, ly = -dx * sn + dy * c;
      // one torn edge (the right one), the rest cut with scissors
      const torn = P.hw - 1.6 * rand(Math.floor(ly + 50), j, base + 7);
      return lx > -P.hw && lx < torn && ly > -P.hh && ly < P.hh;
    };
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        if (OVAL[i] > 0.985) continue;
        if (inside(x + 0.5, y + 0.5)) { if (a >= 1 || DIS[i] < a) { PMAP[i] = base + j; PSH[i] = 0; } }
        else if (a >= 0.6 && inside(x - 0.5, y - 0.5)) PSH[i] = 1;
      }
  }
}

export default {
  name: 'Nature morte à l\'heure',
  blurb: 'An analytic cubist still life of the time: long planes swing across an oval canvas and each sees the stencil numerals from its own place; they drift apart through the minute and reassemble after it; through the hour facets become pasted papers that show the time flat.',
  fps: 24,
  frame(g, ctx) {
    const f = ctx.fields, date = ctx.date, sec = f.sec;
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    const T = f.h * 3600 + f.m * 60 + sec;   // continuous through the day

    // --- the subject: this minute's numerals, fading at the turn
    const prev = previousMinute(date), next = clockFields(new Date(date.getTime() + 60000));
    const cur = f.hh + f.mm, was = prev.hh + prev.mm, will = next.hh + next.mm;
    const alphas = [0, 1, 2, 3].map((i) => {
      let a = 1;
      if (cur[i] !== will[i]) a = Math.min(a, 1 - progress(sec, 54.5, 59.4));
      if (cur[i] !== was[i]) a = Math.min(a, progress(sec, 0.4, 4.2));
      return a;
    });
    buildModel(cur, alphas);

    // --- the planes this frame
    const hourTurn = f.m === 0 ? 1 - progress(sec, 8, 14) : f.m === 59 ? progress(sec, 50, 58) : 0;
    const F = fracture(sec) * (1 + 0.35 * hourTurn);
    for (let k = 0; k < NL; k++) {
      const L = LINES[k];
      const a = L.ang + L.swing * sin(TAU * T / L.per + L.ph) + 0.25 * hourTurn * sin(T * 0.9 + k);
      const nx = cos(a), ny = sin(a);
      const px = L.px + L.drift * sin(TAU * T / L.per2 + L.ph2), py = L.py + 0.5 * L.drift * cos(TAU * T / L.per2 + L.ph2 * 1.3);
      LA[k] = nx; LB[k] = ny; LC[k] = nx * px + ny * py;
      // light from the upper left, wandering slowly
      const la = -2.3 + 0.6 * sin(TAU * T / 97);
      LL[k] = 0.3 * (nx * cos(la) + ny * sin(la));
      for (let j = 0; j < 48; j++) CONT[k * 48 + j] = noise(j * 0.45 + T * 0.02, k * 13 + 5) > 0.58 ? 1 : 0;
    }
    const tq = T / 23;
    gen = (gen + 1) & 0x3fffffff;
    const facet = (c) => {
      TGEN[c] = gen;
      const n1 = noise(tq, c * 7 + 1) - 0.5, n2 = noise(tq, c * 7 + 2) - 0.5, n3 = noise(tq * 0.7, c * 7 + 3) - 0.5;
      const n4 = noise(tq * 0.7, c * 7 + 4) - 0.5;
      TDX[c] = F * 13 * n1;
      TDY[c] = F * 9 * n2;
      TSX[c] = 1 + F * 0.32 * n3;            // squeezed as if seen from the side
      TSH[c] = F * 0.22 * n4;                // tilted
      TBASE[c] = (rand(c, 51) - 0.5) * 0.36;
      TWARM[c] = rand(c, 52) < 0.62 ? 1 : rand(c, 53) * 0.5;
      TECHO[c] = rand(c, 54) < 0.3 ? F * 0.45 : 0;   // a second, ghost contour
      TEX2[c] = (rand(c, 55) - 0.5) * 16; TEY2[c] = (rand(c, 56) - 0.5) * 8;
    };
    // --- collage through the hour; scraped off at the next hour
    const hk = Math.floor(f.minuteKey / 60);
    const mh = f.m + sec / 60;
    PMAP.fill(-1); PSH.fill(0);
    if (f.m === 0 && sec < 7) lay(paperList(hk - 1), 60, 1 - progress(sec, 0.6, 6.5), 0);
    lay(paperList(hk), mh, 1, NPAPER);

    const night = ctx.night;
    const lightK = 1 - 0.25 * night;

    g.paint((px, py, x, y) => {
      const i = y * W + x;
      const ov = OVAL[i];
      if (ov > 1) {
        // the frame: dark walnut grain round the oval
        const w = WOOD[i] * 0.5 + 0.25 * (ov > 1.03 ? 1 : 0);
        return mix(FRAME_DARK, FRAME_LIT, w * (1 - 0.4 * (y / H)) * lightK);
      }
      // which facet, and the fold shading of every line
      let code = 0, fold = 0, edge = 0;
      for (let k = 0; k < NL; k++) {
        const s = LA[k] * px + LB[k] * py - LC[k];
        if (s > 0) { code |= 1 << k; if (s < 13) fold += LL[k] * (1 - s / 13); }
        else if (s > -13) fold -= LL[k] * 0.85 * (1 + s / 13);
        if (s < 0.7 && s > -0.7) {
          const along = (-LB[k] * px + LA[k] * py + 300) / 6;
          if (CONT[k * 48 + (along | 0) % 48]) edge = 1;
        }
      }
      if (TGEN[code] !== gen) facet(code);
      const pj = PMAP[i];
      const tex = TEX[i];
      if (pj >= 0) {
        // a pasted paper: flat, shows the time in its true place
        const t = PTYPE[pj], p = PAPER[t];
        let gcol = t === 0 ? (NEWS[i] ? mix(p[0], p[1], 0.55) : p[0])
          : t === 1 ? mix(p[1], p[0], WOOD[i])
            : t === 3 ? ((x % 6 === 0 && y % 6 === 0) || ((x + 3) % 6 === 0 && (y + 3) % 6 === 0) ? p[1] : p[0])
              : mix(p[0], p[1], 0.5 + 0.5 * tex);
        const m = MODEL[i];
        if (m > 0) gcol = mix(gcol, p[2], m * 0.95);
        if (PSH[i]) gcol = mix(gcol, 0x000000, 0.3);
        return mix(gcol, 0x000000, 0.25 * night);
      }
      // painted facet: its own view of the numerals
      const cxr = px - 80, cyr = py - 40;
      const u = 80 + cxr * TSX[code] + TDX[code];
      const v = 40 + cyr + cxr * TSH[code] + TDY[code];
      let ink = sampleModel(u, v);
      const ec = TECHO[code];
      if (ec > 0) {
        const e2 = sampleModel(u + TEX2[code], v + TEY2[code]);
        if (e2 > ink * 0.5) ink = Math.max(ink, e2 * ec);
      }
      // the ground: lighter in the middle of the oval, darker at the rim
      // toward the rim the planes thin out into pale, flat underpainting
      const rim = ov * ov * ov * ov;
      let tone = 0.74 + (TBASE[code] + fold) * (1 - 0.8 * rim) + tex * 0.06 + 0.06 * rim;
      tone = tone * lightK;
      if (ink > 0) tone = tone - ink * (tone * 0.74 + 0.02);
      if (edge) tone *= 0.55;
      if (PSH[i]) tone *= 0.72;
      const ti = tone <= 0 ? 0 : tone >= 1 ? 63 : (tone * 63) | 0;
      const wm = TWARM[code];
      return wm >= 1 ? WARM[ti] : mix(COOL[ti], WARM[ti], wm);
    });

    // Stencilled letters, flat on the picture plane: weekday, day, month.
    const label = `${DAYS[f.wday]} ${f.day} ${MOIS[f.mon - 1]}`;
    const lw = label.length * 6 - 1;
    g.text(label, Math.round(80 - lw / 2), 66, { font: font5x7, c: 0x2a1c10, a: 0.78 });
  },
};
