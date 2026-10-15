// Neon: an old Hong Kong street sign at night, and the time is its glass.
//
// Two black steel sign boards hang staggered on a sooty brick wall (hours
// high on the left, minutes low on the right), the way neighbouring shops'
// boards crowd a Kowloon side street. Each numeral is ONE length of 3 px
// glass bent by a sign-maker (neon-glyphs.js): tall deco figures with full
// round bowls, a flat-topped 3, an open 4 whose return run is painted black,
// a 6 that closes on its own stem, an 8 crossing itself at the waist, pale
// dead glass at the electrodes. The hours burn neon red (the gas itself),
// the minutes argon-mercury aqua. The street's other glass sits round them:
// pink border tubes on the boards, two white colon studs, a seafood shop's
// fish over the minutes, a noodle shop's steaming bowl under the hours, a
// transformer box and its black GTO cables.
//
// The time is alive. Light runs along every numeral's glass the whole
// minute (the chase: bright packets travelling from electrode to
// electrode), and on every beat each numeral fires its own sign programme,
// a little after the one before it, so the beat rolls across the street:
// a STRIKE (the tube over-drives white and its glow blooms onto the brick),
// a RUN (a white-hot front races the length of the glass), a STROBE (two
// quick flashes). The border chasers step on the half beat; the fish flicks
// its tail and a bubble rises on the beat; the steam sways. Every 15 s:
// :15 a tired transformer makes one numeral stutter and buzz; :30 the
// controller runs the whole sign in series (a front races through all four
// numerals, hours into minutes, then all flash); :45 a car passes and its
// headlights sweep across the brick.
//
// Minute turn: the changing tube hums and stutters, then dies section by
// section (fine pieces, ranked once, so it only ever thins), its glass fades
// to dark by :59.95; after :00 the new tube's electrodes glow, it strikes
// with a buzz (stuttering on, full shape or nothing), and warms up. Hour:
// the whole street cuts out at the mains (the numerals alone burn on),
// then the controller relights every sign in a cascade, a white wave runs
// through the numerals, and the street strobes in unison while the brick is
// flooded red and aqua; the time burns steady through all of it.
//
// Palette: what a neon street allows. The gases (neon red, aqua, pink,
// gold, warm white, blue), each a tube colour, a deep colour and a white-hot
// core, throwing its own coloured light; unlit glass is pale grey;
// blockout is black paint; the ground is soot-dark brick and black boards,
// so the burning numerals are the strongest contrast. Night: the shops
// close (fish and bowl go out, the borders dim), the brick darkens, the
// backlight dims to 50 %, and only the time burns.
//
// Cost: every tube is a sparse light field in flash (neon-tubes.js); a frame
// copies the wall, adds each tube's glow (one table lookup and three
// multiply-adds a pixel), paints blockout and glass, and packs RGB565. No
// per-pixel callbacks, no per-minute caches: each frame is built cold.

import { clockFields, hash, progress, ease } from '../js/kit.js';
import { GLYPHS, GLYPH_BYTES } from './neon-glyphs.js';
import { GLOW, coverage, gas, BODY_Q } from './neon-tubes.js';
import { W, H, N, SLOTS, FIELDS, WALL_DAY, WALL_NIGHT, BRICKMASK, SCENE_BYTES } from './neon-scene.js';

// ------------------------------------------------------------ gases

const RED = gas({ deep: 0x5a0a08, tube: 0xff4a26, hot: 0xfff0dc, halo: 0xff2a10 });
const AQUA = gas({ deep: 0x05384a, tube: 0x34d6ff, hot: 0xeaffff, halo: 0x0c9ee8 });
const PINK = gas({ deep: 0x4a0a2c, tube: 0xff4fb0, hot: 0xffe0f2, halo: 0xe8247e });
const GOLD = gas({ deep: 0x4a2a04, tube: 0xffb02a, hot: 0xfff2c8, halo: 0xf07c0a });
const WHITE = gas({ deep: 0x3c3428, tube: 0xf4e8d2, hot: 0xffffff, halo: 0xb8a890 });
const BLUE = gas({ deep: 0x0c1450, tube: 0x4c6cff, hot: 0xdce4ff, halo: 0x2a3ce0 });
const COV3 = coverage(1.5), COV2 = coverage(1.0), COVB = coverage(1.55);
const PAINT = [10, 8, 12];

