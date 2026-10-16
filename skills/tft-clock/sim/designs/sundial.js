// Gnomon: an anamorphic shadow sculpture. Fifty-two brass spheres hang on
// hairline cables in a sunbeam in front of a plaster wall. Seen from where
// you stand they are a loose, meaningless cloud; their shadows on the sunlit
// wall below spell the time as a 3x5 dot matrix, one sphere per dot. The
// sculpture is the gnomon of a sundial, and the sun is what reads it.
//
// The trick is real geometry, not a decal. Each sphere is placed on the light
// ray through its dot (P = dot - z * L), at whatever depth z puts it at a
// chosen height on screen (solved in closed form for the perspective
// camera). So:
//  - all minute the spheres bob up and down their cables, and every one
//    slides along its own sunray as it does: the cloud never stops moving
//    and the shadows never move at all;
//  - at the minute the sun swings to a new angle (each minute has its own;
//    the base follows the real sun: from the left in the morning, high at
//    noon, from the right in the evening, and a moon at night). The whole
//    cloud shears to keep the unchanged digits' shadows pinned, while the
//    spheres of the changing digits reel up and fly; their shadow dots
//    scatter across the wall and regather as the new digit. Old dots leave
//    from :58.6 and are all off their places by :00; the new digit is whole
//    by :01.6 (the hour turn runs :57.6 to :02.6).
//  - at the hour the sun makes a big swing and every sphere changes place:
//    the roles rotate round the whole sculpture, so all 52 shadows travel.
//
// Shadows are the shade colour of the wall, because a shadow is simply the
// wall without the sun: the time is read in the sky-blue of the shade,
// on warm sunlit plaster. The light patch is the shadow of the aperture the
// sun comes through, so its edges slide as the sun swings; air in the beam
// is faintly hazy, and each sphere's shadow shows in the haze as a dim
// streak toward its dot. Cable shadows are left out on purpose: a hairline
// that far from the wall casts only penumbra.
//
// Palette, per time of day (lit plaster / shade / the brass): dawn rose,
// morning gold, noon cream under a blue shade, sunset orange under violet,
// moonlight steel blue at night (and the backlight dims).
// Hard pixels for the wall, haze and streaks; AA for the spheres and the
// shadow dots, which glide by fractions of a pixel.

import { mix, hex, clamp, lerp, rand, ease, clockFields } from '../js/kit.js';

// ---- the reading: a 3x5 dot matrix, one sphere's shadow per dot
const G3 = {
  0: '### #.# #.# #.# ###', 1: '.#. ##. .#. .#. ###', 2: '### ..# ### #.. ###',
  3: '### ..# .## ..# ###', 4: '#.# #.# ### ..# ..#', 5: '### #.. ### ..# ###',
  6: '### #.. ### #.# ###', 7: '### ..# ..# .#. .#.', 8: '### #.# ### #.# ###',
  9: '### #.# ### ..# ###',
};
const PITCH = 7, X0 = 24, Y0 = 45;
const SLOT_COL = [0, 4, 8, 10, 14];       // H, H, colon, M, M (in dot columns)
const CAP = [12, 13, 2, 12, 13];          // most dots each slot can need
const SLOT_START = CAP.map((_, i) => CAP.slice(0, i).reduce((a, b) => a + b, 0));
const N = 52;
const SLOT_OF = []; CAP.forEach((c, k) => { for (let j = 0; j < c; j++) SLOT_OF.push(k); });

const DOTS = {};
for (const d in G3) {
  const out = [];
  G3[d].split(' ').forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') out.push([x, y]); }));
  DOTS[d] = out;
}
const COLON = [[0, 1], [0, 3]];

/** The wall position of the dot a role casts in a reading; spare roles double up on a dot. */
function dotFor(reading, role) {
  const k = SLOT_OF[role], j = role - SLOT_START[k];
  const cells = k === 2 ? COLON : DOTS[reading[k]];
  const [cx, cy] = cells[j % cells.length];
  return [X0 + (SLOT_COL[k] + cx) * PITCH, Y0 + cy * PITCH];
}
const readingOf = (F) => [F.hh[0], F.hh[1], ':', F.mm[0], F.mm[1]];
// which role each sphere plays rotates every hour, so the hour turn moves them all
const roleOf = (i, F) => (i - ((F.h * 19) % N) + N) % N;

// ---- camera and light
const F_CAM = 300, CY = 40, R = 3.0;

/** The sun (or moon) for a minute: [lx, ly], the shadow's slide per unit of depth. */
function lightFor(F) {
  const hf = F.h + F.m / 60;
  const day = hf >= 6 && hf < 20;
  const az = clamp(((day ? hf : (hf + 12) % 24) - 13) / 7, -1, 1);
  let lx = -0.3 * az, ly = 0.6 + 0.4 * (1 - az * az);
  lx += (F.m % 2 ? 0.14 : -0.14) + 0.06 * (rand(F.minuteKey, 3) - 0.5);
  ly += 0.1 * (rand(F.minuteKey, 4) - 0.5);
  return [lx, ly];
}

