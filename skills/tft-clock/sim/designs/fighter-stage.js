// fighter: the stages. Three, by time of day, each in three planes that
// scroll at different rates under the camera (far 0.3, near 0.65) over a
// floor drawn in perspective: every row of the floor is the same strip of
// texture at a different scale, so the seams run to a vanishing point and
// swing as the camera pans, the way the 16-bit stages faked depth.
//
//   dock    07:00-15:59  noon harbour, a ship's crowd that cheers the hits
//   airbase 16:00-19:59  sunset over the hangars, a beacon turning
//   temple  20:00-06:59  a moonlit temple roof, paper lanterns
//
// The planes are prebuilt once per stage as RGB565 (the far plane opaque,
// the near plane with holes); the live bits (crowd, lanterns, glints,
// beacon, clouds) are a few dozen small shapes a frame.
import { hex, mix, rand, dither565, to565, R, G, B, sin } from '../js/kit.js';

export const FLOOR_Y = 58;      // the floor's far edge on screen
export const FEET_Y = 76;       // where feet stand
const HZ = 30;                  // vanishing row
export const FAR_W = 192, NEAR_W = 224;

const C = (s) => hex(s);
const lerpStops = (stops, u) => {
  const n = stops.length - 1, f = Math.max(0, Math.min(n - 1e-6, u * n)), i = Math.floor(f);
  return mix(stops[i], stops[i + 1], f - i);
};

function canvas(w, h, fill = -1) {
  return { w, h, d: new Int32Array(w * h).fill(fill) };
}
const put = (L, x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < L.w && y < L.h) L.d[y * L.w + x] = c; };
const rectL = (L, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(L, x + i, y + j, c); };
const discL = (L, cx, cy, r, c) => {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++)
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) put(L, x, y, c);
};
/** Colour to RGB565 with ordered dither (the planes are stored ready to copy). */
const dz = (c, x, y) => dither565(R(c), G(c), B(c), x, y);

// ------------------------------------------------------------ the stages

const STAGES = {
  dock: buildDock,
  airbase: buildAirbase,
  temple: buildTemple,
};
export function stageFor(h) {
  if (h >= 7 && h < 16) return 'dock';
  if (h >= 16 && h < 20) return 'airbase';
  return 'temple';
}

const BUILT = {};
export function stage(name) {
  if (!BUILT[name]) BUILT[name] = STAGES[name]();
  return BUILT[name];
}

function finishPlane(L, opaque) {
  const o = new Int32Array(L.w * L.h);
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const c = L.d[y * L.w + x];
    o[y * L.w + x] = c < 0 ? (opaque ? 0 : -1) : dz(c, x, y);
  }
  return { w: L.w, h: L.h, d: o };
}

/** A floor texture: `fn(u, row)` colour for world-x u at screen row; period P. */
function floorTex(P, fn) {
  const rows = 80 - FLOOR_Y;
  const d = new Int32Array(P * rows);
  for (let j = 0; j < rows; j++) for (let u = 0; u < P; u++) d[j * P + u] = fn(u, FLOOR_Y + j);
  return { P, d };
}