// ------------------------------------------------------------ elements: a light field placed on the glass, and its state this frame

function element(f, ox, oy, g, cov) {
  return { f, ox, oy, g, cov, B: new Uint8Array(512), gk: 256, glass: 256 };
}
const DIG = SLOTS.map(([x, y], j) => element(GLYPHS[0], x, y, j < 2 ? RED : AQUA, COV3));
const S = FIELDS;
const DECO = {
  borderH: element(S.borderH, 0, 0, PINK, COV2), borderM: element(S.borderM, 0, 0, PINK, COV2),
  colon: element(S.colon, 0, 0, WHITE, COV3),
  fish: element(S.fish, 0, 0, GOLD, COV2), eye: element(S.eye, 0, 0, GOLD, COV2),
  tailA: element(S.tailA, 0, 0, GOLD, COV2), tailB: element(S.tailB, 0, 0, GOLD, COV2),
  bub0: element(S.bub0, 0, 0, BLUE, COV2), bub1: element(S.bub1, 0, 0, BLUE, COV2), bub2: element(S.bub2, 0, 0, BLUE, COV2),
  wave: element(S.wave, 0, 0, BLUE, COV2),
  bowl: element(S.bowl, 0, 0, WHITE, COV2), sticks: element(S.sticks, 0, 0, GOLD, COV2),
  steamA: element(S.steamA, 0, 0, WHITE, COV2), steamB: element(S.steamB, 0, 0, WHITE, COV2),
};
const DECO_LIST = Object.values(DECO);

// ------------------------------------------------------------ the working buffers (RAM)

const AR = new Uint16Array(N), AG = new Uint16Array(N), AB = new Uint16Array(N);

const fl = (a, b, c) => hash(a, b, c) / 4294967296;
const BASE = 192;

/** Fill an element's brightness along its length with one value (0 = unlit). */
function setAll(e, b) { const L = e.f.L; for (let s = 0; s <= L; s++) e.B[s] = b; ops += L >> 2; }

// ------------------------------------------------------------ the numerals' brightness along the glass

function digitLight(e, j, sec, mk, cfg) {
  const f = e.f, L = f.L, B = e.B, dead = f.dead;
  // the beat: each numeral fires its own programme, the beat rolling left to right
  const phi = sec - j * 0.09, nb = Math.floor(phi), ph = phi - nb;
  const prog = ((nb + 2 * j) % 3 + 3) % 3;
  let add = 0, front = -99, bloom = 0, ahead = 1;
  if (prog === 0) { if (ph < 0.32) { const k = 1 - ph / 0.32; add = 62 * k * k; bloom = k * k; } }
  else if (prog === 1) {
    // WRITE: the glass drops low and a white-hot front re-draws it from electrode to electrode
    if (ph < 0.5) { front = (ph / 0.5) * (L + 10); ahead = 0.42; bloom = 0.3; }
  }
  else if (ph < 0.07 || (ph >= 0.17 && ph < 0.24)) { add = 58; bloom = 0.7; }
  else if (ph < 0.17) add = -40;
  // the series run at :30 (and through the hour cascade): the whole sign is re-drawn in series, hours into minutes
  if (cfg.series >= 0) {
    const p = cfg.series - j * 0.3;
    add = 0; bloom = 0.3;
    if (p < 0) { front = -50; ahead = 0.42; }
    else if (p < 0.34) { front = (p / 0.34) * (L + 10); ahead = 0.42; }
    else front = -99;
    if (cfg.series >= 1.36) { const k = 1 - (cfg.series - 1.36) / 0.24; add = 64 * k; bloom = k; }   // then the whole sign flashes
  }
  const base = cfg.base + add, hum = (fl(Math.floor(sec * 30), j, 5) * 6) | 0;
  const t = sec * 20;
  for (let s = 0; s <= L; s++) {
    if (dead[s]) { B[s] = cfg.elec; continue; }
    // the chase: packets 36 px apart travelling from electrode to electrode
    let q = (s - t) % 36; if (q < 0) q += 36;
    const pk = q < 12 ? 1 - Math.abs(q - 6) / 6 : 0;
    let b = base + 44 * pk + hum;
    if (front > -90) {
      const dd = front - s;
      if (dd < 0) b *= ahead;                       // not yet re-drawn
      else if (dd < 12) b += 66 * (1 - dd / 12);    // the hot front and its wake
    }
    b = b * cfg.mul;
    B[s] = b < 1 ? 1 : b > 255 ? 255 : b;
  }
  ops += L;
  e.gk = (256 * (0.9 + 0.55 * bloom) * cfg.mul) | 0;
  e.glass = 256;
}

