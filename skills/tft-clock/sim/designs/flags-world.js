// flags: the world seen through the glasses. A two-masted schooner lies at
// anchor in a swell, bow to the wind (left), so its hoists stream aft
// (right). World units are screen pixels at zoom 1 (the binocular view).
//
// Everything is drawn through a camera { z, cx, cy, ox, oy }:
//   screen = (world - c) * z + (80, 40) + (ox, oy)
// and the ship's own pitch and heave are applied before it.

import { mix, scale, hex, sin, cos, rand, noise, clamp, lerp } from '../js/kit.js';
import { drawPennant, H0 } from './flags-pennants.js';

export const HOR = 50;        // horizon
export const WL = 61;         // waterline
export const FORE = 30, MAIN = 106;   // mast feet x
export const PEN_TOP = [3, 19];       // pennant tops, raised, world y

// ------------------------------------------------------------ light of day
const DAY = [
  // h, skyTop, skyHorizon, seaFar, seaNear, crest, cloud, cloudShade, dark (0 day .. 1 night), warm
  [0, '0a1230', '1d2a52', '1a2a4c', '0c1630', '5a6c90', '2a3658', '1c2644', 1, 0],
  [5, '0e1638', '2a3462', '22305a', '0e1a38', '6a7aa0', '3a4470', '262f58', 0.9, 0],
  [6.3, '3a4a8a', 'f0a070', '5a6a9a', '1e2e5a', 'f4c8a0', 'f6c0a0', 'b07a80', 0.35, 0.8],
  [7.5, '5d96d0', 'f2d8b0', '4a80b0', '1f4c7c', 'f2ece0', 'fbf3e6', 'd2c2c0', 0.05, 0.3],
  [10, '4f97d8', 'cde6f2', '3d7cb0', '1d4d80', 'e6f2f8', 'fbfbf6', 'c6d4e0', 0, 0],
  [16, '4f94d4', 'd6e8f0', '3b78ac', '1c4a7c', 'e6f2f8', 'fbfaf2', 'c8d2dc', 0, 0],
  [18.3, '4a5aa0', 'ffb070', '5a6a98', '20345e', 'ffd0a0', 'ffd2a8', 'c07a78', 0.25, 1],
  [19.5, '262a62', 'c0605a', '3a3a6a', '141c40', 'e0907a', 'b06a7a', '5a3a5e', 0.6, 0.6],
  [21, '0c1434', '22305a', '1c2a50', '0c1632', '5a6c90', '2c3860', '1e2848', 1, 0],
  [24, '0a1230', '1d2a52', '1a2a4c', '0c1630', '5a6c90', '2a3658', '1c2644', 1, 0],
].map(([h, ...r]) => [h, ...r.slice(0, 7).map(hex), r[7], r[8]]);

export function lightAt(hour) {
  let k = 1;
  while (DAY[k][0] < hour) k++;
  const a = DAY[k - 1], b = DAY[k], u = (hour - a[0]) / (b[0] - a[0]);
  const c = (i) => mix(a[i], b[i], u);
  const L = {
    skyTop: c(1), skyHor: c(2), seaFar: c(3), seaNear: c(4), crest: c(5), cloud: c(6), cloudShade: c(7),
    dark: lerp(a[8], b[8], u), warm: lerp(a[9], b[9], u), hour,
  };
  const night = hex('1a2448'), warmC = hex('ff9a5a');
  L.tint = (col) => {
    let r = col;
    if (L.warm > 0) r = mix(r, warmC, 0.16 * L.warm);
    if (L.dark > 0) r = mix(r, night, 0.55 * L.dark);
    return r;
  };
  // flags are lit by the deck floods at night: tinted less
  L.flagTint = (col) => {
    let r = col;
    if (L.warm > 0) r = mix(r, warmC, 0.1 * L.warm);
    if (L.dark > 0) r = mix(r, night, 0.2 * L.dark);
    return r;
  };
  return L;
}

