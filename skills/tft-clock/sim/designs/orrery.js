// Orrery: wandering hours told by two worlds circling a small sun.
//
// The 2:1 strip is a circle seen at a shallow angle, so the whole glass is
// one tilted orbital plane. Two planets share an orbit, opposite each
// other, and go round once every two hours. The one passing in front of
// the sun carries the hour: its continents are the hour's numerals. Where
// it is on the front half of the orbit is the minute, read off the outer
// ring, whose swept arc glows from :00 to the planet's place like dust
// stirred by its passage. The other world is behind the sun, wrapped in
// cloud; it will bring the next hour.
//
// Reading it: the planet in front says the hour, the end of the lit arc on
// the ring says the minute (marks every five, numbered 0, 15, 30, 45, 60). The
// moon goes round the hour-planet once a minute.
//
// The light is real: each planet is lit by the sun, so its phase turns
// through the hour. At :00 it arrives from the left half lit, by :30 it is
// in front of the sun and we see its night side, where the same continents
// are traced by city lights; by :60 it is half lit again. The numerals
// change colour as the terminator crosses them, sand by day, lights by night.
//
// At the hour the clouds close over the old world in its last seconds, the
// light of the full arc runs round the back of the ring to the start, the
// sun flares, and the clouds part on the arriving world to show the new hour.
//
// Rendering: flat two-tone phase with a one-pixel terminator, no shading
// gradients on the bodies; space and the sun's corona are one coarse shader;
// the rings are anti-aliased hairlines baked at load.
//
// Palette: deep indigo space, a cream-gold sun, and two worlds of opposite
// temperature: a blue ocean world with sand continents and amber cities
// (even hours), a red-sea world with pale continents and cyan cities (odd).

import {
  hex, mix, scale, sin, cos, clamp, rand, noise2, progress, ease, font3x5,
} from '../js/kit.js';
import { WORLD, N as TN } from './orrery-worlds.js';

// ---- geometry: the orbital plane seen from slightly above
const CX = 80, CY = 31;          // the sun
const RX = 60, RY = 19;          // the planets' orbit
const QX = 74, QY = 36;          // the minute ring
const SIN_E = RY / RX, COS_E = Math.sqrt(1 - SIN_E * SIN_E);
const SUN_R = 9;
const TAU = Math.PI * 2;
const DAY = 86400;
/**
 * The angle of something that turns n whole times a day (n an integer), at
 * `tod` seconds into the day: the same at 24:00 as at 00:00, so every
 * continuous motion carries on across midnight without a jump.
 */
const dayTurn = (n, tod) => TAU * (((n * tod) % DAY) / DAY);

// θ runs 0 at the left extreme, π/2 nearest the viewer, π at the right,
// 3π/2 behind the sun: anticlockwise seen from above.
const onOrbit = (rx, ry, th) => [CX - rx * cos(th), CY + ry * sin(th)];
const planetR = (z) => 11 + 5 * z;

// ---- palette
const SPACE_TOP = hex('05061a'), SPACE_BOT = hex('0c0f2e'), NEBULA = hex('2a1645'), NEBULA2 = hex('0d2c40');
const GLOW = hex('ff9440'), GLOW_HOT = hex('ffd27a');
const SUN_CORE = hex('fff5d6'), SUN_LIMB = hex('ffc65a');
const RING_DIM = hex('3a4a7a'), RING_LIT = hex('ffcf7a'), RING_BACK = hex('243058');
const ORBIT = hex('34406c');
const LABEL = hex('8f9ac8');

const WORLDS = [
  { // even hours: blue ocean, sand continents, amber cities
    ocean: hex('2c6cb4'), land: hex('e9d08a'), ice: hex('f2f6ff'),
    nOcean: hex('15245a'), nLand: hex('3a2a22'), city: hex('ffae3c'), cityHot: hex('fff0b0'),
    rim: hex('8fd0ff'), cloud: hex('f3f6ff'), nCloud: hex('252a44'), band: hex('c9d8f0'),
  },
  { // odd hours: red seas, pale continents, cyan cities
    ocean: hex('a83e2a'), land: hex('f4e4c4'), ice: hex('fff8ee'),
    nOcean: hex('3a1630'), nLand: hex('20283a'), city: hex('4fe0ff'), cityHot: hex('dcfcff'),
    rim: hex('ffb48c'), cloud: hex('fff2e6'), nCloud: hex('30222c'), band: hex('f0c8a8'),
  },
];
const MOON_LIT = hex('d6d0c4'), MOON_DARK = hex('1c1c2a');

