// Constructivist: the time is shouted.
//
// A kinetic propaganda poster after Rodchenko's 1924 "Books!" poster: a
// photomontage woman in a red kerchief shouts from a black field on the left,
// and her voice is a red cone of type that opens across the rest of the
// strip. The time is the slogan inside the cone. The numerals are not set in
// a row: every vertex of every letter is mapped into the cone (distance from
// the cone's apex, and a fraction of its width), so the type grows away from
// the mouth, each letter a wedge wider at its far side than its near side,
// the hours small and close, the minutes huge and loud.
//
// The cone is a log-polar space: a letter's position is s = ln(distance).
// Sliding the whole line along s scales it about the apex, so type flying
// out of the mouth grows exactly as the cone does, and keeps its shape.
//
// Motion, with no beat on the second:
// - She chants the time every 3 s, a phrase of as many syllables as the time
//   has spoken aloud ("ten oh nine" = 3, "twenty-three forty-seven" = 6): her
//   cut-out jaw drops on each syllable and each syllable sends a black sound
//   front down the cone. A front pushes the type as it passes, a ripple of
//   a pixel or so running through the letters.
// - The seconds are Lissitzky's red wedge, turning in a black circle.
// - Minute turn: at :58.4 she shouts. A thick shock front leaves her mouth
//   and the whole old slogan zooms out of the cone, accelerating, growing off
//   the glass (gone by :59.6). From :00 the new slogan pours out of her mouth,
//   letter after letter, growing as it travels, and lands with a small
//   recoil by :01.5, shouted with its syllables.
// - Hour: the shout breaks the poster. The cone is cut along its own rays and
//   arcs into twelve wedges that fly apart spinning as the old slogan zooms
//   away, and slam back together just after :00; the new slogan pours out of
//   the re-formed cone. The jolt is harder.
//
// Palette: the three inks of the posters, flat: red, black, cream paper, and
// the halftone of the photograph (ink dots on the paper). Cone, field and
// letters are anti-aliased (they move by fractions of a pixel); the halftone
// head and the date strip are fixed art.
//
// Cost: the head is two precomputed keyed bitmaps (copied, the jaw a few px
// lower when it drops); everything else is a few dozen polygons and lines.

import { clamp, ease, sin, cos } from '../js/kit.js';
import { DIGITS, COLON, GW, GH, SMALL, smallWidth } from './constructivist-type.js';
import { ART, HW, INK, PAPER, RED } from './constructivist-head.js';

const W = 160, H = 80;
const TAU = Math.PI * 2;

// ------------------------------------------------------------ the cone
const TH = (-10 * Math.PI) / 180;           // axis rises 10 degrees to the right
const AX = Math.cos(TH), AY = Math.sin(TH);
const NX = -AY, NY = AX;                    // across the cone, pointing down
const MOUTH = [43, 53];
const D_MOUTH = 50;                         // apex to mouth
const APEX = [MOUTH[0] - D_MOUTH * AX, MOUTH[1] - D_MOUTH * AY];
const TAN = 0.2;                            // half-width / distance
const FILL = 0.8;                           // letters fill this much of the cone's width
const S_MOUTH = Math.log(D_MOUTH - 1);

// a point in cone space: s = ln(distance from apex), v in -1..1 across
function conePt(s, v) {
  const d = Math.exp(s);
  return [APEX[0] + d * AX + v * TAN * d * NX, APEX[1] + d * AY + v * TAN * d * NY];
}
const ptD = (d, v) => [APEX[0] + d * AX + v * TAN * d * NX, APEX[1] + d * AY + v * TAN * d * NY];

// ------------------------------------------------------------ the slogan's layout (s at each glyph's near edge)
const SIG = 0.168, GAP = 0.036, SIG_COLON = 0.08;
const S0 = Math.log(63);
const SLOTS = (() => {
  const out = [];
  let s = S0;
  for (let i = 0; i < 5; i++) {
    const w = i === 2 ? SIG_COLON : SIG;
    out.push({ s, w });
    s += w + GAP;
  }
  return out;
})();
const S_END = SLOTS[4].s + SLOTS[4].w;

// clip a polygon (cone coords [s, v]) to s >= lo
function clipS(poly, lo) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ina = a[0] >= lo, inb = b[0] >= lo;
    if (ina) out.push(a);
    if (ina !== inb) {
      const u = (lo - a[0]) / (b[0] - a[0]);
      out.push([lo, a[1] + (b[1] - a[1]) * u]);
    }
  }
  return out;
}

// draw one glyph (list of polygons on the 6 x 10 grid) with its near edge at
// s0, spanning w in s; `push(d)` is the sound's displacement in px at distance d
function drawGlyph(g, polys, s0, w, c, push, gw = GW) {
  if (s0 + w < S_MOUTH) return;
  for (const p of polys) {
    let q = p.map(([x, y]) => [s0 + (x / gw) * w, (y / GH * 2 - 1) * FILL]);
    if (s0 < S_MOUTH) { q = clipS(q, S_MOUTH); if (q.length < 3) continue; }
    const pts = q.map(([s, v]) => {
      let d = Math.exp(s);
      d += push(d);
      return ptD(d, v);
    });
    g.fillPolygon(pts, c, { aa: true });
  }
}