// ------------------------------------------------------------ palette (by day, before tint)
const C = {
  hull: hex('23252c'), band: hex('d6aa48'), boot: hex('8c3028'), rail: hex('7a5434'),
  mast: hex('a8763e'), mastDark: hex('6e4a28'), rig: hex('2e2a28'), sail: hex('e8dcc0'), sailTie: hex('b0a080'),
  jumper: hex('233660'), collar: hex('f0f0ea'), skin: hex('e2ae8a'), cap: hex('f4f4ee'),
  brass: hex('dcae44'), smoke: hex('eeeae0'), island: hex('5a7a92'), gull: hex('f6f6f2'), gullWing: hex('8a96a2'),
};

// ------------------------------------------------------------ camera

export function makeCam(z, cx, cy, ox, oy) {
  return {
    z, cx, cy, ox, oy,
    X: (x) => (x - cx) * z + 80 + ox,
    Y: (y) => (y - cy) * z + 40 + oy,
  };
}

/** The ship's motion at time t: pitch (radians) and heave around a pivot. */
export function shipPose(t) {
  const a = t * (6.2832 / 6.4);
  return { th: 0.02 * sin(a) + 0.006 * sin(a * 2.3 + 1), heave: 0.9 * sin(a + 1.3), px: 75, py: 56 };
}

function shipPt(pose, x, y) {
  const s = pose.th, c = 1 - (pose.th * pose.th) / 2;
  const dx = x - pose.px, dy = y - pose.py;
  return [pose.px + dx * c - dy * s, pose.py + dx * s + dy * c + pose.heave];
}

/** Sheer (top of the bulwark) at hull x, before pose. */
export function sheer(x) {
  const u = (x - 75) / 78;
  return 47.2 - (u < 0 ? 6 * u * u : 2.6 * u * u);
}

// ------------------------------------------------------------ sky and sea

export function drawSky(g, cam, L, t) {
  const hy = cam.Y(HOR);
  const top = Math.max(0, Math.min(80, Math.floor(hy)));
  if (top > 0) g.gradient(0, 0, 160, top, [L.skyTop, L.skyHor]);
  // stars at night (fixed to the sky, a little parallax)
  if (L.dark > 0.3) {
    const a = clamp((L.dark - 0.3) / 0.5, 0, 1);
    for (let i = 0; i < 26; i++) {
      const sx = Math.floor((rand(i, 7) * 220 - 30 + cam.ox * 0.3) % 160);
      const sy = Math.floor(rand(i, 8) * (hy - 6) + cam.oy * 0.3);
      if (sy < 0 || sy >= hy - 3 || sx < 0) continue;
      const tw = 0.55 + 0.45 * sin(t * (1.3 + rand(i, 9) * 2) + i);
      g.pixel(sx, sy, 0xe8ecff, { a: a * tw });
    }
    // moon
    const mx = cam.X(150) * 0.4 + 96, my = cam.Y(-18) * 0.4 + 6;
    g.fillCircle(mx, my, 4.2, mix(0xf4ecd0, L.skyTop, 0.1), { aa: true, a });
    g.fillCircle(mx + 2.2, my - 1.2, 3.6, L.skyTop, { aa: true, a: a * 0.92 });
  }
  // low sun at dawn and sunset
  if (L.warm > 0.4) {
    const a = clamp((L.warm - 0.4) / 0.4, 0, 1);
    const sx = L.hour < 12 ? cam.X(-60) * 0.5 + 30 : cam.X(160) * 0.5 + 60;
    g.fillCircle(sx, hy - 2.5, 5, 0xfff0c0, { aa: true, a: a * 0.9 });
  }
  // clouds: flat two-tone cumulus drifting downwind (right)
  for (let i = 0; i < 4; i++) {
    const span = 420;
    const wx = ((rand(i, 1) * span + t * (1.2 + i * 0.35)) % span) - 110;
    const wy = 41 + rand(i, 2) * 4;
    const k = 0.45 + rand(i, 3) * 0.35;
    // clouds are far: half parallax
    const zz = cam.z * 0.6 + 0.4 * cam.z * cam.z;
    const cx = (wx - cam.cx) * zz + 80 + cam.ox * 0.5, cy = (wy - cam.cy * 0.55) * zz + 40 + cam.oy * 0.5 + (HOR - cam.cy) * (cam.z - zz);
    if (cy > hy - 2) continue;
    cloud(g, cx, cy, k * zz, L);
  }
}