function buildDock() {
  const far = canvas(FAR_W, FLOOR_Y);
  const sky = [C('#2f6fd8'), C('#5aa0ec'), C('#a8dcf8')];
  for (let y = 0; y < FLOOR_Y; y++) for (let x = 0; x < FAR_W; x++) far.d[y * FAR_W + x] = lerpStops(sky, y / 36);
  // distant shore
  for (let x = 0; x < FAR_W; x++) {
    const hgt = 3 + Math.floor(3 * Math.abs(sin(x * 0.05)) + 2 * rand(x >> 3, 5));
    for (let y = 36 - hgt; y < 36; y++) put(far, x, y, C('#6a96c4'));
    if (x % 23 < 4 && x > 20) for (let y = 36 - hgt - 6; y < 36; y++) put(far, x, y, C('#7aa4cc'));
  }
  // sea
  for (let y = 36; y < FLOOR_Y; y++) for (let x = 0; x < FAR_W; x++)
    far.d[y * FAR_W + x] = mix(C('#2a6cc0'), C('#174a98'), (y - 36) / 22);
  // the ship (near plane): a hull with portholes, a deck rail, a mast
  const near = canvas(NEAR_W, FLOOR_Y);
  const hull0 = 30, S0 = 46, S1 = 196;
  for (let x = S0 - 10; x < S1 + 14; x++) {
    // the bow rakes out to the right, the stern is square
    const top = x < S0 ? hull0 + (S0 - x) : x > S1 ? hull0 - 2 + Math.floor((x - S1) / 3) : hull0;
    const bot = x > S1 ? FLOOR_Y - (x - S1) * 1.4 : FLOOR_Y;
    if (x < S0 && x < S0 - 9) continue;
    for (let y = top; y < bot; y++) {
      let c = y < top + 3 ? C('#e8e4dc') : y < hull0 + 13 ? C('#1e1a22') : C('#8a2a20');
      if (y === hull0 + 13) c = C('#f0d060');
      put(near, x, y, c);
    }
    if (x % 14 === 4 && x > S0 && x < S1) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(near, x + dx, hull0 + 7 + dy, C('#ffe8a0'));
  }
  // rail above the deck
  for (let x = S0; x < S1; x++) put(near, x, hull0 - 6, C('#f4f0e8'));
  for (let x = S0; x < S1; x += 8) for (let y = hull0 - 6; y < hull0; y++) put(near, x, y, C('#d8d4cc'));
  // mast and rigging
  for (let y = 0; y < hull0 - 6; y++) { put(near, 120, y, C('#5a3a2a')); put(near, 121, y, C('#3a2418')); }
  for (let i = 0; i < 44; i++) { put(near, 120 - i * 1.7, i * 0.55, C('#2a2a3a')); put(near, 121 + i * 1.7, i * 0.55, C('#2a2a3a')); }
  // a flag
  rectL(near, 122, 1, 9, 5, C('#e02828'));
  rectL(near, 124, 2, 5, 3, C('#ffffff'));
  // crowd slots on the deck (drawn live)
  const crowd = [];
  for (let x = S0 + 4; x < S1 - 3; x += 7 + Math.floor(rand(x, 1) * 4)) {
    crowd.push({ x, c: [C('#d83a3a'), C('#3a7ad8'), C('#f0c040'), C('#40a860'), C('#a050c0'), C('#f08030'), C('#e8e8e8')][Math.floor(rand(x, 2) * 7)],
      skin: [C('#f0c8a0'), C('#c89060'), C('#8a5a3a'), C('#e8b088')][Math.floor(rand(x, 3) * 4)], ph: rand(x, 4) * 6, tall: rand(x, 6) < 0.4 });
  }
  const floor = floorTex(96, (u, y) => {
    const plank = Math.floor(u / 12);
    let c = [C('#b07a40'), C('#9c6834'), C('#a8743c'), C('#946030')][plank % 4];
    const near = (y - FLOOR_Y) / 22;
    c = mix(c, C('#5a3418'), 0.35 * (1 - near));
    if (u % 12 === 0) c = C('#4a2a14');
    if (u % 12 === 6 && (y & 3) === 1) c = mix(c, C('#ffe0a0'), 0.25);
    return c;
  });
  return { far: finishPlane(far, true), near: finishPlane(near, false), floor, crowd, hull0, name: 'dock',
    shadow: C('#3a2010'), edge: C('#d8a868') };
}

