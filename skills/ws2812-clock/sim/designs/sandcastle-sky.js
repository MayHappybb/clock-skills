// Low Tide: sky, sun or moon by the time of day, clouds, gulls, the dune and the far sea.
import * as kit from '../js/kit.js';
import { GW, GH, GROUND, img, over, addPx, C, dot } from './sandcastle-common.js';

const NIGHT_TOP = C('#020309'), NIGHT_HOR = C('#0a1330');
const DAY_TOP = kit.scale(C('#2464b4'), 0.68), DAY_HOR = kit.scale(C('#8cc4e8'), 0.5);
const DUSK_TOP = C('#141436'), DUSK_HOR = kit.scale(C('#d8582a'), 0.28);
const SUN = C('#fff2c8'), SUN_LOW = C('#ff6a28'), MOON = C('#e8ecff');
const FARSEA = C('#1a5a80'), DUNE = C('#8a6840'), GRASS = C('#5c7428'), GULL = C('#f4f4f0');

const STARS = Array.from({ length: 70 }, (_, i) => [kit.hash(i, 1) * GW, kit.hash(i, 2) ** 1.4 * 44, 0.4 + 0.6 * kit.hash(i, 3), kit.hash(i, 4) * 6.28]);
const CLOUDS = [
  { y: 9, v: 0.55, x0: 10, puffs: [[0, 0, 3.2], [4, -1.5, 3.8], [8.5, 0, 3], [3.5, 1.4, 3], [-3.5, 0.8, 2.2]] },
  { y: 19, v: 0.35, x0: 95, puffs: [[0, 0, 2.4], [3.5, -1, 2.8], [6.5, 0.3, 2.2], [-2.6, 0.6, 1.8]] },
  { y: 4, v: 0.8, x0: 150, puffs: [[0, 0, 2], [3, -0.6, 2.4], [5.5, 0.2, 1.8]] },
];
const TUFTS = [7, 15, 24, 37, 44, 52, 61];
export const duneTop = (x) => GROUND - (5.6 + 1.8 * Math.sin(x * 0.08 + 0.5) + 1.1 * Math.sin(x * 0.23)) * kit.smoothstep(84, 52, x);
export const FARSEA_Y = 45.5;

/** Everything about the light at this moment: sun, moon, sky colours, castle light. */
export function environment(date, now) {
  const hf = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600 + date.getMilliseconds() / 3.6e6;
  const ps = (hf - 6) / 13, pm = (((hf - 19) % 24) + 24) % 24 / 11;
  const es = Math.sin(Math.PI * ps), em = Math.sin(Math.PI * pm);
  const sun = { x: 6 + ps * 116, y: 47 - es * 40, up: ps > -0.05 && ps < 1.05 };
  const moon = { x: 8 + pm * 112, y: 47 - em * 38, up: pm > -0.05 && pm < 1.05, phase: kit.fract((now - 947182440) / 86400 / 29.530588) };
  const elev = ps >= 0 && ps <= 1 ? es : -Math.min(Math.abs(ps), Math.abs(ps - 1)) * 3;
  const dayK = kit.smoothstep(-0.12, 0.3, elev), duskK = Math.exp(-(((elev - 0.04) / 0.16) ** 2));
  const top = kit.mix(kit.mix(NIGHT_TOP, DAY_TOP, dayK), DUSK_TOP, duskK * 0.6);
  const hor = kit.mix(kit.mix(NIGHT_HOR, DAY_HOR, dayK), DUSK_HOR, duskK * 0.8);
  // castle light: the sun by day (warm low down), the moon by night, blended through twilight
  const w = kit.smoothstep(0.03, 0.4, dayK);
  const lx = kit.lerp(kit.clamp((moon.x - 64) / 70, -0.85, 0.85), kit.clamp((sun.x - 64) / 70, -0.85, 0.85), w);
  const lcol = kit.mix([0.62, 0.72, 1], kit.mix([1, 0.97, 0.9], [1, 0.8, 0.62], duskK), w);
  const moonLit = 0.5 - 0.5 * Math.cos(2 * Math.PI * moon.phase);
  const lev = kit.lerp(0.42 + 0.14 * moonLit, 0.6 + 0.4 * dayK, w) + 0.3 * duskK;
  return { hf, now, sun, moon, dayK, duskK, top, hor, lx, lcol, lev, amb: kit.mix(hor, top, 0.5) };
}

function cloudPass(E, now) {
  const tint = kit.mix(kit.mix([0.025, 0.03, 0.05], [0.62, 0.62, 0.66], E.dayK), [0.9, 0.42, 0.3], E.duskK * 0.7);
  for (const cl of CLOUDS) {
    const cx = ((cl.x0 + now * cl.v) % 200 + 200) % 200 - 30;
    const x0 = Math.max(0, Math.floor(cx - 7)), x1 = Math.min(GW - 1, Math.ceil(cx + 13));
    for (let y = Math.max(0, cl.y - 5); y <= cl.y + 4; y++) for (let x = x0; x <= x1; x++) {
      let cov = 0;
      for (const [dx, dy, r] of cl.puffs) cov = Math.max(cov, r + 0.5 - Math.hypot(x + 0.5 - cx - dx, y + 0.5 - cl.y - dy));
      if (cov <= 0) continue;
      const shade = 0.75 + 0.25 * kit.clamp((cl.y + 1 - y) / 4);
      over(y * GW + x, kit.scale(tint, shade), Math.min(1, cov) * 0.9);
    }
  }
}