function cloud(g, x, y, k, L) {
  if (x < -40 * k || x > 160 + 40 * k) return;
  const sh = L.cloudShade, lit = L.cloud;
  g.fillRoundRect(x - 16 * k, y + 1 * k, 34 * k, 6 * k, 3 * k, sh, { aa: true });
  g.fillCircle(x - 6 * k, y + 1 * k, 6 * k, lit, { aa: true });
  g.fillCircle(x + 4 * k, y - 2 * k, 8 * k, lit, { aa: true });
  g.fillCircle(x + 13 * k, y + 2.5 * k, 4.5 * k, lit, { aa: true });
  g.fillRect(x - 15 * k, y + 5.2 * k, 32 * k, 1.6 * k, sh);
}

/** The sea from the horizon down, with crest dashes moving downwind; `near` draws only the band in front of the hull. */
export function drawSea(g, cam, L, t, near) {
  const hy = cam.Y(HOR);
  if (!near) {
    const top = Math.max(0, Math.floor(hy));
    if (top < 80) g.gradient(0, top, 160, 80 - top, [[0, L.seaFar], [1, L.seaNear]], { angle: 90 });
    // distant headland, behind the stern
    const ix = cam.X(128), iy = cam.Y(HOR);
    g.fillPolygon([[ix, iy + 0.5], [ix + 6 * cam.z, iy - 2.4 * cam.z], [ix + 22 * cam.z, iy - 3.6 * cam.z], [ix + 40 * cam.z, iy - 1.6 * cam.z], [ix + 58 * cam.z, iy + 0.5]],
      L.tint(mix(C.island, L.skyHor, 0.45)), { aa: true });
    g.fillRect(0, Math.floor(hy), 160, 1, mix(L.seaFar, L.skyHor, 0.35));
  }
  const rows = near ? [63.5, 67, 71.5, 77, 84] : [51.2, 52.6, 54.4, 56.6, 59.2];
  rows.forEach((wy, r) => {
    const depth = (wy - HOR) / 30; // 0 far .. 1 near
    const sy = cam.Y(wy);
    if (sy < 0 || sy >= 80) return;
    const spacing = 10 + depth * 34, len = 1.5 + depth * 7, speed = 1.5 + depth * 6;
    const thick = Math.max(1, Math.round(cam.z * (depth > 0.75 ? 2 : 1)));
    for (let k = -1; k < 200 / spacing + 1; k++) {
      const id = k + 1000;
      const wx = k * spacing + rand(id, r) * spacing * 0.7 + ((t * speed) % spacing);
      const breathe = sin(t * (0.9 + rand(id, r + 9) * 0.8) + id * 1.7);
      if (breathe < -0.2) continue;
      const l = len * (0.4 + 0.6 * breathe);
      const x0 = cam.X(wx - 20), x1 = cam.X(wx - 20 + l);
      const yy = Math.floor(sy + 0.6 * sin(t * 1.3 + wx * 0.07) * cam.z);
      if (x1 < 0 || x0 >= 160) continue;
      g.fillRect(Math.floor(x0), yy, Math.max(1, Math.round(x1 - x0)), thick, L.crest, { a: 0.55 + 0.45 * depth });
    }
  });
}

