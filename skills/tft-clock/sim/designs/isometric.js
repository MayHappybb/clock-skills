// Isometric: an impossible place, Monument Valley style. The time is a
// voxel monument on a floating island, two walls meeting at a far corner
// like the back of a Habbo room: the hours on the left wall, the minutes
// on the right, the colon two stones turning at the corner.
//
// The trick is orthographic. In 2:1 isometric a block moved by (1,1,1)
// lands on exactly the same pixels, so every piece of every numeral floats
// at its own depth: bars, pillars and corner stones are scattered across
// the sky and only line up into numerals from this one camera. Between
// minute turns the camera holds still and the place lives: a traveller in
// a white hood walks the terrace (left to right in even minutes, back in
// odd ones, so where they are is the seconds), the colon stones make a
// quarter turn every second, water pours off the island into a sea of
// cloud, clouds drift, the sky follows the day.
//
// Minute: from :58.6 the camera swings ~35 degrees round the island and
// the illusion breaks: the numerals come apart into a constellation of
// floating stones. The pieces the next minute does not need drop out of
// the sky (gone by :59.9); after :00 the new pieces rise out of the cloud
// sea to their own depths, and the camera swings back until they snap
// into line, the new time, by :01.8; a glint runs along the tops as it
// clicks. (Two birds cross now and then; after dark the traveller carries
// a lantern.)
// Hour: the camera makes a whole turn round the island instead (:57.8 to
// :03.0), the numerals scattered all the way round.
//
// Rendering: every stone is a unit cube drawn as three flat faces (hard
// polygons; at rest every vertex is on an integer pixel, so the faces are
// clean 2:1 isometric pixel art). Faces are lit by one light fixed in the
// world, so as the camera turns the faces change tone. Painter's order by
// depth along the view ray; at rest by the apparent (aligned) depth, so the
// joints look properly built, in motion by the true depth.
//
// Palette: Monument Valley's pastels per time of day, interpolated
// (night ink-blue with lilac stone, dawn rose, day teal sky with coral
// stone, dusk violet); the island is a grassy cap on earth so the numerals
// are the only coral thing.

import { clockFields, mix, hex, sin, cos, clamp, ease, progress, rand, hash, sprite, TAU } from '../js/kit.js';

const W = 160, H = 80;
const CX = 80, CY = 44;       // screen position of world (PIV, PIV, 0)
const U = 4;                  // one world unit = 4 px across (2:1 iso)
const PIV = 4;                // the camera turns round the vertical through (PIV, PIV)

// ------------------------------------------------------------ the numerals

// A 5 x 7 voxel glyph cut into fixed regions so pieces common to two digits
// stay put at the turn. c = column 0..4 (left to right), r = row 0..6 (bottom up).
const REGIONS = [
  ['T', [[1, 6], [2, 6], [3, 6]]],
  ['M', [[1, 3], [2, 3], [3, 3]]],
  ['B', [[1, 0], [2, 0], [3, 0]]],
  ['UL', [[0, 4], [0, 5]]],
  ['UR', [[4, 4], [4, 5]]],
  ['LL', [[0, 1], [0, 2]]],
  ['LR', [[4, 1], [4, 2]]],
  ['TL', [[0, 6]]], ['TR', [[4, 6]]],
  ['ML', [[0, 3]]], ['MR', [[4, 3]]],
  ['BL', [[0, 0]]], ['BR', [[4, 0]]],
];
const SEG = {
  0: 'T UR LR B LL UL', 1: 'UR LR', 2: 'T UR M LL B', 3: 'T UR M LR B', 4: 'UL M UR LR',
  5: 'T UL M LR B', 6: 'T UL M LL LR B', 7: 'T UR LR', 8: 'T UR LR B LL UL M', 9: 'T UR LR B UL M',
};
const JOINT = { TL: ['T', 'UL'], TR: ['T', 'UR'], ML: ['M', 'UL', 'LL'], MR: ['M', 'UR', 'LR'], BL: ['B', 'LL'], BR: ['B', 'LR'] };

/** Region presence for each digit: a Set of region names. */
const PRESENT = {};
for (let d = 0; d <= 9; d++) {
  const s = new Set(SEG[d].split(' '));
  for (const [j, needs] of Object.entries(JOINT)) if (needs.some((n) => s.has(n))) s.add(j);
  PRESENT[d] = s;
}