function gulls(E, now) {
  if (E.dayK < 0.2) return;
  for (let i = 0; i < 2; i++) {
    const span = 190, v = 6 + 2.5 * i;
    const gx = ((now * v + i * 97) % span) - 30, gy = 7 + 6 * i + 2.5 * Math.sin(now * 0.37 + i * 2);
    if (gx < -6 || gx > GW + 6) continue;
    const glide = kit.smoothstep(-0.2, 0.3, Math.sin(now * 0.45 + i * 1.7));
    const f = (1 - glide) * Math.sin(now * 9 + i) + glide * 0.25;
    const pts = [[gx - 4.2, gy - 1.6 * f], [gx - 1.8, gy - 0.6 - 0.9 * f], [gx, gy + 0.3], [gx + 1.8, gy - 0.6 - 0.9 * f], [gx + 4.2, gy - 1.6 * f]];
    const bx0 = Math.max(0, Math.floor(gx - 6)), bx1 = Math.min(GW - 1, Math.ceil(gx + 6));
    for (let y = Math.max(0, Math.floor(gy - 4)); y <= Math.min(GH - 1, gy + 3); y++) for (let x = bx0; x <= bx1; x++) {
      let d = 9;
      for (let k = 0; k < 4; k++) d = Math.min(d, kit.segDist(x + 0.5, y + 0.5, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]));
      const cov = 0.95 - d;
      if (cov > 0) over(y * GW + x, kit.scale(GULL, 0.5 + 0.4 * E.dayK), Math.min(1, cov) * E.dayK);
    }
  }
}

/** Paint the whole background: sky, lights in it, the dune and the far sea. */
export function drawSky(E, now) {
  const { top, hor } = E;
  const sg = kit.mix(SUN_LOW, [1, 0.8, 0.5], E.dayK * (1 - E.duskK));
  for (let y = 0; y < GH; y++) {
    const t = kit.clamp(y / 48) ** 1.3;
    const r = top[0] + (hor[0] - top[0]) * t, g = top[1] + (hor[1] - top[1]) * t, b = top[2] + (hor[2] - top[2]) * t;
    for (let x = 0; x < GW; x++) {
      const o = 3 * (y * GW + x);
      img[o] = r; img[o + 1] = g; img[o + 2] = b;
      if (E.sun.up) {
        const dx = x - E.sun.x, dy = y - E.sun.y, gl = Math.exp(-(dx * dx + dy * dy) / 260) * (0.1 + 0.3 * E.duskK);
        img[o] += sg[0] * gl; img[o + 1] += sg[1] * gl; img[o + 2] += sg[2] * gl;
      }
    }
  }
  const starK = (1 - E.dayK) ** 2;
  if (starK > 0.01) for (const [x, y, b, ph] of STARS) {
    const tw = 0.55 + 0.45 * Math.sin(now * 1.3 + ph * 3);
    addPx((y | 0) * GW + (x | 0), [0.75, 0.8, 1], 0.09 * b * tw * starK);
  }
  if (E.sun.up) dot(E.sun.x, E.sun.y, 3.1, kit.mix(SUN, SUN_LOW, E.duskK), 1);
  if (E.moon.up && E.dayK < 0.9) moonDisc(E);
  cloudPass(E, now);
  gulls(E, now);
  // the far sea: a band of distant water on the right, behind the beach
  const fs = kit.scale(FARSEA, 0.25 + 0.75 * Math.max(E.dayK, 0.15));
  for (let x = 0; x < GW; x++) {
    const fade = 1;
    for (let y = Math.floor(FARSEA_Y); y < GROUND; y++) {
      const cov = Math.min(1, y + 1 - FARSEA_Y);
      const p = y * GW + x;
      over(p, kit.scale(fs, y === Math.floor(FARSEA_Y) ? 1.5 : 0.75 + 0.2 * (y - FARSEA_Y) / 5), cov * fade);
      // glitter under the sun or moon
      const L = E.sun.up ? E.sun : E.moon;
      const near = Math.exp(-((x - L.x) ** 2) / 40);
      if (near > 0.05 && kit.hash(x, y, Math.floor(now * 7 + x * 0.3)) > 0.82) addPx(p, E.sun.up ? [1, 0.85, 0.6] : [0.5, 0.55, 0.7], near * 0.35 * (E.sun.up ? 1 : 0.4));
    }
  }
}

function moonDisc(E) {
  const { x: mx, y: my, phase } = E.moon, r = 2.8, k = Math.cos(phase * 2 * Math.PI);
  for (let y = Math.floor(my - r - 1); y <= my + r + 1; y++) for (let x = Math.floor(mx - r - 1); x <= mx + r + 1; x++) {
    if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
    const dx = x + 0.5 - mx, dy = y + 0.5 - my, d = Math.hypot(dx, dy), cov = kit.clamp(r + 0.5 - d);
    if (cov <= 0) continue;
    const w = Math.sqrt(Math.max(0, r * r - dy * dy));
    const lit = phase < 0.5 ? kit.clamp(dx - k * w + 0.5) : kit.clamp(-k * w - dx + 0.5);
    over(y * GW + x, kit.scale(MOON, 0.07 + 0.6 * lit), cov * (1 - E.dayK));
  }
}