/** The old numeral sputtering out, sec in [58.2, 60). */
function sputter(e, j, sec, mk) {
  const f = e.f, L = f.L, B = e.B, dead = f.dead;
  const fr = Math.floor(sec * 60);
  // hum and stutter, deepening
  const p = progress(sec, 58.2, 58.9), cell = Math.floor(sec * 20);
  const dip = fl(cell, j, mk) < 0.15 + 0.5 * p ? 0.45 : 1;
  for (let s = 0; s <= L; s++) {
    if (dead[s]) { B[s] = 0; continue; }
    const piece = (s / 3) | 0, tDie = 58.9 + 0.62 * fl(mk, j * 97 + piece, 11);
    let b = BASE * dip;
    if (sec >= tDie) b = 0;
    else if (sec >= tDie - 0.13) b = fr & 1 ? 235 : 40;
    B[s] = b;
  }
  ops += L * 2;
  e.gk = 240;
  e.glass = (256 * (1 - progress(sec, 59.55, 59.92))) | 0;
}

/** The new numeral buzzing on, sec in [0, 1.6). */
function strike(e, j, sec, mk, base) {
  const f = e.f, L = f.L, B = e.B, dead = f.dead;
  let b, elec;
  if (sec < 0.16) { b = 0; elec = 20 + (sec / 0.16) * 70; }
  else if (sec < 0.9) {
    const cell = Math.floor(sec * 30), pOn = 0.3 + 0.65 * (sec - 0.16) / 0.74;
    b = fl(cell, j, mk ^ 0x55) < pOn ? 248 : 64; elec = 0;
  } else { const u = progress(sec, 0.9, 1.6); b = base + (250 - base) * (1 - u) * (1 - u); elec = 0; }
  for (let s = 0; s <= L; s++) B[s] = dead[s] ? elec : b;
  e.gk = (256 * (b > 200 ? 1.35 : 0.8)) | 0;
  e.glass = (256 * progress(sec, 0, 0.12)) | 0;
}

// ------------------------------------------------------------ compositing

let ops = 0;
function glowPass(e) {
  const f = e.f, n = f.n, X = f.x, Y = f.y, D = f.d, Sx = f.s, B = e.B, gk = e.gk, g = e.g;
  const hr = g.hr, hg = g.hg, hb = g.hb, ox = e.ox, oy = e.oy;
  for (let k = 0; k < n; k++) {
    const b = B[Sx[k]];
    if (b === 0) continue;
    const x = X[k] + ox, y = Y[k] + oy;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const I = (GLOW[D[k]] * b * gk) >> 16;
    const i = y * W + x;
    AR[i] += (hr * I) >> 8; AG[i] += (hg * I) >> 8; AB[i] += (hb * I) >> 8;
  }
  ops += n;
}