/** Glyph cell -> world cube (min corner) for slot 0..3. Hours on the x = 0 wall, minutes on y = 0. */
function cellToWorld(slot, c, r) {
  if (slot === 0) return [0, 14 - c, r];
  if (slot === 1) return [0, 7 - c, r];
  if (slot === 2) return [3 + c, 0, r];
  return [10 + c, 0, r];
}

/** Per slot, per region: cubes with internal-face masks and the region's depth offset. */
const PIECES = [0, 1, 2, 3].map((slot) => REGIONS.map(([name, cells], ri) => {
  const cubes = cells.map(([c, r]) => cellToWorld(slot, c, r));
  const key = (p) => p.join(',');
  const set = new Set(cubes.map(key));
  const has = (x, y, z) => set.has(`${x},${y},${z}`);
  const list = cubes.map(([x, y, z]) => ({
    x, y, z,
    // faces shared with a cube of the same piece are never seen
    in: { px: has(x + 1, y, z), nx: has(x - 1, y, z), py: has(x, y + 1, z), ny: has(x, y - 1, z), pz: has(x, y, z + 1) },
  }));
  // the depth this piece really floats at, along the view ray (1,1,1)
  const t = (hash(slot * 31 + ri, 7, 1) % 11) - 5;
  const tt = t === 0 ? (ri % 2 ? 3 : -3) : t;
  return { name, cubes: list, t: tt, seed: slot * 17 + ri };
}));

// ------------------------------------------------------------ the island

/** Terrace tiles (z = -1) and the stepped rock under them. */
const ISLAND = [];
{
  const add = (x, y, z, kind) => ISLAND.push({ x, y, z, kind });
  for (let x = 0; x < 15; x++) for (let y = 0; y < 3; y++) add(x, y, -1, 'grass');
  for (let x = 0; x < 3; x++) for (let y = 3; y < 15; y++) add(x, y, -1, 'grass');
  // rock under it, stepping in from the two far ends: a floating island
  for (let k = 1; k <= 3; k++) {
    const n = 15 - 3 * k;
    for (let x = 0; x < n; x++) for (let y = 0; y < 3; y++) add(x, y, -1 - k, 'rock');
    for (let x = 0; x < 3; x++) for (let y = 3; y < n; y++) add(x, y, -1 - k, 'rock');
  }
}
{
  const set = new Set(ISLAND.map((c) => `${c.x},${c.y},${c.z}`));
  const has = (x, y, z) => set.has(`${x},${y},${z}`);
  for (const c of ISLAND) {
    const { x, y, z } = c;
    c.in = { px: has(x + 1, y, z), nx: has(x - 1, y, z), py: has(x, y + 1, z), ny: has(x, y - 1, z), pz: has(x, y, z + 1) };
  }
}

// ------------------------------------------------------------ palettes by hour

const P = (sky0, sky1, top, mid, dark, grass, earth, earthDk, cloud, water) => ({
  sky0: hex(sky0), sky1: hex(sky1), top: hex(top), mid: hex(mid), dark: hex(dark),
  grass: hex(grass), earth: hex(earth), earthDk: hex(earthDk), cloud: hex(cloud), water: hex(water),
});
const KEYS = [
  [0, P('#0f1438', '#2c2862', '#e2dcff', '#a596ec', '#6c5cc4', '#5f7fa8', '#4d4a86', '#2f2c60', '#5a5694', '#8fb6e8')],
  [5, P('#161b48', '#4a3674', '#e4daff', '#a898ea', '#6e5ec2', '#6584aa', '#55508c', '#332e64', '#6e639e', '#98bce8')],
  [6.5, P('#e79aa8', '#fde0b6', '#fff3df', '#f08c78', '#a9486a', '#a8cf8a', '#c9946e', '#8c5e52', '#fff0e4', '#9fe0e4')],
  [12, P('#62bfcb', '#e8f4dc', '#fff1d8', '#ee8466', '#b0475c', '#a3d48c', '#cf9a70', '#8d6250', '#ffffff', '#a6eef0')],
  [17, P('#7fb2d6', '#f8dcb0', '#fff0d6', '#ec7e66', '#a8445e', '#a9cf86', '#cb946c', '#8a5c4e', '#fff6ea', '#a6e6ee')],
  [19, P('#3e3c88', '#f39a78', '#ffe2c6', '#da687c', '#6c3876', '#86a888', '#a77a74', '#6a4a5c', '#f6c6b6', '#9ed0ea')],
  [21, P('#121640', '#3a2c6c', '#e2dcff', '#a596ec', '#6c5cc4', '#6282aa', '#504c88', '#302c62', '#5e5896', '#8fb6e8')],
  [24, P('#0f1438', '#2c2862', '#e2dcff', '#a596ec', '#6c5cc4', '#5f7fa8', '#4d4a86', '#2f2c60', '#5a5694', '#8fb6e8')],
];
function paletteAt(hf) {
  let i = 0;
  while (i < KEYS.length - 2 && hf >= KEYS[i + 1][0]) i++;
  const [h0, a] = KEYS[i], [h1, b] = KEYS[i + 1];
  const u = ease.inOutQuad(clamp((hf - h0) / (h1 - h0), 0, 1));
  const out = {};
  for (const k of Object.keys(a)) out[k] = mix(a[k], b[k], u);
  return out;
}

