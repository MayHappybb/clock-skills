// Synthwave ("Outrun"): the time is an 80s movie title over a night drive
// that never ends.
//
// The hour is the title: two figures of extruded chrome hanging over the
// sunset, in an extended italic Eurostile drawn for the face
// (synthwave-chrome.js). The chrome is live: it reflects a sky ramp, a hard
// white horizon line and, below it, the racing grid, so its lower half
// streams with reflected grid lines all minute; bevels reflect higher or
// lower; a light sweeps across it every 12 s. The extrusion runs back to the
// vanishing point in the sun.
//
// The minutes are the subtitle, spelled out in a neon brush script under
// the horizon ("ten", "oh-nine", "forty-seven", "o'clock"), written by a
// laser pen (synthwave-script.js). So the face reads like a title card:
// "10 ... forty-seven". Each minute the pen runs back over the letters the
// next word does not share and writes the rest (forty-six -> forty- ->
// forty-seven), while the word glides to stay centred; only a shared
// prefix is ever on screen across the turn, never a wrong word.
//
// Behind it: a striped sun with drifting slits and a glow, wireframe
// mountains, a magenta grid racing towards the glass (one cross line every
// quarter second, palms passing one a second), stars. The drive is a pure
// function of the time of day: cruising speed, a push at every minute, a
// turbo run at every hour. On the hour the old title rushes at the camera
// and flies over it as the grid smears into streaks, the route crosses
// into the next stage (Sunset Strip, Neon Grid, Desert Highway, Midnight
// Coast: one palette per hour, as in an arcade racer), the new hour rises
// out of the sun, and the pen writes "o'clock".
//
// Hard vs AA: the chrome and the script are anti-aliased from tables built
// once (per hour, per minute); grid lines are hard with sub-pixel split
// rows; palms are AA silhouettes. Night dims the backlight.
import { hex, mix, scale, clamp, rand, sin, cos, ease } from '../js/kit.js';
import { buildLogo, drawLogo } from './synthwave-chrome.js';
import { buildWord, drawWord, drawPen, minuteWord, sharedLetters } from './synthwave-script.js';

const W = 160, H = 80;
const HZ = 48;                 // horizon row
const VX = 80;                 // vanishing point
const F = 53, HC = 2.4;        // focal length (px), camera height (grid units)
const K = F * HC;              // y = HZ + K / z on the ground
const V0 = 4;                  // cruising speed, grid units per second

// ------------------------------------------------------------ the drive
// Distance driven, a pure function of the time of day: cruising speed plus
// a push at every minute and a turbo run at every hour. Every bump is a
// whole number of palm periods, so the road is seamless at midnight.
const BUMPS = [
  { period: 60, a: -0.7, b: 1.1, amount: 8 },
  { period: 3600, a: -2.6, b: 1.6, amount: 160 },
];
const smoother = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10));
const smootherD = (x) => (x <= 0 || x >= 1 ? 0 : 30 * x * x * (x - 1) * (x - 1));
function driven(T) {
  let d = V0 * T;
  for (const bp of BUMPS) {
    const k = Math.round(T / bp.period);
    d += bp.amount * (k - 1) + bp.amount * smoother((T - bp.period * k - bp.a) / (bp.b - bp.a));
  }
  return d;
}
function speed(T) {
  let v = V0;
  for (const bp of BUMPS) {
    const k = Math.round(T / bp.period);
    v += (bp.amount / (bp.b - bp.a)) * smootherD((T - bp.period * k - bp.a) / (bp.b - bp.a));
  }
  return v;
}