// ------------------------------------------------------------ the voice
const ONES = [0, 1, 1, 1, 1, 1, 1, 2, 1, 1];
const TEENS = [1, 3, 1, 2, 2, 2, 2, 3, 2, 2];
function syl(n) {
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  return 2 + ONES[n % 10];
}
const spoken = (h, m) => (h === 0 ? 2 : syl(h)) + (m === 0 ? 2 : m < 10 ? 1 + syl(m) : syl(m));
const PHRASES = Array.from({ length: 17 }, (_, i) => 3 + 3 * i); // she chants the time every 3 s, :03 to :51
const SYL = 0.26;                          // seconds a syllable
const C_SOUND = 46;                        // px/s down the cone
const SHOUT = 58.4;

// every sound event of the minute starting at `t0` (seconds of the day):
// { t, a: amplitude (px of push), w: front thickness }
function minuteEvents(t0, h, m) {
  const ev = [];
  const n = spoken(h, m);
  // the new time, shouted as it pours out
  for (let i = 0; i < n; i++) ev.push({ t: t0 + 0.05 + i * SYL, a: 1.3, w: 1.6 });
  for (const p of PHRASES) for (let i = 0; i < n; i++) ev.push({ t: t0 + p + i * SYL + (i === n - 1 ? 0.06 : 0), a: i === n - 1 ? 1.8 : 1.3, w: 1.4 });
  ev.push({ t: t0 + SHOUT, a: 3, w: 4.5, big: true });
  return ev;
}

// how open the jaw is (0..1) given the events
function jawOpen(ev, T) {
  let o = 0;
  for (const e of ev) {
    const u = T - e.t;
    if (u < -0.05 || u > 1.4) continue;
    let k;
    if (e.big) k = u < 0 ? (u + 0.05) / 0.05 : u < 0.9 ? 1 : clamp(1 - (u - 0.9) / 0.4, 0, 1);
    else k = u < 0 ? (u + 0.05) / 0.05 * 0.7 : 0.7 * clamp(1 - u / 0.22, 0, 1);
    o = Math.max(o, k);
  }
  return o;
}

// ------------------------------------------------------------ the frame
const FIELD = [[0, 0], [65, 0], [45, 80], [0, 80]];
const DISC = [90, 14], DISC_R = 12;