// ------------------------------------------------------------ projection

/** Per-frame camera: yaw d (radians, 0 = the aligned view). */
function camera(d) {
  const c = cos(d), s = sin(d);
  return {
    c, s,
    // screen steps of one world unit along x, y, z
    ex: [U * (c - s), (U / 2) * (c + s)],
    ey: [-U * (s + c), (U / 2) * (c - s)],
    proj(x, y, z) {
      const X = x - PIV, Y = y - PIV;
      const xr = X * c - Y * s, yr = X * s + Y * c;
      return [CX + U * (xr - yr), CY + (U / 2) * (xr + yr) - U * z];
    },
    depth(x, y, z) {
      const X = x - PIV, Y = y - PIV;
      return (X * c - Y * s) + (X * s + Y * c) + z;
    },
  };
}

/** Light fixed in the world, from the left: brightness of a side face by its world normal angle. */
const L_ANG = (2 * Math.PI) / 3;
function sideTone(pal, ang, lo, hi) {
  const b = 0.5 + 0.5 * cos(ang - L_ANG);           // +y face 0.93, +x face 0.25
  return mix(lo, hi, clamp((b - 0.25) / 0.68, 0, 1));
}

/**
 * Draw a box: centre (wx, wy, wz) in the world, unit footprint scaled by
 * `sz`, local spin `psi`. `inn` hides faces shared with neighbours. Colours
 * from `tones` = { top, lo, hi } (side faces run from lo to hi with light).
 */
function drawCube(g, cam, wx, wy, wz, sz, psi, inn, tones, pal) {
  const p = cam.proj(wx, wy, wz);
  const ca = cos(psi), sa = sin(psi);
  // local axes, rotated by psi in the world then projected by the camera
  const ax = [(cam.ex[0] * ca + cam.ey[0] * sa) * sz, (cam.ex[1] * ca + cam.ey[1] * sa) * sz];
  const ay = [(-cam.ex[0] * sa + cam.ey[0] * ca) * sz, (-cam.ex[1] * sa + cam.ey[1] * ca) * sz];
  const az = [0, -U * sz];
  const pt = (i, j, k) => [p[0] + ax[0] * (i - 0.5) + ay[0] * (j - 0.5) + az[0] * (k - 0.5),
    p[1] + ax[1] * (i - 0.5) + ay[1] * (j - 0.5) + az[1] * (k - 0.5)];
  // which side faces look at the camera: toward-viewer = rotated x + y
  const th = psi;   // world angle of the local +x normal
  const cxw = cos(th), sxw = sin(th);
  const vis = (nx, ny) => {               // world normal -> camera-rotated -> toward viewer?
    const xr = nx * cam.c - ny * cam.s, yr = nx * cam.s + ny * cam.c;
    return xr + yr > 1e-6;
  };
  const faces = [];
  if (!inn?.px && vis(cxw, sxw)) faces.push([[pt(1, 0, 0), pt(1, 1, 0), pt(1, 1, 1), pt(1, 0, 1)], th]);
  if (!inn?.nx && vis(-cxw, -sxw)) faces.push([[pt(0, 0, 0), pt(0, 1, 0), pt(0, 1, 1), pt(0, 0, 1)], th + Math.PI]);
  if (!inn?.py && vis(-sxw, cxw)) faces.push([[pt(0, 1, 0), pt(1, 1, 0), pt(1, 1, 1), pt(0, 1, 1)], th + Math.PI / 2]);
  if (!inn?.ny && vis(sxw, -cxw)) faces.push([[pt(0, 0, 0), pt(1, 0, 0), pt(1, 0, 1), pt(0, 0, 1)], th - Math.PI / 2]);
  for (const [poly, ang] of faces) g.fillPolygon(poly, sideTone(pal, ang, tones.lo, tones.hi));
  if (!inn?.pz) g.fillPolygon([pt(0, 0, 1), pt(1, 0, 1), pt(1, 1, 1), pt(0, 1, 1)], tones.top);
}