// ---- palette by hour: lit plaster, lit plaster high, shade, shade top, brass mid
const KEYS = [
  [0, 'a8b8d8', 'c4d0e8', '161c3c', '0a0e22', '8890a0'],
  [5, 'a8a8d0', 'c0c0e0', '1a1a3e', '0c0c24', '908898'],
  [6.5, 'f2a07c', 'f8c0a0', '2a2052', '140e30', 'b07048'],
  [9, 'f6cc88', 'fadca8', '2c3466', '181e46', 'b0702e'],
  [12.5, 'f8e4bc', 'fff2d8', '36457a', '1e2856', 'b88038'],
  [16, 'f4c070', 'f8d498', '2e3262', '1a1c44', 'b06c2a'],
  [18.5, 'f08448', 'f8a468', '2c1c4c', '160c2c', 'a85a28'],
  [20, 'b890b0', 'd0a8c8', '1e1a40', '0e0c26', '987080'],
  [21.5, 'a8b8d8', 'c4d0e8', '161c3c', '0a0e22', '8890a0'],
  [24, 'a8b8d8', 'c4d0e8', '161c3c', '0a0e22', '8890a0'],
].map(([h, ...cs]) => [h, ...cs.map(hex)]);

function paletteAt(hf) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= hf) i++;
  const a = KEYS[i], b = KEYS[i + 1], u = clamp((hf - a[0]) / (b[0] - a[0]), 0, 1);
  const c = (j) => mix(a[j], b[j], u);
  return { lit: c(1), litHi: c(2), shade: c(3), top: c(4), brass: c(5) };
}