/** The band of sea in front of the hull: covers the hull below the waterline, laps it, reflects it. */
export function drawNearSea(g, cam, L, t, pose) {
  const top = cam.Y(WL - 0.6);
  const y0 = Math.floor(top);
  if (y0 >= 80) return;
  // water surface in front, a gently wavy edge: per 4-px column strip
  const near = mix(L.seaFar, L.seaNear, 0.55);
  for (let x = 0; x < 160; x += 4) {
    const w = (cam.cx + (x - 80 - cam.ox) / cam.z);
    const yy = top + (0.9 * sin(t * 2.1 - w * 0.11) + 0.5 * sin(t * 3.3 + w * 0.23)) * cam.z;
    g.fillRect(x, Math.floor(yy), 4, 80 - Math.floor(yy), near);
  }
  g.gradient(0, y0 + 2, 160, 80 - y0 - 2, [[0, near], [1, L.seaNear]], { angle: 90 });
  // the hull's reflection: dark wobbling bars under it
  const [bx] = shipPt(pose, 12, WL), [sx] = shipPt(pose, 138, WL);
  const refl = L.tint(mix(C.hull, near, 0.55));
  for (let j = 0; j < 7; j++) {
    const wy = WL + 1 + j * 1.6;
    const yy = Math.floor(cam.Y(wy + pose.heave));
    if (yy >= 80) break;
    const wob = 2.2 * sin(t * 2.6 + j * 1.9) * cam.z;
    const shrink = j * 2.6;
    const x0 = cam.X(bx + shrink) + wob, x1 = cam.X(sx - shrink) + wob;
    if (j % 2 === 1 && cam.z > 0.6) continue;
    g.fillRect(Math.floor(x0), yy, Math.round(x1 - x0), Math.max(1, Math.round(cam.z)), refl, { a: 0.7 - j * 0.08 });
  }
  drawSea(g, cam, L, t, true);
}

// ------------------------------------------------------------ the schooner

function poly(g, cam, pose, pts, col, o = { aa: true }) {
  g.fillPolygon(pts.map(([x, y]) => { const [a, b] = shipPt(pose, x, y); return [cam.X(a), cam.Y(b)]; }), col, o);
}

function seg(g, cam, pose, x0, y0, x1, y1, w, col, o = {}) {
  const [a, b] = shipPt(pose, x0, y0), [c, d] = shipPt(pose, x1, y1);
  const ww = w * cam.z;
  if (ww < 1) g.thickLine(cam.X(a), cam.Y(b), cam.X(c), cam.Y(d), 1, col, { aa: true, a: (o.a ?? 1) * Math.max(0.35, ww) });
  else g.thickLine(cam.X(a), cam.Y(b), cam.X(c), cam.Y(d), ww, col, { aa: true, a: o.a ?? 1 });
}

/** Screen position of a ship point. */
export function shipScreen(cam, pose, x, y) {
  const [a, b] = shipPt(pose, x, y);
  return [cam.X(a), cam.Y(b)];
}