function buildAirbase() {
  const far = canvas(FAR_W, FLOOR_Y);
  const sky = [C('#2a1a4a'), C('#7a2a5a'), C('#d84a3a'), C('#f89a3a'), C('#ffd880')];
  for (let y = 0; y < FLOOR_Y; y++) for (let x = 0; x < FAR_W; x++) far.d[y * FAR_W + x] = lerpStops(sky, Math.pow(y / 52, 1.1));
  // the sun, low, with a soft halo
  const sx = 64, sy = 41;
  for (let y = 0; y < FLOOR_Y; y++) for (let x = 0; x < FAR_W; x++) {
    const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy);
    if (d < 11) far.d[y * FAR_W + x] = mix(C('#fff6c8'), C('#ffd060'), d / 11);
    else if (d < 22) far.d[y * FAR_W + x] = mix(far.d[y * FAR_W + x], C('#ffc070'), 0.45 * (1 - (d - 11) / 11));
  }
  // mountains
  for (let x = 0; x < FAR_W; x++) {
    const m = 40 + 6 * sin(x * 0.045 + 1) + 3 * sin(x * 0.13) ;
    for (let y = Math.floor(m); y < FLOOR_Y; y++) put(far, x, y, y < m + 2 ? C('#7a3a5a') : C('#4a2448'));
  }
  const near = canvas(NEAR_W, FLOOR_Y);
  // hangar (left)
  for (let x = 0; x < 92; x++) {
    const roof = 22 + Math.floor(((x - 46) ** 2) / 220);
    for (let y = roof; y < FLOOR_Y; y++) {
      let c = (x & 3) === 0 ? C('#3a3450') : C('#4a4262');
      if (y === roof) c = C('#ffb070');
      if (x > 20 && x < 72 && y > 36) c = (y & 1) ? C('#1a1424') : C('#221a2e');
      put(near, x, y, c);
    }
  }
  // tower (right)
  for (let y = 14; y < FLOOR_Y; y++) for (let x = 196; x < 204; x++) put(near, x, y, x === 196 ? C('#ffa060') : C('#3a3048'));
  rectL(near, 192, 10, 16, 6, C('#2a2238'));
  rectL(near, 193, 11, 14, 3, C('#7ad0e0'));
  // a parked jet, nose left
  const jet = [[120, 48], [132, 45], [170, 44], [182, 36], [186, 36], [184, 45], [192, 46], [192, 50], [126, 51]];
  fillPolyL(near, jet, C('#2e2838'));
  for (const [x, y] of [[132, 45], [150, 44], [170, 44]]) put(near, x, y - 1, C('#ffb070'));
  rectL(near, 134, 46, 10, 2, C('#5aa0c0'));
  fillPolyL(near, [[150, 50], [168, 50], [176, 55], [146, 55]], C('#241e2e'));
  // fence
  for (let x = 0; x < NEAR_W; x++) {
    if (x % 6 === 0) for (let y = 44; y < FLOOR_Y; y++) if (near.d[y * NEAR_W + x] < 0) put(near, x, y, C('#2a1c30'));
    if (near.d[44 * NEAR_W + x] < 0) put(near, x, 44, C('#3a2838'));
    for (let y = 46; y < FLOOR_Y; y += 3) if ((x + y) % 3 === 0 && near.d[y * NEAR_W + x] < 0) put(near, x, y, C('#3a2838'));
  }
  const floor = floorTex(64, (u, y) => {
    const near = (y - FLOOR_Y) / 22;
    let c = mix(C('#7a6070'), C('#b09088'), near);
    if (u % 32 === 0) c = C('#3a2a38');
    if (y === 66) c = C('#f0c040');
    if ((u * 7 + y * 13) % 17 === 0) c = mix(c, C('#ffffff'), 0.08);
    return c;
  });
  return { far: finishPlane(far, true), near: finishPlane(near, false), floor, name: 'airbase',
    beacon: [200, 9], shadow: C('#3a2430'), edge: C('#ffc080') };
}

