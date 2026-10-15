// Andamento: a Byzantine gold mosaic (Ravenna, San Vitale). The time is
// set in tesserae as the mosaicists set lettering, and the ground is laid by
// it: each numeral is a centre row of gold inlay (chrysography) following the
// stroke, a lapis row either side that wraps round each terminal, a dark
// keyline row and a row of pearl-white glass; then rings of gold keep
// following the letters out into the ground (the andamento) until they meet
// the gently undulating courses of the field. A peacock, the Ravenna bird,
// stands on the minutes.
//
// Always alive: the gold tesserae are pressed in at slightly different
// tilts, so a slowly wandering, flickering candle makes individual tesserae
// flash and go dark, a scatter of sparkle that follows it across the field
// (the inlay in the numerals catches it too), with a soft pool of light. A
// shimmer rolls down the eyes of the peacock's train; now and then it dips
// its head.
//
// Minute: from :57.3 the old numeral's tesserae (and the gold rings that
// follow it) work loose, flash and drop out in a scatter, leaving the grey
// lime setting bed; the peacock lowers its head to watch. After :00 the
// sinopia (the red ochre drawing of the new numeral) appears on the bed, and
// the mosaicist sets it: the keyline row first, travelling round the letter,
// then the lapis and gold rows along the stroke, the pearl row, the gold
// rings outward, and the field's cut courses last; each new tessera flashes
// as it is pressed in. Whole by 0:03. Old tesserae only leave before :00, new
// ones only arrive after it, so the time is never wrong.
//
// Hour: the peacock displays: its train draws in as it raises a fan of eyes
// behind it (3.4-10.8 s), while the sun comes round to the apse window and a
// front of light rolls through all the gold.
//
// Palette: smalti. Gold glass in eight flat levels (dark where a tessera is
// tilted away, white-hot where it catches the light); lapis in two blues; a
// blue-black keyline; pearl white; umber grout; grey lime bed; red ochre
// sinopia; the peacock's blue, green and gold. Night: the church by
// candlelight: the gold sinks to a deep red-brown with a warm pool round the
// candle, the bed goes dark; lighter lapis and the pearl rows keep the time.
//
// Hard pixels throughout: every pixel belongs to one tessera or the grout.
//
// Cost: per frame, one pass over ~2,900 tesserae (state, light, glint: a few
// integer ops each) and one integer pass over the glass (two table lookups a
// pixel), both charged to g.cost.box; falling tesserae are drawn from the same
// maps. Once a minute the composite (which numeral claims each pixel) and the
// set/fall plan are rebuilt: ~25k table reads, charged in that frame.
// Flash: numeral maps 89,880 px x 2 B (id, grout bit and distance packed) =
// 176 KB, tessera tables 6,744 x 6 B = 40 KB, peacock 17 KB: ~233 KB. Built
// at boot in RAM: the field's course map (25.6 KB) and the two bed textures
// (51 KB), plus the composite (51 KB).

import { clockFields, previousMinute, rand, hash, sin, noise, ease } from '../js/kit.js';
import { buildGlyph, K_GOLD, K_MOAT, K_KEY, K_BODY, K_CENTRE } from './mosaic-glyphs.js';
import { W, H, field, BED as BED_DAY, BED_NIGHT, PAL } from './mosaic-wall.js';
import { POSES, DISPLAY, OCELLUS, drawFan } from './mosaic-peacock.js';

// ------------------------------------------------------------ the numerals

const ZH = { w: 34, h: 68, pad: 14, zones: [
  { to: 1.5, kind: K_CENTRE, L: 4 }, { to: 4.0, kind: K_BODY, L: 4, grout: true },
  { to: 5.2, kind: K_KEY, L: 3 }, { to: 7.6, kind: K_MOAT, L: 3 },
  { to: 10.6, kind: K_GOLD, L: 4, grout: true }, { to: 13.6, kind: K_GOLD, L: 4, grout: true }] };
const ZM = { w: 26, h: 46, pad: 10, zones: [
  { to: 1.2, kind: K_CENTRE, L: 4 }, { to: 3.3, kind: K_BODY, L: 4, grout: true },
  { to: 4.4, kind: K_KEY, L: 3 }, { to: 6.6, kind: K_MOAT, L: 3 },
  { to: 9.6, kind: K_GOLD, L: 4, grout: true }] };