// ------------------------------------------------------------ stages
// One stage of the drive per hour, as in an arcade racer's route.
const P = (o) => o;
const STAGES = [
  P({
    name: 'Sunset Strip',
    sky: [hex('#090222'), hex('#25084a'), hex('#7a1c6e'), hex('#ff5a78')],
    sun: [hex('#fff27a'), hex('#ffb347'), hex('#ff4f7b'), hex('#e0137e')],
    ground: [hex('#3a0a44'), hex('#0e031c'), hex('#07020f')],
    grid: hex('#ff3fbf'), haze: hex('#ff4f9a'),
    mount: hex('#1b0733'), ridge: hex('#b14dff'), palm: hex('#0c0216'),
    csky: [hex('#0d1450'), hex('#2a5fc8'), hex('#8fd6ff'), hex('#ffffff')],
    cground: [hex('#1a0326'), hex('#4a0c4e'), hex('#c0307a'), hex('#ffb08a')],
    cline: hex('#ff5ad0'), crim: hex('#ffe0f4'),
    cext: [hex('#a0206e'), hex('#5a0c52'), hex('#26062e')],
    ink: { core: hex('#f4ffff'), tube: hex('#3ff0ff'), glow: hex('#00b0ff'), shade: hex('#05010c') },
  }),
  P({
    name: 'Neon Grid',
    sky: [hex('#000814'), hex('#001a40'), hex('#00507a'), hex('#29d4ff')],
    sun: [hex('#f0ffff'), hex('#7ff3ff'), hex('#2a8cff'), hex('#6a2cff')],
    ground: [hex('#002a40'), hex('#000a18'), hex('#000510')],
    grid: hex('#22e6ff'), haze: hex('#3fd0ff'),
    mount: hex('#001428'), ridge: hex('#2affd5'), palm: hex('#00060e'),
    csky: [hex('#001030'), hex('#0060c0'), hex('#7ff0ff'), hex('#ffffff')],
    cground: [hex('#000c18'), hex('#003050'), hex('#00a0c0'), hex('#b0fff0')],
    cline: hex('#40ffff'), crim: hex('#e0ffff'),
    cext: [hex('#0068a8'), hex('#00284a'), hex('#000c1a')],
    ink: { core: hex('#fff0fa'), tube: hex('#ff3fb0'), glow: hex('#ff1f90'), shade: hex('#000510') },
  }),
  P({
    name: 'Desert Highway',
    sky: [hex('#12021e'), hex('#3c0a3c'), hex('#b02a30'), hex('#ffa040')],
    sun: [hex('#fff6c0'), hex('#ffd040'), hex('#ff7020'), hex('#e02020')],
    ground: [hex('#401008'), hex('#160408'), hex('#0a0204')],
    grid: hex('#ff7a1a'), haze: hex('#ff9a40'),
    mount: hex('#2a0818'), ridge: hex('#ff5030'), palm: hex('#120206'),
    csky: [hex('#200a40'), hex('#8a2a8a'), hex('#ffb070'), hex('#fffbe0')],
    cground: [hex('#200408'), hex('#601010'), hex('#e05020'), hex('#ffd080')],
    cline: hex('#ffa030'), crim: hex('#fff0d0'),
    cext: [hex('#a03010'), hex('#501010'), hex('#200408')],
    ink: { core: hex('#f0fbff'), tube: hex('#40c8ff'), glow: hex('#2080ff'), shade: hex('#0a0204') },
  }),
  P({
    name: 'Midnight Coast',
    sky: [hex('#02010a'), hex('#0a0a2a'), hex('#2a1a5a'), hex('#8a5aff')],
    sun: [hex('#f4f0ff'), hex('#c8b8ff'), hex('#8a68ff'), hex('#5a34c8')],
    ground: [hex('#1a1040'), hex('#06041a'), hex('#03020c')],
    grid: hex('#9a6aff'), haze: hex('#b08aff'),
    mount: hex('#0c0820'), ridge: hex('#6aff9a'), palm: hex('#04020c'),
    csky: [hex('#0a0820'), hex('#4030a0'), hex('#c0b0ff'), hex('#ffffff')],
    cground: [hex('#0a0618'), hex('#2a1a50'), hex('#6a40c0'), hex('#d0ffd8')],
    cline: hex('#8affb0'), crim: hex('#f0e8ff'),
    cext: [hex('#5030a0'), hex('#24145a'), hex('#0a0620')],
    ink: { core: hex('#f4fff6'), tube: hex('#5cff8a'), glow: hex('#10e060'), shade: hex('#03020c') },
  }),
];
const stageOf = (h) => STAGES[(h + 2) % STAGES.length];
const mixArr = (a, b, u) => a.map((c, i) => mix(c, b[i], u));
function blendStage(a, b, u) {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const o = {};
  for (const k of Object.keys(a)) {
    if (k === 'name') o[k] = b[k];
    else if (k === 'ink') o.ink = { core: mix(a.ink.core, b.ink.core, u), tube: mix(a.ink.tube, b.ink.tube, u), glow: mix(a.ink.glow, b.ink.glow, u), shade: mix(a.ink.shade, b.ink.shade, u) };
    else o[k] = Array.isArray(a[k]) ? mixArr(a[k], b[k], u) : mix(a[k], b[k], u);
  }
  return o;
}
const chromeEnv = (st) => ({ sky: st.csky, ground: st.cground, line: st.cline, rim: st.crim, hz: 0.52, ext: st.cext });