// ---- baked hairlines: each pixel of an ellipse with its coverage and θ
function bakeEllipse(rx, ry) {
  const acc = new Map();
  const steps = 2400;
  for (let k = 0; k < steps; k++) {
    const th = (k / steps) * TAU;
    const x = CX - rx * Math.cos(th), y = CY + ry * Math.sin(th);
    const dx = rx * Math.sin(th), dy = ry * Math.cos(th);
    const ds = Math.hypot(dx, dy) * (TAU / steps);
    const fx = x - 0.5, fy = y - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), ux = fx - ix, uy = fy - iy;
    for (const [px, py, w] of [[ix, iy, (1 - ux) * (1 - uy)], [ix + 1, iy, ux * (1 - uy)], [ix, iy + 1, (1 - ux) * uy], [ix + 1, iy + 1, ux * uy]]) {
      const key = py * 256 + px;
      const e = acc.get(key) ?? { x: px, y: py, a: 0, s: 0, c: 0, n: 0 };
      e.a += w * ds; e.s += Math.sin(th) * w; e.c += Math.cos(th) * w; e.n += w;
      acc.set(key, e);
    }
  }
  const out = [];
  for (const e of acc.values()) {
    if (e.x < 0 || e.y < 0 || e.x >= 160 || e.y >= 80 || e.a < 0.08) continue;
    let th = Math.atan2(e.s, e.c); if (th < 0) th += TAU;
    out.push({ x: e.x, y: e.y, a: Math.min(1, e.a), th });
  }
  return out;
}
const RING = bakeEllipse(QX, QY);
const ORBIT_PX = bakeEllipse(RX, RY);

// ---- stars: fixed, away from the sun
const STARS = [];
for (let i = 0; STARS.length < 70 && i < 400; i++) {
  const x = Math.floor(rand(i, 1) * 160), y = Math.floor(rand(i, 2) * 80);
  const dsun = Math.hypot(x - CX, (y - CY) * 1.4);
  if (dsun < 8) continue;
  // Twinkle rate in whole cycles a day (0.6 to 2.8 rad/s).
  STARS.push({ x, y, b: 0.25 + 0.75 * rand(i, 3) ** 2, n: Math.round((0.6 + 2.2 * rand(i, 4)) * DAY / TAU), p: rand(i, 5) * TAU, blue: rand(i, 6) < 0.3 });
}

/** Cheap pseudo-angle in [0, 4): monotonic in the true angle, no atan2. */
function pseudoAngle(dx, dy) {
  const p = dx / (Math.abs(dx) + Math.abs(dy) + 1e-6);
  return dy < 0 ? 3 + p : 1 - p;
}

/**
 * The sun's pulse: a thin ellipse of light in the orbital plane, radius rx,
 * opacity a. Only the half asked for (front or back), so the bodies stack.
 */
function drawPulse(g, rx, a, wantFront, c) {
  const ry = rx <= RX ? rx * SIN_E : RY + (QY - RY) * (rx - RX) / (QX - RX);
  const n = Math.ceil(rx * 3.2);
  for (let k = 0; k < n; k++) {
    const th = (wantFront ? 0 : Math.PI) + Math.PI * (k + 0.5) / n;
    const x = CX - rx * cos(th), y = CY + ry * sin(th);
    g.pixel(x, y, c, { a });
  }
}

// ---- the planet shader
/**
 * Paint one world at (x0, y0), radius r, orbit angle th.
 * w: palette; tex: continent texture or null; cover: 0 clear .. 1 full cloud;
 * spin: texture longitude drift; tod: seconds of the day (for clouds and lights).
 */