/** Masts, rigging and furled sails: everything behind the flags. */
export function drawRig(g, cam, pose, L) {
  const T = L.tint;
  const rig = T(C.rig);
  // stays and shrouds first (thin)
  seg(g, cam, pose, FORE + 1, -34, -32, 36, 0.8, rig, { a: 0.8 });          // forestay to the bowsprit
  seg(g, cam, pose, FORE + 1, -30, MAIN + 1, -38, 0.8, rig, { a: 0.7 });    // spring stay
  seg(g, cam, pose, MAIN + 1, -42, 150, 44, 0.8, rig, { a: 0.7 });          // backstay
  for (const [m, top] of [[FORE, -14], [MAIN, -22]]) {
    seg(g, cam, pose, m + 0.5, top, m - 7, sheer(m - 7) + 1, 0.8, rig, { a: 0.75 });
    seg(g, cam, pose, m + 0.5, top, m + 8, sheer(m + 8) + 1, 0.8, rig, { a: 0.75 });
  }
  // masts, slightly raked aft, tapering
  for (const [m, top] of [[FORE, -38], [MAIN, -46]]) {
    poly(g, cam, pose, [[m - 1.6, 48], [m + 1.6, 48], [m + 2.2 + 0.9, top], [m + 2.2 - 0.9, top]], T(C.mast));
    poly(g, cam, pose, [[m + 0.6, 48], [m + 1.6, 48], [m + 3.1, top], [m + 2.6, top]], T(C.mastDark));
    // crosstrees and the cap
    seg(g, cam, pose, m - 3, top + 22, m + 7, top + 22, 1.2, T(C.mastDark));
    poly(g, cam, pose, [[m + 0.4, top - 0.4], [m + 4, top - 0.4], [m + 4, top + 1.6], [m + 0.4, top + 1.6]], T(C.mastDark));
  }
  // booms with the sails furled on them, lashed
  for (const [m, x1] of [[FORE, 92], [MAIN, 168]]) {
    seg(g, cam, pose, m + 1, 37.5, x1, 39, 1.6, T(C.mastDark));
    poly(g, cam, pose, [[m + 2, 37], [m + 6, 32.8], [x1 - 14, 34], [x1 - 2, 37.4], [x1 - 2, 38.2], [m + 2, 38.2]], T(C.sail));
    if (cam.z > 0.5) for (let x = m + 10; x < x1 - 6; x += 9) seg(g, cam, pose, x, 33.8 + (x - m) * 0.02, x + 0.6, 38, 0.8, T(C.sailTie));
  }
  // bowsprit
  seg(g, cam, pose, 2, 42, -32, 36, 2.0, T(C.mastDark));
}

/** Hull, bulwark, band, gunports, bell, gun: everything in front of the flags and crew. */
export function drawHull(g, cam, pose, L) {
  const T = L.tint;
  const top = [];
  for (let x = -3; x <= 153; x += 6) top.push([x, sheer(x)]);
  poly(g, cam, pose, [...top, [153, 45.6], [151, 49], [145, 55.5], [137, 63], [14, 63], [6, 57], [-1, 47]], T(C.hull));
  // ochre band with black ports (a chequered side)
  const band = [];
  for (let x = 2; x <= 148; x += 6) band.push([x, sheer(x) + 2.0]);
  const bandLo = [];
  for (let x = 148; x >= 2; x -= 6) bandLo.push([x, sheer(x) + 4.2]);
  poly(g, cam, pose, [...band, ...bandLo], T(C.band));
  if (cam.z > 0.45) for (let x = 14; x < 142; x += 13) {
    const s = sheer(x);
    poly(g, cam, pose, [[x, s + 2.0], [x + 3.6, s + 2.0], [x + 3.6, s + 4.2], [x, s + 4.2]], T(C.hull), { aa: false });
  }
  // cap rail
  const rail = [];
  for (let x = -3; x <= 153; x += 6) rail.push(shipScreen(cam, pose, x, sheer(x) + 0.3));
  g.stroke(rail, Math.max(0.8, 1.1 * cam.z), T(C.rail), { aa: true });
  // boot-top at the waterline
  poly(g, cam, pose, [[10, 59.4], [139, 59.4], [137.5, 61.2], [12, 61.2]], T(C.boot));
  // anchor cable from the hawse
  seg(g, cam, pose, 4, 47.5, -10, 62, 0.9, T(0x4a4440));
  // stern windows lit at night
  if (L.dark > 0.3) {
    for (const x of [140, 145]) poly(g, cam, pose, [[x, 47], [x + 2.6, 47], [x + 2.6, 48.8], [x, 48.8]], mix(T(C.hull), 0xffd27a, L.dark), { aa: false });
  }
}