// ------------------------------------------------------------ scenery
const STARS = Array.from({ length: 34 }, (_, i) => ({
  x: Math.floor(rand(i, 1) * W), y: Math.floor(rand(i, 2) * 34) + 1, p: rand(i, 3) * 6.283, b: 0.35 + 0.65 * rand(i, 4),
}));

function drawSky(g, st) {
  g.gradient(0, 0, W, HZ, st.sky);
  for (const s of STARS) {
    const tw = s.b * (0.6 + 0.4 * sin(s.p));
    g.pixel(s.x, s.y, mix(st.sky[0], 0xffffff, tw));
  }
}

function drawSun(g, st, t) {
  const cx = VX, cy = HZ - 1, r = 33;
  // the glow round it: soft rings, above the horizon only
  g.clip(0, 0, W, HZ);
  for (const [dr, a] of [[13, 0.1], [9, 0.12], [5.5, 0.16], [2.5, 0.22]]) g.fillCircle(cx, cy, r + dr, st.sun[2], { aa: true, a });
  g.unclip();
  const top = Math.ceil(cy - r);
  const slitPhase = (t * 3) % 6;
  for (let y = top; y < HZ; y++) {
    const dy = y + 0.5 - cy;
    if (Math.abs(dy) >= r) continue;
    // slits: in the lower half, thicker towards the horizon, drifting down
    const below = (y + 0.5) - (cy - r * 0.35);
    if (below > 0) {
      const u = (below - slitPhase + 60) % 6;
      const thick = 0.6 + below * 0.11;
      if (u < thick) continue;
    }
    const hw = Math.sqrt(r * r - dy * dy);
    const u = clamp((y - top) / (HZ - top), 0, 1);
    const c = ramp(st.sun, u);
    const x0 = cx - hw, x1 = cx + hw;
    const i0 = Math.ceil(x0), i1 = Math.floor(x1);
    g.hline(i0, y, i1 - i0, c);
    g.pixel(i0 - 1, y, c, { a: i0 - x0 });
    g.pixel(i1, y, c, { a: x1 - i1 });
  }
}

const MOUNTS = [
  // [x, peak height] ridgelines, left and right of the sun
  [[-4, 0], [6, 7], [13, 4], [22, 12], [31, 5], [38, 9], [47, 2], [54, 0]],
  [[104, 0], [112, 6], [120, 3], [129, 11], [137, 6], [146, 13], [155, 5], [164, 0]],
];
function drawMountains(g, st) {
  for (const m of MOUNTS) {
    const pts = m.map(([x, h]) => [x, HZ - h]);
    g.fillPolygon([...pts, [m[m.length - 1][0], HZ], [m[0][0], HZ]], st.mount);
    // facet lines from peaks to the foot between them
    for (let i = 1; i < m.length - 1; i++) {
      const [x, h] = m[i];
      if (h > 6) g.line(x, HZ - h, (x + m[i - 1][0]) / 2 + 2, HZ - 1, mix(st.mount, st.ridge, 0.45));
    }
    for (let i = 1; i < pts.length; i++) g.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], st.ridge);
  }
}