function bodyPass(e) {
  const f = e.f, n = f.n, X = f.x, Y = f.y, D = f.d, Sx = f.s, Bk = f.b, B = e.B, g = e.g, cov = e.cov, dead = f.dead;
  const ox = e.ox, oy = e.oy, gv = e.glass;
  const TR = g.r, TG = g.g, TB = g.b;
  for (let k = 0; k < n; k++) {
    const dq = D[k], bq = Bk[k];
    if (dq >= BODY_Q && bq >= 10) continue;
    const x = X[k] + ox, y = Y[k] + oy;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x;
    let r = AR[i], gg = AG[i], bb = AB[i];
    if (r > 255) r = 255; if (gg > 255) gg = 255; if (bb > 255) bb = 255;
    // black paint first (the lit glass passes in front of it)
    if (bq < 10 && gv > 0) {
      const a = (COVB[bq] * gv) >> 8;
      r += ((PAINT[0] - r) * a) >> 8; gg += ((PAINT[1] - gg) * a) >> 8; bb += ((PAINT[2] - bb) * a) >> 8;
    }
    if (dq < BODY_Q) {
      const s = Sx[k], lv = B[s] >> 3;
      let a = cov[dq];
      if (lv === 0) a = (a * gv * (dead[s] ? 0.85 : 0.55)) >> 8;   // unlit glass: pale, half seen; the electrode shells paler
      if (a > 0) {
        const c = lv * BODY_Q + dq;
        r += ((TR[c] - r) * a) >> 8; gg += ((TG[c] - gg) * a) >> 8; bb += ((TB[c] - bb) * a) >> 8;
      }
    }
    AR[i] = r; AG[i] = gg; AB[i] = bb;
  }
  ops += n;
}

// ------------------------------------------------------------ the street's other glass, this frame

function decoLight(sec, night, hour) {
  const beat = Math.floor(sec), half = Math.floor(sec * 2), ph = sec - beat;
  const shops = 1 - night;                     // the shops close at night
  // the border chasers: 3 circuits of 7 px dashes, two of three lit, stepping on the half beat
  for (const e of [DECO.borderH, DECO.borderM]) {
    const L = e.f.L, B = e.B, lit = night ? 70 : 104, dim = night ? 8 : 16;
    const step = hour.race ? Math.floor(sec * 12) : half;
    for (let s = 0; s <= L; s++) {
      const q = s % 9, c = ((s / 9) | 0) % 3;
      B[s] = q >= 7 ? 10 : (c + step) % 3 !== 0 ? lit : dim;
    }
    e.gk = 200; e.glass = 256;
  }
  const flash = ph < 0.25 ? (1 - ph / 0.25) ** 2 : 0;
  setAll(DECO.colon, (night ? 130 : 160) + 70 * flash); DECO.colon.gk = 256;
  // the fish flicks its tail on the beat; a bubble rises with each half beat
  const fishB = (150 * shops) | 0;
  setAll(DECO.fish, fishB); setAll(DECO.eye, fishB);
  setAll(DECO.tailA, beat & 1 ? 0 : fishB); setAll(DECO.tailB, beat & 1 ? fishB : 0);
  const bub = half % 4;
  setAll(DECO.bub0, bub === 0 ? fishB : 0); setAll(DECO.bub1, bub === 1 ? fishB : 0); setAll(DECO.bub2, bub === 2 ? fishB : 0);
  setAll(DECO.wave, (120 * shops) | 0);
  setAll(DECO.bowl, (140 * shops) | 0); setAll(DECO.sticks, (130 * shops) | 0);
  setAll(DECO.steamA, beat & 1 ? 0 : (120 * shops) | 0); setAll(DECO.steamB, beat & 1 ? (120 * shops) | 0 : 0);
  for (const e of DECO_LIST) {
    if (e !== DECO.borderH && e !== DECO.borderM) { e.gk = 220; e.glass = (256 * (0.35 + 0.4 * night)) | 0; }
  }
}