/** Anchor light: the all-round white light a vessel at anchor shows forward, on the forestay. */
export function drawAnchorLight(g, cam, pose, L) {
  if (L.dark < 0.2) return;
  const [x, y] = shipScreen(cam, pose, 4, 14);
  const a = clamp((L.dark - 0.2) / 0.5, 0, 1);
  g.radial(x, y, 9 * Math.max(0.5, cam.z), [[0, 0xfff2c0], [1, L.skyTop]], { box: [x - 9, y - 9, 18, 18], a: 0.35 * a });
  g.fillCircle(x, y, Math.max(0.7, 1.4 * cam.z), 0xfffae8, { aa: true, a });
}

// ------------------------------------------------------------ the bell and the gun

/** Ship's bell hung forward of the foremast; `swing` -1..1, `ring` 0..1 the visible ring. */
export function drawBell(g, cam, pose, L, swing, ring) {
  const T = L.tint;
  const bx = 21, by = 38.5;
  seg(g, cam, pose, bx - 3, by - 1.4, bx + 3, by - 1.4, 1, T(C.mastDark));
  seg(g, cam, pose, bx - 2.6, by - 1.4, bx - 2.6, sheer(bx) + 0.4, 0.9, T(C.mastDark));
  seg(g, cam, pose, bx + 2.6, by - 1.4, bx + 2.6, sheer(bx) + 0.4, 0.9, T(C.mastDark));
  const s = swing * 0.5;
  poly(g, cam, pose, [[bx - 0.9 + s * 0.3, by - 1], [bx + 0.9 + s * 0.3, by - 1], [bx + 1.8 + s, by + 2.6], [bx - 1.8 + s, by + 2.6]], T(C.brass));
  if (ring > 0 && cam.z > 0.5) {
    const [x, y] = shipScreen(cam, pose, bx, by + 0.8);
    const r = (3 + 6 * (1 - ring)) * cam.z;
    g.arc(x, y, r - 0.6, r + 0.4, -2.4, -0.8, T(0xfff4d0), { aa: true, a: ring * 0.9 });
    g.arc(x, y, r - 0.6, r + 0.4, 0.8, 2.4, T(0xfff4d0), { aa: true, a: ring * 0.9 });
  }
}

/** The bow gun's salute at the hour: a flash and smoke that rolls downwind. `age` seconds since the shot. */
export function drawSalute(g, cam, pose, L, age) {
  if (age < 0 || age > 9) return;
  const [mx, my] = shipScreen(cam, pose, 3, 45);
  if (age < 0.14) g.fillCircle(mx - 3 * cam.z, my, 4 * cam.z, 0xfff6c0, { aa: true, a: 1 - age / 0.14 });
  for (let i = 0; i < 7; i++) {
    const born = i * 0.05;
    const a0 = age - born;
    if (a0 < 0) continue;
    const out = 1 - Math.exp(-a0 * 2.5);
    const x = mx + (-10 * out + a0 * (6 + i * 1.2) - i * 1.5) * cam.z;
    const y = my + (-2 - i * 0.8 - a0 * 1.1 + 2 * rand(i, 3)) * cam.z;
    const r = (2 + i * 0.5 + a0 * 1.6) * cam.z;
    const a = clamp(1 - a0 / 9, 0, 1) * 0.85;
    g.fillCircle(x, y, r, L.tint(i % 2 ? C.smoke : mix(C.smoke, 0xb0aaa0, 0.3)), { aa: true, a });
  }
}

// ------------------------------------------------------------ the crew

/**
 * A sailor behind the bulwark, standing aft of a mast and facing it.
 * `hands` = [[hx, hy], [hx, hy]] in ship coordinates; `dip` lowers him (crouching).
 */