export default {
  name: 'Constructivist',
  blurb: 'A Rodchenko poster that shouts the time: a red cone of wedge-shaped type pours from a photomontage mouth, and zooms out of the glass at every minute.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, date = ctx.date;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const T = f.h * 3600 + f.m * 60 + f.sec;        // seconds of the day
    const t0 = T - f.sec;                            // this minute's start
    const sec = f.sec;

    // which slogan is up, and where along the cone it is (ds in s)
    let digits = f.hh + f.mm, ds = 0, show = true;
    const lag = f.m === 0 ? HOUR_BACK : 0;          // at the hour the cone must re-form first
    if (sec >= SHOUT) {
      const u = progress(sec, SHOUT + 0.05, 59.55);
      ds = 1.7 * u * u;
      if (u >= 1) show = false;
    } else if (sec < 1.5 + lag) {
      const u = clamp((sec - lag) / 1.5, 0, 1);
      const span = S_END - S_MOUTH + 0.02;
      ds = -span * (1 - ease.outBack(u) * 0.985 - 0.015 * u);
    }

    // sound: events of the previous and this minute
    const pf = new Date(date.getTime() - 60000);
    const ev = minuteEvents(t0 - 60, pf.getHours(), pf.getMinutes()).concat(minuteEvents(t0, f.h, f.m));
    const fronts = [];
    for (const e of ev) {
      const u = T - e.t;
      if (u < 0) continue;
      const d = D_MOUTH + (e.big ? 2.2 : 1) * C_SOUND * u;
      if (d > 210) continue;
      fronts.push({ d, a: e.a, w: e.w, big: e.big });
    }
    const push = (d) => {
      let p = 0;
      for (const fr of fronts) {
        const x = (d - fr.d) / (fr.w + 3);
        if (x > -1 && x < 1) { const k = 1 - x * x; p += fr.a * k * k; }
      }
      return p;
    };

    // ---- paper and field
    g.clear(PAPER);
    g.fillPolygon(FIELD, INK, { aa: true });

    // ---- the seconds: Lissitzky's red wedge turning in a black circle
    g.fillCircle(DISC[0], DISC[1], DISC_R, INK, { aa: true });
    {
      const a = (sec / 60) * TAU;
      const sx = sin(a), cy = -cos(a);
      const px = -cy, py = sx;
      const tip = [DISC[0] - sx * 3, DISC[1] - cy * 3];
      const r = DISC_R + 9, hw = 4.4;
      g.fillPolygon([tip, [DISC[0] + sx * r + px * hw, DISC[1] + cy * r + py * hw], [DISC[0] + sx * r - px * hw, DISC[1] + cy * r - py * hw]], RED, { aa: true });
    }

    // ---- the cone: whole, or (at the hour) in flying shards
    const S_FAR = Math.log(260);
    const hourTurn = f.m === 59 && sec >= SHOUT ? sec - 60 : f.m === 0 && sec < HOUR_BACK ? sec : null;
    if (hourTurn === null) {
      g.fillPolygon([ptD(D_MOUTH - 4, -1), ptD(260, -1), ptD(260, 1), ptD(D_MOUTH - 4, 1)], RED, { aa: true });
      g.thickLine(...ptD(D_MOUTH - 1, -1), ...ptD(260, -1), 1.5, INK, { aa: true });
      g.thickLine(...ptD(D_MOUTH - 1, 1), ...ptD(260, 1), 1.5, INK, { aa: true });
    } else drawShards(g, hourTurn);

    // ---- the sound fronts: arcs across the cone
    for (const fr of fronts) {
      const wpx = fr.big ? 3.2 : 1.1;
      const pts = [];
      for (let k = 0; k <= 6; k++) { const v = -1 + k / 3; pts.push(ptD(fr.d / Math.sqrt(1 + v * v * TAN * TAN), v)); }
      g.stroke(pts, wpx, INK, { aa: true });
    }

    // ---- the slogan
    if (show) {
      for (let i = 0; i < 5; i++) {
        const sl = SLOTS[i];
        const s0 = sl.s + ds;
        if (s0 > S_FAR) continue;
        const polys = i === 2 ? COLON : DIGITS[digits[i < 2 ? i : i - 1]];
        drawGlyph(g, polys, s0, sl.w, i === 2 ? INK : PAPER, push, i === 2 ? GW : GW);
      }
    }

    // ---- the head: jaw (dropping), then the cut-out over it
    const jo = jawOpen(ev, T);
    g.draw(ART.jaw, 0, Math.round(jo * 4), { key: 0 });
    g.draw(ART.head, 0, 0, { key: 0 });

    // ---- the shout jolts the whole poster
    {
      const v = sec >= SHOUT ? sec - SHOUT : -1;
      if (v >= 0 && v < 0.5) {
        const k = (f.m === 59 ? 3 : 2) * (1 - v / 0.5);
        const dx = Math.round(k * sin(v * 70)), dy = Math.round(k * 0.6 * cos(v * 53));
        if (dx || dy) g.shift(dx, dy, PAPER);
      }
    }

    // ---- the date strip
    const txt = `${f.dow} ${f.day} ${f.month}`;
    let x = W - 2 - smallWidth(txt);
    for (const ch of txt) {
      if (ch === ' ') { x += 4; continue; }
      g.blit(SMALL[ch], x, 71, { c: INK });
      x += SMALL[ch].w + 1;
    }
  },
};

// ------------------------------------------------------------ the hour: the cone breaks
// 3 across x 4 along, cut on the cone's own rays and arcs
const HOUR_BACK = 0.55;               // seconds after :00 the shards are home
const SHARDS = (() => {
  const out = [], ds = [D_MOUTH - 4, 72, 100, 140, 260], vs = [-1, -0.33, 0.4, 1];
  let k = 0;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++, k++) {
      const pts = [ptD(ds[i], vs[j]), ptD(ds[i + 1], vs[j]), ptD(ds[i + 1], vs[j + 1]), ptD(ds[i], vs[j + 1])];
      const cx = pts.reduce((a, p) => a + p[0], 0) / 4, cy = pts.reduce((a, p) => a + p[1], 0) / 4;
      const h1 = ((k * 7919) % 97) / 97, h2 = ((k * 104729) % 89) / 89;
      // fly off along the cone's rays, fanned, spinning
      const dir = Math.atan2(cy - APEX[1], cx - APEX[0]) + (h1 - 0.5) * 1.6 + (j - 1) * 0.5;
      out.push({ pts: pts.map(([x, y]) => [x - cx, y - cy]), cx, cy, dir, dist: 90 + 70 * h2, spin: (h1 - 0.5) * 7, delay: i * 0.06 });
    }
  return out;
})();
// u: seconds from :00 (negative before); out from :58.6, back by HOUR_BACK
function drawShards(g, u) {
  for (const sh of SHARDS) {
    let k;
    if (u < 0) k = ease.inQuad(progress(u, SHOUT - 60 + 0.25 + sh.delay, -0.25));
    else k = 1 - ease.outCubic(progress(u, 0.02 + sh.delay * 0.5, HOUR_BACK));
    if (k >= 1) continue;
    const ox = sh.cx + Math.cos(sh.dir) * sh.dist * k, oy = sh.cy + Math.sin(sh.dir) * sh.dist * k;
    const a = sh.spin * k, ca = Math.cos(a), sa = Math.sin(a);
    g.fillPolygon(sh.pts.map(([x, y]) => [ox + x * ca - y * sa, oy + x * sa + y * ca]), RED, { aa: true });
  }
}

function progress(v, a, b) { return clamp((v - a) / (b - a), 0, 1); }