// ------------------------------------------------------------ the minute's choreography

const SWING = 0.62;   // radians the camera swings at a minute turn

/** Camera yaw at this second, for an ordinary minute turn or the hour's whole turn. */
function yawAt(sec, hourOut, hourIn, dirOut, dirIn) {
  if (hourOut && sec >= 57.8) return dirOut * TAU * 0.5 * ease.inOutQuad(progress(sec, 57.8, 60)) ;
  if (hourIn && sec < 3) return dirIn * TAU * (0.5 + 0.5 * ease.outCubic(progress(sec, 0, 3)));
  if (sec >= 58.6) return dirOut * SWING * ease.inOutCubic(progress(sec, 58.6, 59.6));
  if (sec < 1.8) return dirIn * SWING * (1 - ease.inOutCubic(progress(sec, 0.6, 1.8)));
  return 0;
}

/** Height offset of a piece leaving (falls from :59.0, gone by :59.9). */
function fallAt(sec, seed) {
  const t0 = 59.0 + 0.12 * rand(seed, 3);
  if (sec < t0) return 0;
  const u = sec - t0;
  return -48 * u * u;
}
/** Height offset of a piece arriving (rises from below after :00). Null: not yet. */
function riseAt(sec, seed) {
  const t0 = 0.05 + 0.25 * rand(seed, 5);
  const u = progress(sec, t0, t0 + 0.9);
  if (sec < t0) return null;
  return -26 * (1 - ease.outCubic(u));
}

// ------------------------------------------------------------ the traveller

const HOOD = 0xfbf8f0, ROBE = 0xf2eee6;
const WALK = [
  sprite(`
    ..w..
    .www.
    .wfw.
    .www.
    wwwww
    .www.
    .l.l.`, { w: HOOD, f: 0x3a3048, l: 0x3a3048 }),
  sprite(`
    ..w..
    .www.
    .wfw.
    .www.
    wwwww
    .www.
    ..l..`, { w: HOOD, f: 0x3a3048, l: 0x3a3048 }),
];

/** Where the traveller is (world x, y) at this second, and whether walking. */
function travellerAt(sec, minuteKey) {
  // path: down the hours terrace toward the corner, then out along the minutes terrace
  const A = [2.0, 13.5], C = [2.0, 2.0], B = [13.5, 2.0];
  const len1 = A[1] - C[1], len2 = B[0] - C[0], tot = len1 + len2;
  let u = progress(sec, 2.2, 57.4);
  const forward = minuteKey % 2 === 0;
  if (!forward) u = 1 - u;
  const d = u * tot;
  const pos = d <= len1 ? [A[0], A[1] - d] : [C[0] + (d - len1), C[1]];
  const walking = sec > 2.2 && sec < 57.4;
  // facing: on screen, walking toward +x (right-down) or -y (right-up) both go right
  return { x: pos[0], y: pos[1], walking, right: forward };
}

// ------------------------------------------------------------ the face