export function drawSailor(g, cam, pose, L, x, dip, hands, look) {
  const T = L.tint;
  const deck = sheer(x) + 4 + dip;
  const sh = [x - 0.6, deck - 9.2];
  for (const [hx, hy] of hands) seg(g, cam, pose, sh[0], sh[1], hx, hy, 1.4, T(C.jumper));
  for (const [hx, hy] of hands) {
    const [a, b] = shipScreen(cam, pose, hx, hy);
    g.fillCircle(a, b, Math.max(0.5, 0.8 * cam.z), T(C.skin), { aa: true });
  }
  poly(g, cam, pose, [[x - 2.1, deck - 9.6], [x + 2.1, deck - 9.6], [x + 2.5, deck], [x - 2.5, deck]], T(C.jumper));
  poly(g, cam, pose, [[x + 0.4, deck - 9.6], [x + 2.4, deck - 9.6], [x + 2.4, deck - 7.6], [x + 0.6, deck - 8.2]], T(C.collar), { aa: false });
  const [hx, hy] = shipScreen(cam, pose, x - 0.2 + look * 0.3, deck - 11.4);
  g.fillCircle(hx, hy, 1.7 * cam.z, T(C.skin), { aa: true });
  const [cx, cy] = shipScreen(cam, pose, x - 0.2 + look * 0.3, deck - 12.9);
  g.fillRoundRect(cx - 2.0 * cam.z, cy - 0.6 * cam.z, 4.0 * cam.z, 1.5 * cam.z, 0.6 * cam.z, T(C.cap), { aa: true });
}

// ------------------------------------------------------------ the hoist

/**
 * One signal hoist on a mast: halyard and its pennants. `drop` world units
 * the hoist is lowered by; `syms` top to bottom.
 */
export function drawHoist(g, cam, pose, L, mastX, mastTop, syms, drop, t, wind, seed) {
  const T = L.tint;
  const hx = mastX + 3.2;
  const line = T(0x3a3430);
  const deckY = sheer(mastX) + 0.5;
  // hauling part, close to the mast, sheave to deck
  seg(g, cam, pose, mastX + 2.2, mastTop + 3, mastX + 1.8, deckY, 0.7, line, { a: 0.9 });
  // flag part: sheave to the top pennant, through the hoist edges, on to the deck
  const yTop = PEN_TOP[0] + drop;
  const yBot = PEN_TOP[1] + H0 + drop;
  seg(g, cam, pose, mastX + 2.6, mastTop + 3, hx, Math.min(yTop, deckY), 0.7, line, { a: 0.9 });
  if (yBot < deckY) seg(g, cam, pose, hx, yBot, mastX + 2.4, deckY, 0.7, line, { a: 0.9 });
  // pennants, clipped above the deck (lowered ones go into the sailor's arms)
  const [, clipY] = shipScreen(cam, pose, hx, deckY);
  g.clip(0, 0, 160, Math.max(0, clipY));
  syms.forEach((s, i) => {
    const wy = PEN_TOP[i] + drop;
    if (wy > deckY) return;
    const [x, y] = shipScreen(cam, pose, hx, wy);
    drawPennant(g, s, x, y, cam.z, t, wind, seed + i * 0.37, L.flagTint);
    // the toggle and line along the hoist edge
    g.fillRect(Math.floor(x) - 0, Math.floor(y), 1, Math.max(1, Math.round(H0 * cam.z)), line, { a: 0.85 });
  });
  g.unclip();
}

// ------------------------------------------------------------ gulls

/** A gull at screen (x, y), wing phase `ph`, size k (1 = binocular view). */
export function drawGull(g, x, y, ph, k, L) {
  const w = sin(ph);
  const tip = -2.6 * w * k;
  const c = L.tint(C.gull);
  g.thickLine(x - 4 * k, y + tip, x - 1.2 * k, y - 0.4 * k + tip * 0.35, Math.max(0.8, 1.1 * k), c, { aa: true });
  g.thickLine(x + 4 * k, y + tip, x + 1.2 * k, y - 0.4 * k + tip * 0.35, Math.max(0.8, 1.1 * k), c, { aa: true });
  g.fillEllipse(x, y, 1.6 * k, 0.9 * k, c, { aa: true });
}