function size(Z) {
  const gl = [];
  for (let d = 0; d < 10; d++) {
    const G = buildGlyph(d, Z), t = G.tess;
    // each tessera's tilt (where it reflects the light) and colour variant
    t.tx = new Float32Array(t.n); t.ty = new Float32Array(t.n); t.v = new Uint8Array(t.n);
    for (let i = 0; i < t.n; i++) {
      t.tx[i] = (rand(d, i, 11) - 0.5) * 2 * rand(d, i, 12);
      t.ty[i] = (rand(d, i, 13) - 0.5) * 2 * rand(d, i, 14);
      t.v[i] = hash(d, i, 15) & 3;
    }
    gl.push(G);
  }
  return gl;
}
const GH = size(ZH), GM = size(ZM);
const SLOTS = [
  { x: 4, y: 6, G: GH }, { x: 40, y: 6, G: GH },
  { x: 101, y: 32, G: GM }, { x: 131, y: 32, G: GM },
];
const MAXS = Math.max(...GH.map((g) => g.tess.n), ...GM.map((g) => g.tess.n));
const NB = field.n, NT = NB + 4 * MAXS;
const base = (k) => NB + k * MAXS;

// ------------------------------------------------------------ per-tessera state (RAM)

const TC = new Uint16Array(NT), TG = new Uint16Array(NT), TS = new Uint8Array(NT);
const PS = new Int16Array(W * H), PD = new Uint8Array(W * H), PK = new Int8Array(W * H);

// ------------------------------------------------------------ the minute's plan

const NONE = 1e9;
let planKey = -1, planOps = 0;
const plan = {
  digits: [0, 0, 0, 0], set: [false, false, false, false], drop: [false, false, false, false],
  setT: new Float32Array(NT), fallA: new Float32Array(NT), fallB: new Float32Array(NT), thru: new Uint8Array(NT),
};
const digitsOf = (f) => [+f.hh[0], +f.hh[1], +f.mm[0], +f.mm[1]];

function makePlan(f, date) {
  const mk = f.minuteKey;
  const cur = digitsOf(f), prv = digitsOf(previousMinute(date)), nxt = digitsOf(clockFields(new Date(date.getTime() + 60000)));
  plan.digits = cur;
  plan.set = cur.map((d, k) => d !== prv[k]);
  plan.drop = cur.map((d, k) => d !== nxt[k]);
  plan.setT.fill(-NONE); plan.fallA.fill(-NONE); plan.fallB.fill(NONE); plan.thru.fill(0);
  let ops = 0;

  // the composite: each pixel to the nearest numeral that claims it
  PS.fill(-1); PD.fill(255); PK.fill(-1);
  for (let k = 0; k < 4; k++) {
    const S = SLOTS[k], G = S.G[cur[k]], ox = S.x - G.pad, oy = S.y - G.pad, b = base(k);
    for (let y = 0; y < G.lh; y++) {
      const gy = oy + y;
      if (gy < 0 || gy >= H) continue;
      for (let x = 0; x < G.lw; x++) {
        const gx = ox + x;
        if (gx < 0 || gx >= W) continue;
        const v = G.map[y * G.lw + x];
        if (v < 0) continue;
        const i = gy * W + gx, d = G.dist[y * G.lw + x];
        ops++;
        if (d < PD[i]) { PD[i] = d; PS[i] = (((v >> 1) + b) << 1) | (v & 1); PK[i] = k; }
      }
    }
  }

  // which field tesserae a numeral's region touches (they are cut to fit, so re-cut when it changes)
  const touch = (k, digits, mark) => {
    const S = SLOTS[k], G = S.G[digits[k]], ox = S.x - G.pad, oy = S.y - G.pad;
    for (let y = 0; y < G.lh; y++)
      for (let x = 0; x < G.lw; x++) {
        const gx = ox + x, gy = oy + y;
        if (gx < 0 || gy < 0 || gx >= W || gy >= H || G.map[y * G.lw + x] < 0) continue;
        mark(field.map[gy * W + gx] >> 1);
        ops++;
      }
  };
  for (let k = 0; k < 4; k++) {
    const G = SLOTS[k].G[cur[k]], t = G.tess, b = base(k);
    if (plan.set[k]) {
      // after :00: field tesserae under the old numeral's region are gone; those
      // the new one cuts drop out now; all of them are set again last
      touch(k, prv, (id) => { plan.setT[id] = 2.35 + 0.5 * rand(id, mk, 3); plan.fallA[id] = -NONE; plan.thru[id] = 0; });
      touch(k, cur, (id) => {
        if (plan.setT[id] > 0) return;
        plan.fallA[id] = 0.02 + 0.32 * rand(id, mk, 4); plan.thru[id] = 1;
        plan.setT[id] = 2.35 + 0.5 * rand(id, mk, 3);
      });
      // the new numeral, set along its rows
      for (let i = 0; i < t.n; i++) {
        const fr = t.frac[i], z = t.row[i];
        let st;
        switch (t.kind[i]) {
          case K_KEY: st = 0.32 + 0.55 * fr; break;
          case K_CENTRE: st = 0.85 + 0.45 * fr; break;
          case K_BODY: st = 0.95 + 0.45 * fr; break;
          case K_MOAT: st = 1.35 + 0.45 * fr; break;
          default: st = 1.7 + 0.24 * (z - 4) + 0.4 * fr;
        }
        plan.setT[b + i] = st;
      }
    }
    if (plan.drop[k]) {
      for (let i = 0; i < t.n; i++) plan.fallB[b + i] = 57.3 + 2.2 * rand(b + i, mk, 5);
      touch(k, cur, (id) => { if (plan.fallB[id] >= NONE) plan.fallB[id] = 57.3 + 2.2 * rand(id, mk, 6); });
    }
  }
  planOps = ops;
  planKey = mk;
}