export default {
  name: 'Isometric',
  blurb: 'An impossible floating monument: its numerals are stones scattered at every depth that only line up from this one camera. Each minute the camera swings round, the time falls apart, new stones rise from the clouds and snap into line.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec, date = ctx.date;
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.6 * night);
    const hf = f.h + f.m / 60 + sec / 3600;
    const pal = paletteAt(hf);
    const tod = f.h * 3600 + f.m * 60 + sec;

    const nxt = clockFields(new Date(date.getTime() + 60000));
    const prv = clockFields(new Date(date.getTime() - 60000));
    const curS = f.hh + f.mm, nxtS = nxt.hh + nxt.mm, prvS = prv.hh + prv.mm;
    const hourOut = nxt.m === 0, hourIn = f.m === 0;
    const dirOut = (f.minuteKey % 2) ? 1 : -1, dirIn = ((f.minuteKey - 1) % 2) ? 1 : -1;
    const yaw = yawAt(sec, hourOut, hourIn, dirOut, dirIn);
    const cam = camera(yaw);
    const moving = Math.abs(yaw) > 0.01 && Math.abs(Math.abs(yaw) - TAU) > 0.01;

    // ---- sky
    g.gradient(0, 0, W, H, [pal.sky0, pal.sky1]);
    drawSky(g, pal, tod, hf, night);

    // ---- gather everything that sits in the world, then paint far to near
    const items = [];
    const stone = { top: pal.top, lo: pal.dark, hi: pal.mid };
    // the click: when the numerals snap back into line a glint runs along them
    const tSnap = hourIn ? 3.0 : (prvS !== curS ? 1.8 : -9);
    const front = sec >= tSnap && sec < tSnap + 0.7 ? -20 + 200 * progress(sec, tSnap, tSnap + 0.7) : -99;
    const glinted = (sx) => {
      const k = front < -50 ? 0 : clamp(1 - Math.abs(sx - front) / 16, 0, 1);
      if (k <= 0) return stone;
      return { top: mix(pal.top, 0xffffff, 0.85 * k), lo: mix(pal.dark, pal.mid, 0.6 * k), hi: mix(pal.mid, pal.top, 0.6 * k) };
    };
    const grass = { top: pal.grass, lo: pal.earthDk, hi: pal.earth };
    const rock = { top: pal.earth, lo: pal.earthDk, hi: pal.earth };

    for (const c of ISLAND) {
      const wx = c.x + 0.5, wy = c.y + 0.5, wz = c.z + 0.5;
      items.push({ k: cam.depth(wx, wy, wz), draw: () => drawCube(g, cam, wx, wy, wz, 1, 0, c.in, c.kind === 'grass' ? grass : rock, pal) });
    }

    for (let slot = 0; slot < 4; slot++) {
      const dc = +curS[slot], dn = +nxtS[slot], dp = +prvS[slot];
      for (const piece of PIECES[slot]) {
        const inCur = PRESENT[dc].has(piece.name);
        let dz = 0;
        if (inCur) {
          if (sec >= 58.9 && !PRESENT[dn].has(piece.name) && dc !== dn) dz = fallAt(sec, piece.seed);
          if (sec < 3 && !PRESENT[dp].has(piece.name) && dc !== dp) {
            const r = riseAt(sec, piece.seed);
            if (r === null) continue;
            dz = r;
          }
        } else continue;
        if (dz < -40) continue;
        const t = piece.t;
        for (const cube of piece.cubes) {
          const ax = cube.x + 0.5, ay = cube.y + 0.5, az = cube.z + 0.5;
          const wx = ax + t, wy = ay + t, wz = az + t + dz;
          const kApp = cam.depth(ax, ay, az), kTrue = cam.depth(wx, wy, wz);
          const k = moving ? kTrue : kApp + dz * 0.001;
          items.push({ k, draw: () => drawCube(g, cam, wx, wy, wz, 1, 0, cube.in, glinted(CX + U * (ax - ay)), pal) });
        }
      }
    }

    // ---- the colon: two stones at the corner, a quarter turn every second, opposite ways
    const tick = Math.floor(sec) + ease.inOutCubic(progress(sec % 1, 0, 0.45));
    for (let i = 0; i < 2; i++) {
      const wz = i === 0 ? 4.5 : 1.5;
      const psi = (i === 0 ? 1 : -1) * tick * (Math.PI / 2);
      items.push({ k: cam.depth(1.5, 1.5, wz), draw: () => drawCube(g, cam, 1.5, 1.5, wz, 1, psi, null, stone, pal) });
    }

    // ---- the traveller
    const tr = travellerAt(sec, f.minuteKey);
    items.push({
      k: cam.depth(tr.x, tr.y, 0) + 2, draw: () => {
        const [sx, sy] = cam.proj(tr.x, tr.y, 0);
        const fr = tr.walking ? Math.floor(tod * 3) % 2 : 0;
        g.blit(WALK[fr], Math.round(sx - 2), Math.round(sy - 7), { flipX: !tr.right });
        // after dark the traveller carries a lantern
        const lamp = clamp((Math.abs(hf - 12) - 7) / 1, 0, 1);
        if (lamp > 0) {
          const lx = Math.round(sx + (tr.right ? 3 : -3)), ly = Math.round(sy - 3) + (fr && tr.walking ? 1 : 0);
          g.fillCircle(lx + 0.5, ly + 0.5, 2.5, 0xffd27a, { a: 0.35 * lamp, aa: true });
          g.pixel(lx, ly, mix(pal.mid, 0xffe9a0, lamp));
        }
      },
    });

    items.sort((a, b) => a.k - b.k);
    for (const it of items) it.draw();

    // ---- water pouring off the corner into the cloud sea, and the sea in front
    drawWater(g, cam, pal, tod);
    drawCloudSea(g, pal, tod);
  },
};