function buildTemple() {
  const far = canvas(FAR_W, FLOOR_Y);
  const sky = [C('#050820'), C('#0e1440'), C('#262a5e'), C('#3e3468')];
  for (let y = 0; y < FLOOR_Y; y++) for (let x = 0; x < FAR_W; x++) far.d[y * FAR_W + x] = lerpStops(sky, y / 56);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rand(i, 11) * FAR_W), y = Math.floor(rand(i, 12) * 34);
    put(far, x, y, rand(i, 13) < 0.3 ? C('#ffffff') : C('#8a90c8'));
  }
  // the moon and its halo
  const mx = 128, my = 18;
  for (let y = 0; y < FLOOR_Y; y++) for (let x = 0; x < FAR_W; x++) {
    const d = Math.hypot(x + 0.5 - mx, y + 0.5 - my);
    if (d < 10) {
      let c = C('#f6eecc');
      const cr = [[124, 15, 2.2], [131, 21, 1.6], [127, 22, 1.2], [132, 13, 1.4]];
      for (const [cx, cy, r] of cr) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r) c = C('#d8cca0');
      if (d > 8.6) c = mix(c, C('#c8c0a0'), 0.5);
      far.d[y * FAR_W + x] = c;
    } else if (d < 22) far.d[y * FAR_W + x] = mix(far.d[y * FAR_W + x], C('#6a6a9a'), 0.5 * (1 - (d - 10) / 12) ** 1.5);
  }
  // hills and a far pagoda
  for (let x = 0; x < FAR_W; x++) {
    const m = 42 + 5 * sin(x * 0.04) + 2 * sin(x * 0.17 + 2);
    for (let y = Math.floor(m); y < FLOOR_Y; y++) put(far, x, y, C('#141634'));
  }
  for (let k = 0; k < 4; k++) {
    const y0 = 26 + k * 5, half = 9 - k;
    for (let x = -half; x <= half; x++) put(far, 40 + x, y0, C('#0c0c22'));
    for (let x = -half + 2; x <= half - 2; x++) for (let y = y0 + 1; y < y0 + 5; y++) put(far, 40 + x, y, C('#101030'));
  }
  for (let y = 20; y < 26; y++) put(far, 40, y, C('#0c0c22'));
  // distant windows
  for (let i = 0; i < 18; i++) put(far, 60 + Math.floor(rand(i, 21) * 120), 47 + Math.floor(rand(i, 22) * 8), C('#e0b050'));
  const near = canvas(NEAR_W, FLOOR_Y);
  // eaves at both ends, sweeping up
  const eave = (x0, dir) => {
    for (let i = 0; i < 48; i++) {
      const x = x0 + dir * i;
      const top = 8 + Math.floor((i / 48) ** 2 * 14);
      for (let y = top; y < top + 4; y++) put(near, x, y, y === top ? C('#d8a040') : C('#141020'));
      if (i > 34) for (let y = top + 4; y < FLOOR_Y; y++) put(near, x, y, i === 35 ? C('#6a2018') : C('#3a1414'));
    }
  };
  eave(0, 1); eave(NEAR_W - 1, -1);
  // balustrade
  for (let x = 0; x < NEAR_W; x++) {
    if (near.d[46 * NEAR_W + x] >= 0) continue;
    put(near, x, 46, C('#8a2a20')); put(near, x, 47, C('#4a1612'));
    put(near, x, 55, C('#6a2018'));
    if (x % 10 < 2) for (let y = 48; y < FLOOR_Y; y++) put(near, x, y, x % 10 === 0 ? C('#7a2418') : C('#3a1010'));
  }
  const floor = floorTex(64, (u, y) => {
    const near = (y - FLOOR_Y) / 22;
    let c = mix(C('#262a48'), C('#4a5078'), near);
    if (u % 16 === 0) c = C('#151832');
    const band = [61, 65, 70, 76];
    if (band.includes(y)) c = mix(c, C('#8a90c0'), 0.35);
    return c;
  });
  return { far: finishPlane(far, true), near: finishPlane(near, false), floor, name: 'temple',
    lanterns: [44, 180], shadow: C('#080818'), edge: C('#8a8ac0') };
}

function fillPolyL(L, pts, c) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  for (let y = Math.floor(y0); y <= y1; y++) {
    const xs = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y + 0.5) !== (yj > y + 0.5)) xs.push(xi + ((y + 0.5 - yi) / (yj - yi)) * (xj - xi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x < xs[k + 1] - 0.5; x++) put(L, x, y, c);
  }
}

// ------------------------------------------------------------ per frame

/**
 * Draw the stage for camera x `cam` (0..96) with screen shake (sx, sy).
 * `dark` (0..1) dims it for the super flash. Writes the buffer directly and
 * books the work on the canvas's cost counters (a copy per pixel).
 */
export function drawStage(g, st, cam, t, sx, sy, cheer) {
  const buf = g.buf, W = 160;
  const fo = Math.round(cam * 0.3) - sx, no = Math.round(cam * 0.65) - sx;
  for (let y = 0; y < FLOOR_Y; y++) {
    const yy = Math.max(0, Math.min(FLOOR_Y - 1, y - sy));
    const fr = yy * st.far.w, nr = yy * st.near.w;
    for (let x = 0; x < W; x++) {
      const fx = Math.max(0, Math.min(st.far.w - 1, x + fo));
      const nx = x + no;
      const v = nx >= 0 && nx < st.near.w ? st.near.d[nr + nx] : -1;
      buf[y * W + x] = v >= 0 ? v : st.far.d[fr + fx];
    }
  }
  // the floor, in perspective
  const P = st.floor.P;
  for (let y = FLOOR_Y; y < 80; y++) {
    const yy = Math.max(FLOOR_Y, Math.min(79, y - sy));
    const s = (yy - HZ) / (FEET_Y - HZ);
    const row = (yy - FLOOR_Y) * P;
    let u = cam + 80 - sx + (0 - 80 + 0.5) / s;
    const du = 1 / s;
    for (let x = 0; x < W; x++, u += du) {
      const ui = ((Math.floor(u) % P) + P) % P;
      buf[y * W + x] = to565(st.floor.d[row + ui]);
    }
  }
  g.cost.calls += 3;
  g.cost.box += W * 80 * 2;
  g.cost.px += W * 80;
  // the floor's far edge
  g.fillRect(0, FLOOR_Y - sy, 160, 1, st.edge, { a: 0.5 });
  live(g, st, cam, t, sx, sy, cheer);
}