function drawGround(g, st, D, v) {
  g.gradient(0, HZ, W, H - HZ, [[0, st.ground[0]], [0.2, st.ground[1]], [1, st.ground[2]]]);
  // longitudinal lines through the vanishing point: faint where they crowd
  const lc = mix(st.ground[1], st.grid, 0.8);
  for (let i = -14; i <= 14; i++) {
    const xb = VX + (F * i * (H - HZ)) / K;
    const yA = HZ + 7;
    const xA = VX + (xb - VX) * ((yA - HZ) / (H - HZ));
    g.line(VX + (xb - VX) * (2 / (H - HZ)), HZ + 2, xA, yA, lc, { a: 0.35 });
    g.line(xA, yA, xb, H + 2, lc);
  }
  // cross lines, scrolling towards us; they fade where they would crowd,
  // and smear into streaks at speed
  const ph = D - Math.floor(D);
  const blur = v / 60;   // grid units moved per frame
  for (let k = 0; k < 60; k++) {
    const z = k + 1 - ph;
    if (z < K / (H - HZ + 4)) continue;
    const y = HZ + K / z;
    const gap = K / (z * z);
    const fade = clamp((gap - 0.9) / 2.6, 0, 1);
    if (fade <= 0) break;
    const smear = blur > 0.1 ? Math.min(16, K / z - K / (z + blur)) : 0;
    const y0 = Math.floor(y), fr = y - y0;
    const c = st.grid;
    if (smear > 1.2) {
      const n = Math.round(smear);
      g.fillRect(0, y0 - n, W, n, c, { a: Math.min(0.5, 1.4 / n) * fade });
      g.hline(0, y0, W, c, { a: fade });
    } else {
      g.hline(0, y0, W, c, { a: fade * (1 - fr) });
      g.hline(0, y0 + 1, W, c, { a: fade * fr });
    }
  }
  // the horizon glows
  g.gradient(0, HZ, W, 5, [[0, mix(st.haze, 0xffffff, 0.25)], [0.25, st.haze], [1, st.ground[1]]], { a: 0.75 });
}

// palms: alternate sides every 4 units, 12 units out
function drawPalms(g, st, D) {
  const step = 4, j0 = Math.ceil((D + 3) / step);
  for (let j = j0 + 16; j >= j0; j--) {
    const z = j * step - D;
    if (z < 3 || z > 64) continue;
    const side = ((j % 2) + 2) % 2 ? -1 : 1;
    const X = side * 12;
    const sx = VX + (F * X) / z, base = HZ + K / z, sc = F / z;
    if (sx + 4 * sc < 0 || sx - 4 * sc > W) continue;
    palm(g, sx, base, sc, side, st.palm, j);
  }
}
function palm(g, x, base, sc, side, c, seed) {
  const h = 6 * sc, lean = side * 0.9 * sc;
  const tx = x + lean, ty = base - h;
  const w = Math.max(1, 0.35 * sc);
  g.stroke([[x, base], [x + lean * 0.35, base - h * 0.5], [tx, ty]], w, c, { aa: true });
  const fr = [[-2.6, 0.5], [-1.9, 1.3], [-0.8, 1.6], [0.9, 1.5], [2.0, 1.1], [2.7, 0.4]];
  for (const [dx, dy] of fr) {
    const mx = tx + dx * 0.55 * sc, my = ty - 0.55 * sc;
    g.stroke([[tx, ty], [mx, my], [tx + dx * sc, ty + dy * sc]], Math.max(0.8, 0.3 * sc), c, { aa: true });
  }
}

function ramp(stops, u) {
  const n = stops.length - 1, f = clamp(u, 0, 1) * n, i = Math.min(n - 1, Math.floor(f));
  return mix(stops[i], stops[i + 1], f - i);
}

// ------------------------------------------------------------ the time
const LOGOS = new Map();
function logoFor(hh) {
  if (!LOGOS.has(hh)) LOGOS.set(hh, buildLogo(hh, { vx: VX, vy: HZ }));
  return LOGOS.get(hh);
}
const WORDS = new Map();
function wordFor(m) {
  const w = minuteWord(m);
  if (!WORDS.has(w)) WORDS.set(w, buildWord(w));
  return WORDS.get(w);
}

const BASE = 71;              // script baseline
const PACE = 300;             // pen speed, px of path a second
const centre = (Wd) => VX - Wd.w / 2;

// The writing of minute m: when it starts (s after the turn) and from where.
function writing(m, prevM) {
  const Wd = wordFor(m), Wp = wordFor(prevM);
  const n = sharedLetters(Wp.word, Wd.word);
  const from = n ? Wd.ends[n - 1] : 0;
  const start = m === 0 ? 1.25 : 0.05;
  return { Wd, Wp, from, start, end: start + (Wd.len - from) / PACE };
}
// The retracting of minute m's word before the turn into m + 1: [r0, r1] s into the minute.
function retracting(m, nextM) {
  const Wd = wordFor(m), Wn = wordFor(nextM);
  const n = sharedLetters(Wd.word, Wn.word);
  const to = n ? Wd.ends[n - 1] : 0;
  const hour = nextM === 0;
  const r0 = hour ? 56.9 : 58.95, r1 = hour ? 57.9 : 59.8;
  return { Wd, Wn, to, r0, r1 };
}