// ------------------------------------------------------------ scenery

function drawSky(g, pal, tod, hf, night) {
  // stars at night
  const starA = clamp(1 - Math.abs(((hf + 6) % 24) - 6) / 3, 0, 1);
  const dark = hf < 6 || hf > 20 ? 1 : 0;
  if (dark) {
    for (let i = 0; i < 26; i++) {
      const x = hash(i, 1) % W, y = hash(i, 2) % 46;
      const tw = 0.5 + 0.5 * sin(tod * (1 + (i % 5) * 0.4) + i);
      g.pixel(x, y, mix(pal.sky0, 0xfff6e0, 0.4 + 0.5 * tw));
    }
  }
  // the sun or the moon, crossing the sky with the hour
  const dayU = (hf - 6) / 14;   // 0 at 06:00, 1 at 20:00
  if (dayU > -0.05 && dayU < 1.05) {
    const x = 18 + 124 * dayU, y = 30 - 22 * sin(Math.PI * clamp(dayU, 0, 1));
    g.fillCircle(x, y, 6, mix(pal.sky1, 0xfff4cc, 0.85), { aa: true });
  } else {
    const nu = (((hf - 20) + 24) % 24) / 10;   // 20:00 -> 06:00
    const x = 18 + 124 * nu, y = 26 - 18 * sin(Math.PI * clamp(nu, 0, 1));
    g.fillCircle(x, y, 4.5, 0xf4efe0, { aa: true });
    g.fillCircle(x + 2, y - 1, 4, pal.sky0, { aa: true });
  }
  // two birds now and then, crossing on a slow wave
  for (let i = 0; i < 2; i++) {
    const per = 23 + i * 9, u = ((tod + i * 11) % per) / 9;   // crossing takes 9 s, then a gap
    if (u > 1) continue;
    const dir = Math.floor((tod + i * 11) / per) % 2 ? 1 : -1;
    const x = dir > 0 ? -6 + 172 * u : 166 - 172 * u;
    const y = 8 + i * 6 + 3 * sin(u * 7 + i);
    const up = Math.floor(tod * 5 + i * 2) % 2;
    const ink = mix(pal.dark, pal.sky0, 0.2);
    g.pixel(x, y, ink); g.pixel(x - 1, y - up, ink); g.pixel(x + 1, y - up, ink);
    g.pixel(x - 2, y - 1 + up * 0, ink); g.pixel(x + 2, y - 1, ink);
  }
  // drifting clouds: flat lozenges, MV style
  for (let i = 0; i < 3; i++) {
    const sp = 0.8 + i * 0.35;
    const x = ((tod * sp + i * 83) % 230) - 36;
    const y = 6 + i * 9;
    const c = mix(pal.cloud, mix(pal.sky0, pal.sky1, y / 80), 0.6);
    g.fillRoundRect(x, y, 22 + i * 4, 4, 2, c);
    g.fillRoundRect(x + 6, y - 3, 10, 4, 2, c);
  }
}

function drawWater(g, cam, pal, tod) {
  // the spout: the front corner of the terrace under the colon
  const [sx, sy] = cam.proj(3, 3, -1);
  const x0 = Math.round(sx) - 1, y0 = Math.round(sy) + 1;
  for (let y = y0; y < H; y++) {
    for (let dx = 0; dx < 3; dx++) {
      const streak = ((y - Math.floor(tod * 40) + dx * 3) & 7) < 2;
      g.pixel(x0 + dx, y, streak ? 0xffffff : pal.water);
    }
  }
}

function drawCloudSea(g, pal, tod) {
  const base = 72;
  for (let i = 0; i < 12; i++) {
    const x = ((i * 17 + tod * 2.2) % 204) - 22;
    const r = 6 + (hash(i, 9) % 5);
    g.fillCircle(x, base + 4 + (i % 2) * 2, r, mix(pal.cloud, pal.sky1, 0.35), { aa: false });
  }
  for (let i = 0; i < 12; i++) {
    const x = ((i * 19 + 9 - tod * 1.4) % 228) - 24;
    const r = 5 + (hash(i, 11) % 4);
    g.fillCircle(x, base + 8, r, pal.cloud, { aa: false });
  }
}