export default {
  name: 'Kowloon Neon',
  blurb: 'An old Hong Kong street sign at night: every numeral is one bent neon tube that chases, strikes and strobes on the beat; it sputters out and buzzes on at the turn.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec, mk = f.minuteKey, night = ctx.night;
    ctx.lcd.backlight(1 - 0.5 * night);
    ops = 0;
    const prv = clockFields(new Date(ctx.date.getTime() - 60000));
    const nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const now = f.hh + f.mm, pv = prv.hh + prv.mm, nx = nxt.hh + nxt.mm;
    // the hour: the street cuts out at the mains (from :59.3), then relights in a cascade and strobes
    const hourShow = prv.h !== f.h && sec < 10;
    const cut = (nxt.h !== f.h && sec >= 59.3) || (hourShow && sec < CASCADE[0]);
    const strobe = hourShow && sec >= STROBE0 && sec < STROBE1;
    const strobeOn = strobe && (Math.floor((sec - STROBE0) * 8) & 1) === 0;
    const hour = { race: hourShow && sec >= CASCADE[0] && sec < STROBE1 };

    // ---- the wall
    const Wd = WALL_DAY, Wn = WALL_NIGHT;
    if (night <= 0) for (let i = 0; i < N; i++) { AR[i] = Wd.r[i]; AG[i] = Wd.g[i]; AB[i] = Wd.b[i]; }
    else if (night >= 1) for (let i = 0; i < N; i++) { AR[i] = Wn.r[i]; AG[i] = Wn.g[i]; AB[i] = Wn.b[i]; }
    else {
      const k = (night * 256) | 0, j = 256 - k;
      for (let i = 0; i < N; i++) {
        AR[i] = (Wd.r[i] * j + Wn.r[i] * k) >> 8; AG[i] = (Wd.g[i] * j + Wn.g[i] * k) >> 8; AB[i] = (Wd.b[i] * j + Wn.b[i] * k) >> 8;
      }
      ops += N;
    }
    ops += N;

    // ---- :45, a car passes: its headlights sweep across the brick
    if (sec >= 45 && sec < 47) headlights(ease.inOutQuad(progress(sec, 45, 46.9)), night);
    // ---- the hour's strobe floods the brick, red and aqua in turn, and the flood ebbs after
    if (hourShow && sec >= STROBE0 && sec < STROBE1 + 1.6) {
      const k = sec < STROBE1 ? (strobeOn ? 1 : 0.25) : (1 - progress(sec, STROBE1, STROBE1 + 1.6)) * 0.4;
      flood(Math.floor((sec - STROBE0) * 4) & 1 ? AQUA : RED, k);
    }

    // ---- the numerals
    const fault = sec >= 15 && sec < 16.4 && !hourShow ? hash(mk, 15) % 4 : -1;
    let series = sec >= 30 && sec < 31.6 ? sec - 30 : -1;
    if (hourShow && sec >= CASCADE[0] && sec < STROBE0) series = (sec - CASCADE[0]) % 1.5;
    for (let j = 0; j < 4; j++) {
      const e = DIG[j];
      if (sec >= 58.2 && nx[j] !== now[j]) { e.f = GLYPHS[+now[j]]; sputter(e, j, sec, mk); continue; }
      e.f = GLYPHS[+now[j]];
      const base = BASE - 10 * night;
      if (sec < 1.6 && pv[j] !== now[j]) { strike(e, j, sec, mk, base); continue; }
      let mul = 1;
      if (j === fault) {
        const cell = Math.floor(sec * 24);
        mul = fl(cell, mk, 3) < 0.45 ? 0.32 + 0.3 * fl(cell, mk, 4) : 1;
      }
      digitLight(e, j, sec, mk, { base: strobe ? (strobeOn ? 236 : 150) : base, mul, elec: 0, series });
      if (strobeOn) e.gk = 400;
    }
    decoLight(sec, night, hour);
    if (cut) for (const e of DECO_LIST) setAll(e, 0);
    else if (hourShow && sec < STROBE1 + 0.5) relight(sec, mk, strobe, strobeOn);

    for (const e of DECO_LIST) glowPass(e);
    for (const e of DIG) glowPass(e);
    for (const e of DECO_LIST) bodyPass(e);
    for (const e of DIG) bodyPass(e);

    // ---- pack RGB565
    const buf = g.buf;
    for (let i = 0; i < N; i++) {
      let r = AR[i], gg = AG[i], b = AB[i];
      if (r > 255) r = 255; if (gg > 255) gg = 255; if (b > 255) b = 255;
      buf[i] = ((r >> 3) << 11) | ((gg >> 2) << 5) | (b >> 3);
    }
    g.cost.px += N;
    g.cost.box += N * 3 + ops * 7;
  },
};