function drawWorld(g, x0, y0, r, th, w, tex, cover, spin, tod, moon) {
  // The sun's direction in view space (x right, y up, z toward the viewer).
  const lx = cos(th), ly = sin(th) * SIN_E, lz = -sin(th) * COS_E;
  // Atmosphere: an anti-aliased disc half a pixel larger, lit side tinted.
  g.fillCircle(x0, y0, r + 0.6, mix(w.nOcean, w.rim, 0.45), { aa: true });
  const inv = 1 / r;
  // Cloud drift: the noise field slides along a day-long circle (radius chosen
  // for the old straight-line speed), the ripples turn whole times a day.
  const a1 = dayTurn(1, tod), ca = cos(a1), sa = sin(a1);
  const ox = 495 * ca, oy = 495 * sa, bx = 165 * ca, by = 165 * sa;
  const ripple = dayTurn(165, tod), roll = dayTurn(330, tod);
  // The moon's position, for its shadow on the day side.
  const mx = moon ? moon.vx : 0, my = moon ? moon.vy : 0, mz = moon ? moon.vz : 0, mr = moon ? moon.r * inv : 0;
  g.paint((px, py, ix, iy) => {
    const dx = (px - x0) * inv, dy = (py - y0) * inv;
    const d2 = dx * dx + dy * dy;
    if (d2 >= 1) return -1;
    const nz = Math.sqrt(1 - d2);
    const lit = dx * lx - dy * ly + nz * lz;          // > 0 on the day side
    // Texture coordinates on the globe: mild limb compression, slow libration.
    const u = dx * (0.84 + 0.16 * dx * dx) + spin, v = dy * (0.86 + 0.14 * dy * dy);
    let t = 0;
    if (tex && u > -1 && u < 1) {
      const ti = ((u + 1) * 0.5 * TN) | 0, tj = ((v + 1) * 0.5 * TN) | 0;
      t = tex[clamp(tj, 0, TN - 1) * TN + clamp(ti, 0, TN - 1)];
    } else if (Math.abs(v) > 0.88) t = 2;
    // Clouds: wisps always; a full deck when `cover` is 1.
    const cn = noise2(u * 2.6 + ox, v * 5.5 + sin(u * 3 + ripple) * 0.6 + oy, 9);
    const bands = 0.5 + 0.5 * sin(v * 9 + noise2(u * 2 + bx, v * 3 + by, 4) * 3 + roll);
    const deck = cover * (0.55 + 0.45 * bands);
    const wisp = clamp((cn - 0.7) * 4, 0, 0.55) * (1 - cover);
    const cloud = clamp(deck + wisp, 0, 1);
    // Day colour and night colour, then the terminator between them.
    let day = t === 1 ? w.land : t === 2 ? w.ice : w.ocean;
    let night;
    if (t === 1) {
      const k = rand(((u + 2) * 40) | 0, ((v + 2) * 40) | 0, 77);
      const flick = 0.9 + 0.1 * sin(dayTurn(27502 + ((k * 68755) | 0), tod) + k * 40);   // 2 to 7 rad/s
      night = k > 0.86 ? w.cityHot : mix(w.nLand, w.city, (0.72 + 0.28 * k) * flick);
    } else night = t === 2 ? mix(w.nOcean, w.ice, 0.12) : w.nOcean;
    // The moon's shadow: does the sunward ray from this point hit the moon?
    let shade = 1;
    if (moon && lit > 0) {
      const sx = dx - mx, sy = -dy - my, sz = nz - mz;              // from moon to surface point
      const along = sx * lx + sy * ly + sz * lz;                   // < 0: moon is sunward
      if (along < 0) {
        const qx = sx - along * lx, qy = sy - along * ly, qz = sz - along * lz;
        if (qx * qx + qy * qy + qz * qz < mr * mr * 1.4) shade = 0.35;
      }
    }
    day = mix(day, w.cloud, cloud * 0.9);
    night = mix(night, w.nCloud, cloud * 0.92);
    if (shade < 1) day = mix(night, day, shade);
    const f = clamp(lit * 9 + 0.5, 0, 1);
    let c = f >= 1 ? day : f <= 0 ? night : mix(night, day, f);
    // A bright sliver of atmosphere on the lit limb.
    if (d2 > 0.78 && lit > -0.05) c = mix(c, w.rim, clamp((d2 - 0.78) * 4.5, 0, 0.7) * clamp(lit * 6 + 0.4, 0, 1));
    return c;
  }, [x0 - r - 1, y0 - r - 1, 2 * r + 2, 2 * r + 2]);
}