export default {
  name: 'Gnomon',
  blurb: 'A cloud of brass spheres in a sunbeam; only their shadows spell the time, and the sun re-aims every minute.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, t0 = ctx.date.getTime();
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.7 * night);
    const cur = f, nxt = clockFields(new Date(t0 + 60000)), prv = clockFields(new Date(t0 - 60000));

    // ---- which turn we are in, and how far through it
    let A = cur, B = cur, p = 0, hour = false;
    const startOf = (F) => (F.m === 59 ? 57.6 : 58.6), durOf = (F) => (F.m === 59 ? 5 : 3);
    if (s >= startOf(cur)) { B = nxt; hour = cur.m === 59; p = (s - startOf(cur)) / durOf(cur); }
    else if (s < startOf(prv) - 60 + durOf(prv)) { A = prv; hour = prv.m === 59; p = (s - startOf(prv) + 60) / durOf(prv); }
    p = clamp(p, 0, 1);
    const pe = ease.inOutCubic(p), swing = Math.sin(Math.PI * p);

    const LA = lightFor(A), LB = lightFor(B);
    let lx = lerp(LA[0], LB[0], pe), ly = lerp(LA[1], LB[1], pe);
    if (hour) { lx += 0.3 * swing * (LB[0] > LA[0] ? -1 : 1); ly -= 0.15 * swing; }

    const P = paletteAt(f.h + f.m / 60 + s / 3600);
    const { lit, litHi, shade, top } = P;

    // ---- the wall: shade everywhere, the sun's patch where the aperture lets it through
    const ZW = 25;
    const px0 = 6 + ZW * lx, px1 = 154 + ZW * lx, py0 = 12 + ZW * ly;
    const ix0 = Math.max(0, Math.ceil(px0)), ix1 = Math.min(160, Math.floor(px1)), iy0 = Math.ceil(py0);
    // shade beside the patch (the patch and the haze cover the rest)
    if (ix0 > 0) g.gradient(0, iy0, ix0, 80 - iy0, [mix(top, shade, iy0 / 80), shade]);
    if (ix1 < 160) g.gradient(ix1, iy0, 160 - ix1, 80 - iy0, [mix(top, shade, iy0 / 80), shade]);
    // haze in the beam: thickest just above the patch, thinning upward
    g.gradient(0, 0, 160, iy0, [[0, mix(top, litHi, 0.02)], [1, mix(shade, litHi, 0.16)]], { a: 1 });
    g.gradient(ix0, iy0, ix1 - ix0, 80 - iy0, [litHi, lit]);
    if (ix0 > 0) g.fillRect(ix0 - 1, iy0, 1, 80 - iy0, lit, { a: ix0 - px0 });
    if (ix1 < 160) g.fillRect(ix1, iy0, 1, 80 - iy0, lit, { a: px1 - ix1 });
    g.fillRect(ix0, iy0 - 1, ix1 - ix0, 1, litHi, { a: iy0 - py0 });

    // ---- place every sphere on the ray through its dot
    const rdA = readingOf(A), rdB = readingOf(B);
    const tt = (f.minuteKey % 10000) * 60 + s;
    const balls = [];
    for (let i = 0; i < N; i++) {
      const rA = roleOf(i, A), rB = roleOf(i, B);
      const sA = dotFor(rdA, rA), sB = dotFor(rdB, rB);
      const fly = hour || sA[0] !== sB[0] || sA[1] !== sB[1] || rdA[SLOT_OF[rA]] !== rdB[SLOT_OF[rB]];
      const di = rand(i, 7) * 0.3, q = clamp((p - di) / 0.7, 0, 1), qe = ease.inOutCubic(q), bump = Math.sin(Math.PI * q);
      let u = lerp(sA[0], sB[0], qe), v = lerp(sA[1], sB[1], qe);
      let Y = lerp(4 + 30 * rand(i, A.minuteKey), 4 + 30 * rand(i, B.minuteKey), qe);
      if (fly) {
        const ang = rand(i, B.minuteKey, 9) * Math.PI * 2, mag = (hour ? 10 : 7) + 8 * rand(i, B.minuteKey, 10);
        u += bump * mag * Math.cos(ang); v += bump * 0.5 * mag * Math.sin(ang);
        Y -= bump * 10;
      }
      // the kinetic part: a slow swell rolls across the sculpture, plus each sphere's own drift
      Y += 2.6 * Math.sin(tt * 0.8 - u * 0.045 - v * 0.03) + 1.2 * Math.sin(tt * (0.4 + 0.5 * rand(i, 11)) + rand(i, 12) * 6.283);
      Y = clamp(Y, 1, v - 4);
      const z = F_CAM * (v - Y) / (ly * F_CAM + CY - Y);
      const k = F_CAM / (F_CAM - z);
      const X = 80 + (u - lx * z - 80) * k;
      // a sphere is in the sun only if its shadow falls in the patch
      const inSun = clamp(Math.min(u - px0, px1 - u, v - py0) / 3 + 0.5, 0, 1);
      balls.push({ u, v, X, Y, z, k, inSun });
    }

    // ---- shadows on the wall (the wall's own shade colour)
    const rx = R * Math.sqrt(1 + lx * lx), ry = R * Math.sqrt(1 + ly * ly);
    for (const b of balls) g.fillEllipse(b.u, b.v, rx, ry, shade, { aa: true });

    // ---- shadow streaks in the hazy air, above the patch
    g.clip(0, 0, 160, iy0);
    for (const b of balls) {
      const r = R * b.k * 0.8, dx = b.u - b.X, dy = b.v - b.Y, d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d * r, ny = dx / d * r;
      g.fillPolygon([[b.X + nx, b.Y + ny], [b.u + nx * 0.8, b.v + ny * 0.8], [b.u - nx * 0.8, b.v - ny * 0.8], [b.X - nx, b.Y - ny]],
        top, { a: 0.18 * b.inSun });
    }
    g.unclip();

    // ---- the spheres and their cables, far first
    balls.sort((a, b) => a.z - b.z);
    const n = Math.hypot(lx, ly, 1), hx = -lx / n, hy = -ly / n;
    const cable = mix(shade, litHi, 0.28);
    const dark = mix(hex('2a1a0e'), shade, 0.45), brass = P.brass, glint = mix(litHi, 0xffffff, 0.5);
    for (const b of balls) {
      const r = R * b.k, near = clamp((b.z - 10) / 55, 0, 1);
      g.vline(Math.floor(b.X), 0, Math.max(0, Math.floor(b.Y - r + 0.5)), cable, { a: 0.22 + 0.25 * near });
      g.fillCircle(b.X, b.Y, r, dark, { aa: true });
      // bounce light from the sunny wall below, on the underside
      g.fillCircle(b.X, b.Y + r * 0.35, r * 0.75, mix(dark, lit, 0.35), { aa: true, a: 0.6 });
      const sun = b.inSun;
      g.fillCircle(b.X + hx * r * 0.28, b.Y + hy * r * 0.28, r * 0.78, mix(dark, mix(brass, lit, 0.2), 0.25 + 0.75 * sun), { aa: true });
      if (sun > 0) g.fillCircle(b.X + hx * r * 0.5, b.Y + hy * r * 0.5, r * 0.32, glint, { aa: true, a: sun });
    }

    // ---- dust motes drifting in the beam
    for (let i = 0; i < 14; i++) {
      const sp = 0.6 + rand(i, 21) * 1.2;
      const mx = (rand(i, 22) * 170 + tt * sp * 0.7) % 170 - 5, my = (rand(i, 23) * 60 + tt * sp * 0.35) % 60 - 4;
      const tw = 0.5 + 0.5 * Math.sin(tt * (1 + rand(i, 24) * 2) + i);
      if (my < iy0 - 1) g.pixel(Math.floor(mx), Math.floor(my), glint, { a: 0.25 + 0.45 * tw });
    }
  },
};