function scriptNow(f) {
  const m = f.m, sec = f.sec, prevM = (m + 59) % 60, nextM = (m + 1) % 60;
  const wr = writing(m, prevM);
  const rt = retracting(m, nextM);
  let Wd, upto, pen = false, glide;
  if (sec >= rt.r0) {
    Wd = rt.Wd;
    const p = clamp((sec - rt.r0) / (rt.r1 - rt.r0), 0, 1);
    upto = Wd.len + (rt.to - Wd.len) * ease.inOutQuad(p);
    pen = p > 0 && p < 1;
    const nx = writing(nextM, m);
    glide = { a: centre(Wd), b: centre(nx.Wd), u0: rt.r0 - 60, u1: nx.end, u: sec - 60 };
  } else {
    Wd = wr.Wd;
    upto = sec < wr.start ? wr.from : Math.min(Wd.len, wr.from + (sec - wr.start) * PACE);
    pen = sec >= wr.start && sec < wr.end;
    const pr = retracting(prevM, m);
    glide = { a: centre(pr.Wd), b: centre(Wd), u0: pr.r0 - 60, u1: wr.end, u: sec };
  }
  const gp = clamp((glide.u - glide.u0) / (glide.u1 - glide.u0), 0, 1);
  const ox = glide.a + (glide.b - glide.a) * ease.inOutCubic(gp);
  return { Wd, upto, pen, ox };
}

// The hour's logo: its perspective scale (0 = not shown).
function logoScale(f) {
  if (f.m === 59 && f.sec >= 58.2) {
    const p = (f.sec - 58.2) / 1.6;
    if (p >= 1) return 0;
    return 1 / (1 - 0.93 * Math.pow(p, 2.2));
  }
  if (f.m === 0 && f.sec < 1.4) {
    const p = f.sec / 1.4;
    return 1 / (1 + 15 * Math.pow(1 - p, 3));
  }
  return 1;
}

// ------------------------------------------------------------ the frame
export default {
  name: 'Synthwave',
  blurb: 'An 80s title card on an endless night drive: the hour in live-reflecting chrome, the minutes laser-written in neon script; each hour the title flies over the camera at turbo speed and the route enters a new stage.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields;
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    const T = f.h * 3600 + f.m * 60 + f.sec;
    const D = driven(T), v = speed(T);
    // the stage: one per hour, crossing over as the turbo peaks
    const cur = stageOf(f.h);
    let st = cur;
    if (f.m === 59 && f.sec > 59.4) st = blendStage(cur, stageOf((f.h + 1) % 24), smoother((f.sec - 59.4) / 1.4));
    else if (f.m === 0 && f.sec < 0.8) st = blendStage(stageOf((f.h + 23) % 24), cur, smoother((f.sec + 0.6) / 1.4));

    drawSky(g, st);
    drawSun(g, st, T);
    drawMountains(g, st);
    drawGround(g, st, D, v);

    const s = logoScale(f);
    if (s > 0) {
      const shineT = f.sec % 12;
      const L = logoFor(f.hh);
      const shine = shineT < 0.9 ? L.x0 - 10 + (L.w + 40) * (shineT / 0.9) : -99;
      drawLogo(g, L, s, chromeEnv(f.m === 0 && f.sec < 1.4 ? cur : (f.m === 59 ? cur : st)), D * 0.5, { shine });
    }
    drawPalms(g, st, D);

    const sc = scriptNow(f);
    if (sc.upto > 0.01) {
      let flick = 1;
      const fs = 12 + Math.floor(rand(f.minuteKey, 7) * 40);
      if (f.sec > fs && f.sec < fs + 0.45) flick = Math.floor(f.sec * 24) % 3 ? 1 : 0.25;
      drawWord(g, sc.Wd, sc.ox, BASE, sc.upto, st.ink, { flick });
      if (sc.pen) drawPen(g, sc.Wd, sc.ox, BASE, sc.upto, st.ink);
    }
  },
};