function drawMoon(g, x, y, r, th) {
  const lx = cos(th), ly = sin(th) * SIN_E, lz = -sin(th) * COS_E;
  g.fillCircle(x, y, r + 0.4, mix(MOON_DARK, MOON_LIT, 0.35), { aa: true });
  const inv = 1 / r;
  g.paint((px, py) => {
    const dx = (px - x) * inv, dy = (py - y) * inv, d2 = dx * dx + dy * dy;
    if (d2 >= 1) return -1;
    const lit = dx * lx - dy * ly + Math.sqrt(1 - d2) * lz;
    return lit > 0.05 ? MOON_LIT : lit < -0.05 ? MOON_DARK : mix(MOON_DARK, MOON_LIT, 0.5);
  }, [x - r - 1, y - r - 1, 2 * r + 2, 2 * r + 2]);
}

export default {
  name: 'Orrery',
  blurb: 'Wandering hours: the world in front of the sun has the hour for continents; where it is in its orbit is the minute.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec;
    const tod = f.h * 3600 + f.m * 60 + sec;
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.6 * night);

    const hourPos = (f.m + sec / 60) / 60;                 // 0..1 through the hour
    const thNow = Math.PI * hourPos;

    // The hour show: closing clouds at :59:57, the arc's light running round
    // the back in the first seconds, the sun's flare, the clouds parting.
    const closing = f.m === 59 ? progress(sec, 57, 59.95) : 0;
    const opening = f.m === 0 ? 1 - ease.inOutQuad(progress(sec, 1.2, 4.2)) : 0;
    const runU = f.m === 0 ? progress(sec, 0, 3.2) : 1;
    // Peaks at :00.6 and dies by :02.8; eased in over the first 0.4 s and out
    // over the last 0.4 s so the corona never jumps between two frames.
    const flare = f.m === 0
      ? Math.max(0, 1 - Math.abs(sec - 0.6) / 2.2) * ease.inOutQuad(progress(sec, 0, 0.4)) * ease.inOutQuad(progress(sec, 2.8, 2.4))
      : 0;
    const minuteFlash = sec < 1.2 ? 1 - sec / 1.2 : 0;

    // ---- space and the corona
    const rayA = dayTurn(2888, tod), rayB = dayTurn(1788, tod);   // about 0.21 and 0.13 rad/s
    g.coarse((x, y) => {
      let c = mix(SPACE_TOP, SPACE_BOT, y / 80);
      const n = noise2(x * 0.03 + 5, y * 0.05 - x * 0.012, 3);
      c = mix(c, NEBULA, clamp((n - 0.45) * 1.6, 0, 0.55));
      const n2 = noise2(x * 0.05 - 2, y * 0.04 + 9, 8);
      c = mix(c, NEBULA2, clamp((n2 - 0.55) * 1.8, 0, 0.5));
      const dx = x - CX, dy = (y - CY) * 1.25;
      const d = Math.sqrt(dx * dx + dy * dy);
      const reach = 34 + 10 * flare;
      if (d < reach) {
        const pa = pseudoAngle(dx, dy);
        const rays = 0.75 + 0.25 * sin(pa * 9.42 + rayA) * sin(pa * 4.71 - rayB + d * 0.08);
        const k = (1 - d / reach) ** 2 * rays * (0.85 + 0.4 * flare);
        c = mix(c, mix(GLOW, GLOW_HOT, clamp(k * 1.3, 0, 1)), clamp(k, 0, 1));
      }
      return c;
    }, { cell: 4 });

    // ---- stars
    for (const s of STARS) {
      // The field drifts slowly past: the whole system travels.
      const x = (s.x + 160 * (((22 * tod) % DAY) / DAY)) % 160;   // 22 laps a day, 0.04 px/s
      if (Math.abs(x - CX) < 22 && Math.abs(s.y - CY) < 16) continue;
      const tw = 0.6 + 0.4 * sin(dayTurn(s.n, tod) + s.p);
      g.pixel(x, s.y, s.blue ? 0xbcd4ff : 0xfff4e0, { a: s.b * tw });
    }

    // ---- where everything is
    const bodies = [];
    for (let p = 0; p < 2; p++) {
      // Planet p carries the hours of its parity; it is in front during them.
      const th = Math.PI * ((((f.h - p) % 2) + 2) % 2 + hourPos);
      const front = ((f.h - p) % 2 + 2) % 2 === 0;
      const z = sin(th);
      const [x, y] = onOrbit(RX, RY, th);
      const r = planetR(z);
      const hour = front ? f.h : null;
      const cover = front ? Math.max(closing, opening) : 1;
      // The moon: once round its planet each minute.
      const ph = TAU * (sec / 60) + p * Math.PI;
      const mr = r + 5.5, mzS = sin(ph);
      const mxv = -cos(ph) * mr, myv = mzS * mr * SIN_E;
      const moonR = 2.2 + 0.9 * z;
      const moon = { x: x + mxv, y: y + myv, r: moonR, z: z + mzS * 0.05, vx: -cos(ph) * mr / r, vy: -mzS * mr * SIN_E / r, vz: mzS * mr * COS_E / r };
      bodies.push({ kind: 'world', p, th, x, y, r, z, hour, cover, moon });
      bodies.push({ kind: 'moon', th, x: moon.x, y: moon.y, r: moonR, z: moon.z });
    }
    // A little inner planet, a tick of motion close to the sun.
    {
      const th = dayTurn(6171, tod);   // 6171 laps a day: one every 14.0 s
      const [x, y] = onOrbit(19, 19 * SIN_E, th);
      bodies.push({ kind: 'inner', th, x, y, r: 1.3 + 0.3 * sin(th), z: sin(th) * 0.3 });
    }

    // ---- the back of the orbit and the ring
    const ringA = (th) => {
      // How lit the ring is at θ: the swept arc, the runner at the hour.
      if (th <= Math.PI) {
        if (th <= thNow) return 1;
        return 0;
      }
      return 0;
    };
    const runHead = Math.PI + Math.PI * ease.outQuad(runU), runTail = TAU * ease.inQuad(runU);
    const inRun = (th) => runU < 1 && ((th >= runTail && th <= runHead) || (th <= Math.PI && runTail <= Math.PI && th >= runTail && th <= Math.PI));
    const drawRing = (wantFront) => {
      for (const e of RING) {
        const isFront = e.th <= Math.PI;
        if (isFront !== wantFront) continue;
        let c, a;
        if (inRun(e.th)) { c = RING_LIT; a = e.a * (isFront ? 0.95 : 0.85); }
        else if (isFront) {
          const lit = ringA(e.th);
          c = lit ? RING_LIT : RING_DIM;
          a = e.a * (lit ? 0.5 + 0.45 * clamp(1 - (thNow - e.th) * 0.25, 0.3, 1) : 0.8);
        } else { c = RING_BACK; a = e.a * 0.7; }
        g.pixel(e.x, e.y, c, { a });
      }
    };
    const drawOrbit = (wantFront) => {
      for (const e of ORBIT_PX) {
        if ((e.th <= Math.PI) !== wantFront) continue;
        g.pixel(e.x, e.y, ORBIT, { a: e.a * (wantFront ? 0.6 : 0.45) });
      }
    };
    drawRing(false);
    drawOrbit(false);
    // Each minute the sun sends a ring of light out through the plane; at the
    // hour, three.
    const pulses = [];
    const nP = f.m === 0 ? 3 : 1;
    for (let i = 0; i < nP; i++) {
      const q = (sec - i * 0.45) / 1.8;
      if (q > 0 && q < 1) pulses.push({ rx: SUN_R + (QX - SUN_R) * ease.outQuad(q), a: (1 - q) * (f.m === 0 ? 0.9 : 0.6) });
    }
    for (const pu of pulses) drawPulse(g, pu.rx, pu.a * 0.6, false, GLOW_HOT);

    // ---- bodies behind the sun, then the sun, then the front
    const draw = (b) => {
      if (b.kind === 'world') {
        const w = WORLDS[b.p];
        const tex = b.hour === null ? null : WORLD[b.hour];
        const spin = 0.07 * sin(dayTurn(3438, tod) + b.p * 2);   // about 0.25 rad/s
        drawWorld(g, b.x, b.y, b.r, b.th, w, tex, b.cover, spin, tod, b.moon);
      } else if (b.kind === 'moon') drawMoon(g, b.x, b.y, b.r, b.th);
      else {
        const inFront = b.z > 0 && Math.hypot(b.x - CX, b.y - CY) < SUN_R;
        g.fillCircle(b.x, b.y, b.r, inFront ? hex('2a1408') : hex('c8b6a0'), { aa: true });
      }
    };
    const back = bodies.filter((b) => b.z < 0).sort((a, b) => a.z - b.z);
    const fore = bodies.filter((b) => b.z >= 0).sort((a, b) => a.z - b.z);
    for (const b of back) draw(b);
    // The glare over whatever is behind the sun.
    for (const b of back) {
      const d = Math.hypot(b.x - CX, (b.y - CY) * 1.25);
      if (d > 34) continue;
      g.fillWhere((px, py) => {
        const dx = px - CX, dy = (py - CY) * 1.25;
        const k = 1 - Math.sqrt(dx * dx + dy * dy) / 34;
        return k > 0 ? k * k * 1.1 : 0;
      }, GLOW_HOT, [b.x - b.r - 1, b.y - b.r - 1, 2 * b.r + 2, 2 * b.r + 2]);
    }
    // The sun: a cream disc with a gold limb, swelling a little at the flare.
    const sr = SUN_R + 1.2 * flare;
    g.fillCircle(CX, CY, sr + 1.2, mix(SUN_LIMB, GLOW, 0.3), { aa: true });
    g.fillCircle(CX, CY, sr, SUN_LIMB, { aa: true });
    g.fillCircle(CX, CY, sr - 1.6, SUN_CORE, { aa: true });

    drawOrbit(true);
    for (const pu of pulses) drawPulse(g, pu.rx, pu.a, true, GLOW_HOT);
    drawRing(true);
    // Minute marks on the ring, and the runner's head.
    for (let m = 0; m <= 60; m++) {
      const th = Math.PI * m / 60;
      const big = m % 5 === 0;
      const swept = th <= thNow;
      if (big) {
        const [ax, ay] = onOrbit(QX, QY, th), [bx, by] = onOrbit(QX - 3.5, QY - 1.8, th);
        g.thickLine(ax, ay, bx, by, m % 15 === 0 ? 1.4 : 1, swept ? RING_LIT : LABEL, { aa: true, a: swept ? 0.95 : 0.6 });
      }
    }
    for (const [m, txt, ox, oy] of [[0, '0', -4, -2], [15, '15', -6, 1], [30, '30', -3, 2], [45, '45', 0, 1], [60, '60', -3, -9]]) {
      const [x, y] = onOrbit(QX, QY, Math.PI * m / 60);
      const swept = Math.PI * m / 60 <= thNow;
      g.text(txt, x + ox, y + oy, { font: font3x5, c: swept ? RING_LIT : LABEL, a: swept ? 0.95 : 0.75 });
    }
    {
      const [hx, hy] = onOrbit(QX, QY, thNow);
      const glow = 1.6 + 1.2 * minuteFlash;
      g.fillCircle(hx, hy, glow + 1.2, RING_LIT, { aa: true, a: 0.35 });
      g.fillCircle(hx, hy, glow * 0.7, 0xfff6e0, { aa: true });
    }
    if (runU < 1) {
      const [rx, ry] = onOrbit(QX, QY, runHead);
      g.fillCircle(rx, ry, 1.8, 0xfff6e0, { aa: true });
    }
    for (const b of fore) draw(b);
  },
};