// ------------------------------------------------------------ the light

const DAYF = (n) => (2 * Math.PI * n) / 86400;    // phases that close over a day
const FALL = 0.42, GRAV = 320, FLASH = 0.2;
const PX = 99, PY = 0, PW_ = POSES[0].sprite.w;
function shimmerLv(u) {
  u -= Math.floor(u);
  return u < 0.05 ? 3 : u < 0.11 ? 2 : u < 0.2 ? 1 : 0;
}
const c565h = (c) => (((c >> 19) & 31) << 11) | (((c >> 10) & 63) << 5) | ((c >> 3) & 31);

export default {
  name: 'Andamento',
  blurb: 'A Byzantine gold mosaic: the time is set in lapis tesserae and the gold ground is laid in rows that follow it; candlelight glints in the tilted gold; each minute the old numeral drops out and the new one is set row by row.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, date = ctx.date, night = ctx.night;
    ctx.lcd.backlight(1 - 0.62 * night);
    planOps = 0;
    if (planKey !== f.minuteKey) makePlan(f, date);
    const tt = f.h * 3600 + f.m * 60 + s;

    const isNight0 = night > 0.5;
    // the candle wanders slowly and flickers
    const fl = noise(tt * 7, 5) - 0.5;
    const Lx = 80 + 62 * sin(DAYF(4320) * tt) + 14 * sin(DAYF(11110) * tt + 1) + 2.5 * fl;
    const Ly = 40 + 30 * sin(DAYF(6170) * tt + 2) + 2 * (noise(tt * 6, 9) - 0.5);
    const iD = 1 / 100, r2 = (isNight0 ? 0.022 : 0.03) * (1 + 0.7 * fl);
    // the hour: a front of sunlight rolls through the gold
    const hourShow = plan.set[1] && f.m === 0 && s < 9;
    const front = hourShow ? -30 + 230 * Math.min(1, Math.max(0, (s - 2.6) / 5)) : -999;

    const isNight = night > 0.5, P = isNight ? PAL.night : PAL.day, BED = isNight ? BED_NIGHT : BED_DAY;
    const gold = P.gold, nG = gold.length - 1;

    // ---- every tessera's colour and state this frame
    let nt = 0;
    const tessera = (id, kind, v, cx, cy, tx, ty) => {
      const st = plan.setT[id], fa = plan.fallA[id], fb = plan.fallB[id];
      let state = 1;
      if (s < fa) state = plan.thru[id] ? 2 : 1;
      else if (s < st || s >= fb) state = 0;
      TS[id] = state;
      let lv;
      if (kind === K_GOLD || kind === K_CENTRE) {
        const hx = tx - (cx - Lx) * iD, hy = ty - (cy - Ly) * iD;
        const e = (hx * hx + hy * hy) / r2;
        const dx = cx - Lx, dy = cy - Ly;
        // the candle's soft pool: tesserae near it lighter, far ones sink
        const q = dx * dx + dy * dy - 300 * v;
        lv = isNight
          ? (v >> 1) + (q < 600 ? 4 : q < 1800 ? 3 : q < 4200 ? 2 : q < 8000 ? 1 : 0)
          : 1 + (v >> 1) + (q < 700 ? 2 : q < 2600 ? 1 : 0);
        if (e < 1) lv += ((1 - e) * 5) | 0;
        if (front > -999) {
          const w = front - (cx + tx * 12);
          if (w > 0 && w < 18) lv += ((1 - w / 18) * 5.5) | 0;
          else if (w >= 18 && w < 60) lv += 1;
        }
      } else lv = 0;
      // the flash of a fresh tessera, and one working loose
      let fla = 0;
      if (st > 0 && s >= st && s < st + FLASH) fla = 1 - (s - st) / FLASH;
      if (fb < NONE && s < fb && s > fb - 0.25) fla = 0.6 * (1 - (fb - s) / 0.25);
      let c;
      if (kind === K_GOLD || kind === K_CENTRE) {
        if (fla > 0) lv += (fla * 5) | 0;
        c = gold[lv > nG ? nG : lv];
        TG[id] = kind === K_GOLD ? P.groutGold : P.groutLapis;
      } else {
        const tab = kind === K_MOAT ? P.pearl : kind === K_KEY ? P.key : kind === K_BODY ? P.body : P.centre;
        c = fla > 0.5 ? P.flash : tab[v % tab.length];
        TG[id] = kind === K_MOAT ? P.groutPearl : P.groutLapis;
      }
      TC[id] = c;
      nt++;
    };
    for (let id = 0; id < NB; id++) tessera(id, K_GOLD, field.v[id], field.cx[id], field.cy[id], field.tx[id], field.ty[id]);
    for (let k = 0; k < 4; k++) {
      const S = SLOTS[k], G = S.G[plan.digits[k]], t = G.tess, b = base(k), ox = S.x - G.pad, oy = S.y - G.pad;
      for (let i = 0; i < t.n; i++) tessera(b + i, t.kind[i], t.v[i], t.cx[i] + ox, t.cy[i] + oy, t.tx[i], t.ty[i]);
    }

    // ---- the pixel pass: each pixel is its tessera's colour, the grout, or the bed
    const buf = g.buf, FM = field.map;
    const sinA = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) sinA[k] = plan.set[k] && s < 3.2 ? Math.min(1, s / 0.35) : 0;
    for (let i = 0; i < W * H; i++) {
      const v = PS[i];
      if (v >= 0) {
        const id = v >> 1;
        if (TS[id]) { buf[i] = v & 1 ? TG[id] : TC[id]; continue; }
        const b = FM[i], bid = b >> 1;
        if (TS[bid] === 2) { buf[i] = b & 1 ? TG[bid] : TC[bid]; continue; }
        const a = sinA[PK[i]], d = PD[i];
        buf[i] = a > 0 && d < 11 ? blend(BED[i], P.sinopia, d < 7 ? a : a * 0.45) : BED[i];
      } else {
        const b = FM[i], bid = b >> 1;
        buf[i] = TS[bid] ? (b & 1 ? TG[bid] : TC[bid]) : BED[i];
      }
    }
    g.cost.px += W * H; g.cost.box += W * H * 4 + nt * 14;

    // ---- tesserae dropping out
    let nf = 0;
    for (let k = 0; k < 4; k++) {
      const before = plan.drop[k] && s > 57.2, after = plan.set[k] && s < 0.8;
      if (!before && !after) continue;
      const S = SLOTS[k], G = S.G[plan.digits[k]], ox = S.x - G.pad, oy = S.y - G.pad;
      const x0 = Math.max(0, ox - 3), x1 = Math.min(W, ox + G.lw + 3), y0 = Math.max(0, oy - 2), y1 = Math.min(H, oy + G.lh + 2);
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = y * W + x, v = PS[i];
          let id = -1, ft = 0, grout = 0;
          if (before && v >= 0 && PK[i] === k) { id = v >> 1; ft = plan.fallB[id]; grout = v & 1; }
          else {
            const b = FM[i], bid = b >> 1;
            if (before && v < 0) { ft = plan.fallB[bid]; }
            else if (after) { ft = plan.fallA[bid]; if (!plan.thru[bid]) ft = -NONE; }
            else continue;
            id = bid; grout = b & 1;
          }
          if (grout || ft >= NONE || ft <= -NONE) continue;
          const dt = s - ft;
          if (dt < 0 || dt >= FALL) continue;
          const ny = y + ((0.5 * GRAV * dt * dt) | 0);
          if (ny >= H) continue;
          const j = ny * W + x;
          buf[j] = blend(buf[j], from(TC[id]), 1 - dt / FALL);
          nf++;
        }
    }
    g.cost.box += nf * 30 + planOps * 3;

    // ---- the peacock on the minutes: it lowers its head to watch the work
    const busy = (plan.drop[2] || plan.drop[3]) && s > 56.6 ? s - 56.6 : (plan.set[2] || plan.set[3]) && s < 3.4 ? 3.4 - s : 0;
    let pz = Math.min(3, (busy * 6) | 0);
    if (!busy) {
      // at rest it dips its head now and then, as if to drink, and looks up again
      const ph = tt % 11;
      if (ph < 1.1) pz = Math.min(3, (Math.min(ph, 1.1 - ph) * 9) | 0);
    }
    let pc = POSES[pz];
    // the hour: once the new minutes are set it raises its train into a fan
    if (f.m === 0 && plan.set[1] && s > 3.4 && s < 11.6) {
      const op = s < 4.6 ? ease.inOutCubic((s - 3.4) / 1.2) : s < 10.2 ? 1 : 1 - ease.inOutCubic((s - 10.2) / 1.4);
      drawFan(g, PX, PY, op, (k) => shimmerLv(tt * 0.9 - Math.abs(k - 6) * 0.04));
      // the train draws in as the fan rises (and runs out again as it folds)
      g.blit(DISPLAY.sprite, PX, PY);
      g.clip(PX, PY, 17 + Math.round(44 * (1 - op)), POSES[0].sprite.h);
      g.blit(pc.sprite, PX, PY);
      g.unclip();
      pc = null;
    }
    if (pc) g.blit(pc.sprite, PX, PY);
    const ring = OCELLUS.map((c) => c565h(c));
    const eyes = pc ? pc.eyes : [];
    for (let k = 0; k < eyes.length; k++) {
      // a shimmer rolls down the train every 7 s, eye by eye
      const lv = shimmerLv(tt / 7 - k * 0.05);
      const e = eyes[k];
      for (let j = 0; j < e.length; j++) {
        const q = e[j], x = PX + (q % PW_), y = PY + ((q / PW_) | 0);
        buf[y * W + x] = ring[lv];
      }
    }
  },
};

// ------------------------------------------------------------ small integer colour helpers

/** Blend RGB565 `a` toward 0xRRGGBB colour `c` by u (0..1), result RGB565. */
function blend(a565, c, u) {
  const k = (u * 32) | 0;
  const ar = a565 >> 11, ag = (a565 >> 5) & 63, ab = a565 & 31;
  const cr = c >> 19, cg = (c >> 10) & 63, cb = (c >> 3) & 31;
  return (((ar + (((cr - ar) * k) >> 5)) << 11) | ((ag + (((cg - ag) * k) >> 5)) << 5) | (ab + (((cb - ab) * k) >> 5)));
}
const from = (v) => (((v >> 11) << 19) | (((v >> 5) & 63) << 10) | ((v & 31) << 3));