function live(g, st, cam, t, sx, sy, cheer) {
  const no = Math.round(cam * 0.65) - sx, fo = Math.round(cam * 0.3) - sx;
  if (st.name === 'dock') {
    // glints on the sea
    for (let i = 0; i < 14; i++) {
      const ph = Math.floor(t * 3 + i * 0.37);
      const x = Math.floor(rand(i, ph) * FAR_W) - fo, y = 38 + Math.floor(rand(i, ph, 2) * 18) + sy;
      if (y < 30 + 15 || x < 0 || x > 158) continue;
      g.fillRect(x, y, 2, 1, 0xd8f0ff);
    }
    // clouds drift
    for (let i = 0; i < 3; i++) {
      const x = ((i * 70 + t * (3 + i)) % 240) - 40 - fo * 0.5, y = 6 + i * 7 + sy;
      g.fillEllipse(x, y, 10 + i * 2, 3, 0xf4fbff);
      g.fillEllipse(x + 6, y - 2, 6, 3, 0xffffff);
    }
    // the crowd on deck: they jump when the hits land
    for (const p of st.crowd) {
      const x = p.x - no;
      if (x < -4 || x > 164) continue;
      const hop = Math.max(0, sin(t * 14 + p.ph)) * 2.4 * cheer + sin(t * 2 + p.ph) * 0.4;
      const yb = st.hull0 - 1 + sy - hop;
      const hh = p.tall ? 9 : 7;
      g.fillRect(x - 2, yb - hh + 3, 5, hh - 3, p.c);
      g.fillCircle(x + 0.5, yb - hh + 1, 2, p.skin);
      if (cheer > 0.25) {
        const wave = sin(t * 12 + p.ph) > 0 ? 1 : 0;
        g.fillRect(x - 3 - wave, yb - hh - 2, 1, 4, p.skin);
        g.fillRect(x + 3 + wave, yb - hh - 2, 1, 4, p.skin);
      }
    }
    // the rail in front of them
    g.fillRect(0, st.hull0 - 3 + sy, 160, 1, 0xf4f0e8);
  } else if (st.name === 'airbase') {
    const [bx, by] = st.beacon;
    const on = Math.floor(t * 1.5) % 2 === 0;
    const x = bx - no, y = by + sy;
    g.fillRect(x - 1, y - 1, 3, 2, on ? 0xff3a20 : 0x5a1a20);
    if (on) g.fillCircle(x + 0.5, y, 3.5, 0xff6040, { a: 0.35 });
    // heat shimmer birds
    for (let i = 0; i < 3; i++) {
      const xx = ((t * (6 + i * 2) + i * 60) % 220) - 30 - fo, yy = 14 + i * 5 + sin(t * 1.5 + i) * 2 + sy;
      const flap = Math.floor(t * 6 + i) % 2;
      g.pixel(xx, yy, 0x2a1a30); g.pixel(xx - 1, yy - flap, 0x2a1a30); g.pixel(xx + 1, yy - flap, 0x2a1a30);
    }
  } else {
    for (const lx of st.lanterns) {
      const x = lx - no, y = 24 + sy + sin(t * 1.3 + lx) * 0.6;
      if (x < -10 || x > 170) continue;
      const fl = 0.75 + 0.25 * sin(t * 9 + lx) * sin(t * 4.3);
      g.fillRect(x, y - 10, 1, 6, 0x2a1810);
      g.fillCircle(x + 0.5, y + 1, 8, 0xff6020, { a: 0.18 * fl });
      g.fillEllipse(x + 0.5, y + 1, 4, 5, mix(0xb02010, 0xff5a20, fl));
      g.fillRect(x - 3, y - 4, 7, 1, 0x2a1810);
      g.fillRect(x - 3, y + 6, 7, 1, 0x2a1810);
      g.fillRect(x, y - 2, 1, 6, 0xffd070, { a: 0.6 * fl });
    }
  }
}