/** The hour: each sign strikes in its turn, flashes white-hot, then joins the unison strobe. */
const CASCADE = [2.2, 2.5, 2.8, 3.1, 3.3, 3.6], STROBE0 = 5.2, STROBE1 = 7.6;
const ORDER = [['borderH'], ['colon'], ['borderM'], ['fish', 'eye', 'tailA', 'tailB', 'bub0', 'bub1', 'bub2'], ['wave'], ['bowl', 'sticks', 'steamA', 'steamB']];
function relight(sec, mk, strobe, on) {
  const fr = Math.floor(sec * 60);
  for (let k = 0; k < ORDER.length; k++) {
    const t0 = CASCADE[k];
    for (const name of ORDER[k]) {
      const e = DECO[name], B = e.B, L = e.f.L;
      for (let s = 0; s <= L; s++) {
        const b = B[s];
        if (b === 0) continue;
        let v;
        if (sec < t0) v = 0;
        else if (sec < t0 + 0.25) v = fl(fr >> 1, k, mk) < 0.5 ? 255 : 0;          // striking
        else if (strobe) v = on ? (k === 0 || k === 2 ? 170 : 255) : 24;
        else { const u = progress(sec, t0 + 0.25, t0 + 0.9); v = b + (255 - b) * (1 - u); }   // white-hot, cooling
        B[s] = v;
      }
      e.gk = strobe && on ? 380 : e.gk;
    }
  }
}

/** Coloured light over the whole wall, most on the brick (k 0..1). */
function flood(gs, k) {
  const a = (k * 56) | 0, r = (gs.hr * a) >> 8, g = (gs.hg * a) >> 8, b = (gs.hb * a) >> 8;
  for (let i = 0; i < N; i++) {
    if (BRICKMASK[i]) { AR[i] += r; AG[i] += g; AB[i] += b; } else { AR[i] += r >> 2; AG[i] += g >> 2; AB[i] += b >> 2; }
  }
  ops += N;
}

function headlights(u, night) {
  const cx = -30 + 220 * u, k = (night ? 70 : 52);
  const x0 = Math.max(0, Math.floor(cx - 22)), x1 = Math.min(W, Math.ceil(cx + 22));
  for (let x = x0; x < x1; x++) {
    const d = Math.abs(x + 0.5 - cx) / 22, a = (k * (1 - d * d)) | 0;
    if (a <= 0) continue;
    for (let y = 0, i = x; y < H; y++, i += W) {
      const m = BRICKMASK[i] ? a : a >> 2;
      AR[i] += m; AG[i] += (m * 236) >> 8; AB[i] += (m * 200) >> 8;
    }
  }
  ops += (x1 - x0) * H;
}

export const NEON_FLASH_BYTES = GLYPH_BYTES + SCENE_BYTES;
