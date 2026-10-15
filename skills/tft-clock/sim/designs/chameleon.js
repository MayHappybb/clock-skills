// Chameleon: the time is written in the scales on a chameleon's flank.
//
// It grips a branch across the whole strip, curled tail on the right,
// casque head on the left, its turret eye swivelling on its own. The digits
// are a mosaic of its scales: each scale is one dot of the type, so the
// font is the animal's skin.
//
// Every minute it changes colour, the way chameleons do, as a wave:
//   :57.6  the scales of each digit about to change fade back into the skin, head to tail
//   :58.9  a shimmering front sweeps the whole body into next minute's colours
//          (the digits that stay keep reading, in their new colour)
//   :00.2  the new digits bloom scale by scale, each popping up from nothing
// No scale ever shows a wrong digit.
//
// Most minutes, an insect blunders in front of its face: the eye locks on,
// and at about :27 the tongue snaps out, catches it and reels it in. Chewing,
// a slow blink, and back to swaying like a leaf in the wind.
//
// At night chameleons sleep and go pale: the skin washes to a pale mint,
// the eye closes, the jungle goes blue.
//
// Palette: a jungle of greens behind (bokeh, leaves, light), and each
// minute a skin scheme from SCHEMES: a ground, a darker skin between the
// scales, and a contrasting colour for the digit scales. Scales are AA
// discs, so the body sways by fractions of a pixel; the background is
// soft on purpose so the sharp scales stand off it.

import { Gfx, strokeDigit, hex, mix, scale, sin, cos, clamp, rand, noise, noise2, ease, progress, lerp, clockFields, sprite } from '../js/kit.js';

// ------------------------------------------------------------ the skin schemes
// [ground, between the scales, digit scales, crest and lips]
const SCHEMES = [
  ['3fae49', '1f6a2c', 'f6e33a', 'c8f070'],   // leaf green, lemon digits
  ['1aa59b', '0c5f5a', 'ff9a2e', '7fe6d8'],   // panther teal, orange
  ['4fbf3a', '24701c', 'ff4f7b', 'b0f080'],   // emerald, pink
  ['2f8fd0', '17507c', 'ffd23a', '8fd0ff'],   // ambilobe blue, gold
  ['8ab43a', '4a6a1c', 'f05a3a', 'd8ef7a'],   // olive, red
  ['20b38a', '0d6650', 'fff0a8', '9ff0d0'],   // jade, cream
  ['e07a2a', '8a3a10', '5ae0e8', 'ffc070'],   // ember orange, cyan (an angry minute)
].map((s) => s.map(hex));
const SLEEP = ['d2e6cc', 'a2bea2', '5f84b0', 'eef6e8'].map(hex);   // asleep: pale, the digits a dusty blue

function scheme(key, night) {
  // Consecutive minutes always differ: the step from one to the next is 2, 3 or 4 of 7.
  const s = SCHEMES[(((key * 3 + Math.floor(rand(key, 77) * 2)) % 7) + 7) % 7];
  return s.map((c, i) => mix(c, SLEEP[i], night));
}

// ------------------------------------------------------------ the body
const X0 = 36, X1 = 146;                 // flank, neck to tail base
const CY = 38;                           // body centre line
const half = (u) => {                    // [above, below] the centre line at u = 0..1 along the flank: an arched back, a round belly
  const sn = Math.max(0, Math.sin(Math.PI * u));
  return [Math.max(lerp(11, 4, u), 21 * Math.pow(sn, 0.46)), Math.max(lerp(9, 3.5, u), 15.5 * Math.pow(sn, 0.3))];
};

// Digit boxes on the flank (body coordinates).
const DW = 18, DH = 24, DY = CY - 12;
const DX = [48, 68, 92, 112];
const COLON = [89, [CY - 5, CY + 5]];

// The scale lattice: rows 2.7 apart, each row offset half a column, columns 2.9 apart.
const PITCH_X = 2.9, PITCH_Y = 2.7;
const SCALES = [];
for (let r = 0; ; r++) {
  const y = CY - 12 - 4 * PITCH_Y + r * PITCH_Y;
  if (y > CY + 17) break;
  for (let x = X0 + (r % 2 ? PITCH_X / 2 : 0); x <= X1; x += PITCH_X) {
    const u = (x - X0) / (X1 - X0), [a, b] = half(u);
    if (y < CY - a + 1.2 || y > CY + b - 1.2) continue;
    SCALES.push({ x, y, u, depth: (y - (CY - a)) / (a + b), n: rand(Math.round(x * 10), Math.round(y * 10)) });
  }
}

// Each digit's shape, sampled once on its own canvas (a pure function of the digit).
const MASKS = new Map();
function mask(d) {
  if (!MASKS.has(d)) {
    const c = new Gfx(DW, DH);
    strokeDigit(c, d, 0, 0, DW, DH, { weight: 5.2, c: 0xffffff });
    MASKS.set(d, c.buf);
  }
  return MASKS.get(d);
}
/** Which digit position (0..3) a scale at (x, y) belongs to for digit string `str`, or -1. Body coordinates. */
function digitAt(str, x, y) {
  for (let i = 0; i < 4; i++) {
    const lx = Math.floor(x - DX[i]), ly = Math.floor(y - DY);
    if (lx < 0 || ly < 0 || lx >= DW || ly >= DH) continue;
    return mask(+str[i])[ly * DW + lx] ? i : -1;
  }
  return -1;
}

// The tail: a spiral, wound tight at the tip.
const TAIL = [];
{
  let x = X1 - 1, y = CY + 1, a = 0.25, w = 7.5;
  for (let k = 0; k < 64; k++) {
    TAIL.push([x, y, w]);
    const step = lerp(1.3, 0.45, k / 64);
    a += lerp(0.055, 0.44, (k / 64) ** 1.5);
    x += step * cos(a); y += step * sin(a);
    w = Math.max(1.4, w * 0.972);
  }
}

// ------------------------------------------------------------ the scene
const BUG = sprite(`
  .ww.ww.
  wwwkwww
  .ww.ww.`, { w: 0xe8f0ff, k: 0x2a1a10 });
const BUG_UP = sprite(`
  w.....w
  .wwkww.
  ...k...`, { w: 0xe8f0ff, k: 0x2a1a10 });

const SKY = [
  [0, '06121c', '0c2426'], [5.5, '0a1a26', '1a3430'], [6.5, '1c3a36', '8a6a40'], [8, '123a38', '3e7a50'],
  [16.5, '123a38', '447e54'], [18.3, '2a3226', 'b0703a'], [19.5, '142024', '4a3a32'], [20.5, '081620', '0e2a26'], [24, '06121c', '0c2426'],
].map(([h, a, b]) => [h, hex(a), hex(b)]);
function keyed(table, h, pick) {
  let k = 1;
  while (table[k][0] < h) k++;
  const a = table[k - 1], b = table[k];
  return pick(a, b, (h - a[0]) / (b[0] - a[0]));
}

const branchY = (x) => 64 - 0.018 * x + 1.2 * sin(x * 0.045);

export default {
  name: 'Chameleon',
  blurb: 'The time is a mosaic of scales on a chameleon; it changes colour each minute and hunts in between.',
  fps: 30,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, tod = f.h * 3600 + f.m * 60 + s;
    const hour = f.h + f.m / 60 + s / 3600, night = ctx.night;
    const aa = { aa: true };
    ctx.lcd.backlight(1 - 0.65 * night);
    const [top, low] = keyed(SKY, hour, (a, b, u) => [mix(a[1], b[1], u), mix(a[2], b[2], u)]);
    const bright = clamp((hour > 12 ? 20 - hour : hour - 5) / 2, 0.25, 1);

    // ---- jungle: soft gradient, drifting bokeh, light shafts, hanging leaves
    g.gradient(0, 0, 160, 80, [top, low, mix(low, top, 0.6)], { angle: 80 });
    for (let k = 0; k < 11; k++) {
      const bx = (rand(k, 1) * 200 + tod * (0.6 + rand(k, 2) * 1.4)) % 200 - 20;
      const by = 6 + rand(k, 3) * 60 + 3 * sin(tod * 0.2 + k);
      const br = 5 + rand(k, 4) * 9;
      const bc = mix(hex('d8f070'), hex('70c8a0'), rand(k, 5));
      g.fillCircle(bx, by, br, bc, { aa: true, a: (0.07 + 0.08 * rand(k, 6)) * bright * (0.6 + 0.4 * sin(tod * 0.5 + k * 2)) });
    }
    if (night < 0.5) for (let k = 0; k < 2; k++) {
      const x = 30 + k * 70 + 14 * sin(tod * 0.05 + k * 3);
      g.fillPolygon([[x, 0], [x + 10, 0], [x - 22, 80], [x - 36, 80]], hex('fff6c0'), { aa: true, a: 0.06 * bright * (1 - 2 * night) });
    }
    const leaf = (x, y, len, ang, c) => {
      const tip = [x + len * cos(ang), y + len * sin(ang)], n = [-sin(ang) * len * 0.28, cos(ang) * len * 0.28];
      const mid = [(x + tip[0]) / 2, (y + tip[1]) / 2];
      g.fillPolygon([[x, y], [mid[0] + n[0], mid[1] + n[1]], tip, [mid[0] - n[0], mid[1] - n[1]]], c, aa);
      g.thickLine(x, y, tip[0], tip[1], 0.6, scale(c, 0.7), aa);
    };
    const leafC = mix(hex('2a6a2a'), hex('0e2a22'), night), leafC2 = mix(hex('3a8a34'), hex('12342a'), night);
    for (let k = 0; k < 7; k++) {
      const x = 6 + k * 24 + 6 * rand(k, 9), sway = 0.12 * sin(tod * 0.9 + k * 1.7);
      g.thickLine(x, 0, x + 2 * sin(tod * 0.7 + k), 5 + 8 * rand(k, 10), 0.8, leafC, aa);
      leaf(x + 2 * sin(tod * 0.7 + k), 4 + 8 * rand(k, 10), 9 + 4 * rand(k, 11), 1.2 + 0.7 * (rand(k, 12) - 0.5) + sway, k % 2 ? leafC : leafC2);
    }

    // ---- branch
    const bark = mix(hex('6a4a2e'), hex('2a2620'), night), barkD = scale(bark, 0.65), barkL = mix(bark, 0xffffff, 0.15);
    g.stroke(Array.from({ length: 17 }, (_, i) => [i * 10, branchY(i * 10)]), 7, bark, aa);
    for (let k = 0; k < 14; k++) {
      const x = 4 + k * 11.5 + 4 * rand(k, 20), y = branchY(x) - 1 + 2 * rand(k, 21);
      g.thickLine(x, y, x + 4 + 3 * rand(k, 22), y + 0.6, 0.8, k % 3 ? barkD : barkL, aa);
    }
    leaf(150, branchY(150) - 2, 10, -0.9 + 0.1 * sin(tod * 1.1), leafC2);

    // ---- this minute's schemes and digits
    const cur = f.hh + f.mm;
    const nf = clockFields(new Date(ctx.date.getTime() + 60000)), nxt = nf.hh + nf.mm;
    const pf = clockFields(new Date(ctx.date.getTime() - 60000)), prv = pf.hh + pf.mm;
    const S0 = scheme(f.minuteKey, night), S1 = scheme(f.minuteKey + 1, night);
    // The colour front (head to tail): 58.9 + u
    const front = (u) => 58.9 + 0.95 * u;
    const schemeAt = (u) => (s >= front(u) ? S1 : S0);

    // sway like a leaf; breathe
    const sx = 0.9 * sin(tod * 1.25) + 0.4 * sin(tod * 0.53), sy = 0.35 * sin(tod * 1.25 + 1);
    const br = 1 + 0.025 * sin(tod * 2.2);

    // ---- legs (behind the body), gripping the branch
    // front legs reach forward, hind legs back; elbows and knees out, hands round the branch
    const legs = [[50, 1, -1], [56, 0, -1], [124, 1, 1], [130, 0, 1]];
    for (const [lx, far, side] of legs) {
      const u = (lx - X0) / (X1 - X0), [, b] = half(u);
      const hip = [lx + sx, CY + b * 0.6 + sy];
      const fx = lx + side * (far ? 9 : 5);
      const foot = [fx, branchY(fx) - 2.2];
      const knee = [lx - side * 3 + sx * 0.5, (hip[1] + foot[1]) / 2 + 3];
      const sc = schemeAt(u), c = far ? scale(sc[1], 1.1) : sc[0];
      g.stroke([hip, knee, foot], far ? 2.8 : 3.4, c, aa);
      g.fillEllipse(foot[0], foot[1] + 1, 2.6, 2, scale(c, 0.85), aa);   // a mitten hand round the branch
      g.fillEllipse(foot[0], foot[1] + 3.2, 2, 1.1, scale(c, 0.7), aa);
    }

    // ---- tail spiral (behind the flank), banded
    const tsc = schemeAt(1);
    for (let k = TAIL.length - 1; k >= 0; k--) {
      const [x, y, w] = TAIL[k];
      g.fillCircle(x + sx, y + sy, w / 2 + 0.7, scale(tsc[1], 0.6), aa);
    }
    for (let k = TAIL.length - 1; k >= 0; k--) {
      const [x, y, w] = TAIL[k], band = k % 7 < 3;
      g.fillCircle(x + sx, y + sy, w / 2, band ? tsc[0] : scale(tsc[0], 0.8), aa);
    }

    // ---- the flank: skin, then every scale
    const ox = sx, oy = sy;
    const outline = [];
    for (let k = 0; k <= 32; k++) { const u = k / 32, [a] = half(u); outline.push([X0 + u * (X1 - X0) + ox, CY - a * br + oy]); }
    for (let k = 32; k >= 0; k--) { const u = k / 32, [, b] = half(u); outline.push([X0 + u * (X1 - X0) + ox, CY + b * br + oy]); }
    const rim = outline.map(([x, y]) => [x + (x - (X0 + X1) / 2) * 0.012, CY + oy + (y - CY - oy) * 1.07]);
    g.fillPolygon(rim, scale(schemeAt(0.5)[1], 0.6), aa);
    g.fillPolygon(outline, schemeAt(0.5)[1], aa);

    for (const sc of SCALES) {
      const x = sc.x + ox, y = CY + (sc.y - CY) * br + oy;
      const c0 = schemeAt(sc.u);
      // which digit this scale draws, if any, now
      let lit = 0, col = c0[2], grow = 1;
      const iCur = digitAt(cur, sc.x, sc.y);
      if (iCur >= 0) {
        lit = 1;
        if (cur[iCur] !== nxt[iCur]) lit = 1 - progress(s, 57.6 + 0.9 * sc.u, 57.6 + 0.9 * sc.u + 0.35);   // fade out before the turn
        if (cur[iCur] !== prv[iCur]) {                                                                    // bloom after it
          const t0 = 0.2 + 1.3 * sc.u + 0.25 * sc.n;
          const v = progress(s, t0, t0 + 0.45);
          lit = Math.min(lit, v > 0 ? 1 : 0);
          grow = v > 0 ? ease.outBack(v) : 0;
        }
      }
      // ground colour: lighter along the back, darker to the belly, a little mottling
      const shade = 1.12 - 0.32 * sc.depth + 0.12 * (noise2(sc.x * 0.08 + tod * 0.05, sc.y * 0.1, 3) - 0.5) + 0.06 * (sc.n - 0.5);
      let c = scale(c0[0], shade);
      if (lit > 0) c = mix(c, scale(col, 1.05 - 0.15 * sc.depth), lit);
      // the shimmering front of the colour wave
      const dt = s - front(sc.u);
      if (dt > -0.1 && dt < 0.2) c = mix(c, mix(0xffffff, c0[3], 0.4), 0.6 * Math.max(0, 1 - Math.abs(dt - 0.03) / 0.11));
      const rad = 1.42 * (lit > 0 && grow !== 1 ? lerp(1, grow, lit) : 1);
      g.fillCircle(x, y, Math.max(0.6, rad), c, aa);
    }

    // colon: two round tubercles
    for (const cy of COLON[1]) g.fillCircle(COLON[0] + ox, cy + oy, 1.9, scale(schemeAt(0.47)[2], 0.95), aa);

    // dorsal crest
    for (let k = 0; k < 26; k++) {
      const u = (k + 0.5) / 26, [a] = half(u), x = X0 + u * (X1 - X0) + ox, y = CY - a * br + oy;
      const h = 2.2 * (1 - u * 0.6);
      g.fillPolygon([[x - 1.6, y + 0.8], [x, y - h], [x + 1.6, y + 0.8]], schemeAt(u)[3], aa);
    }

    // ---- the head, facing left
    const hs = schemeAt(0), hx = X0 + ox, hy = CY + oy;
    // the hunt: a bug flutters in, the eye locks, the tongue snaps
    const hunt = night < 0.4 && rand(f.minuteKey, 31) < 0.8;
    const STRIKE = 27.2 + 2 * rand(f.minuteKey, 32);
    const mouth = [hx - 26, hy + 3.5];
    let bug = null, tongue = 0, jaw = 0;
    if (hunt && s > 14 && s < STRIKE + 0.45) {
      const arrive = progress(s, 14, 22);
      const hover = [16 + 5 * sin(tod * 1.3), 19 + 4 * sin(tod * 1.9)];
      bug = [lerp(-8, hover[0], ease.outCubic(arrive)) + 3 * noise(tod * 2, 1) - 1.5, lerp(-6, hover[1], ease.outCubic(arrive)) + 3 * noise(tod * 2.3, 2) - 1.5];
      if (s > STRIKE) {
        const u = s - STRIKE;
        tongue = u < 0.07 ? u / 0.07 : u < 0.12 ? 1 : 1 - ease.inCubic((u - 0.12) / 0.33);
        if (u >= 0.12) bug = [lerp(mouth[0], bug[0], tongue), lerp(mouth[1], bug[1], tongue)];
      }
    }
    const tgt = bug ?? null;
    if (s > STRIKE && s < STRIKE + 2.6 && hunt) jaw = s > STRIKE + 0.45 ? 0.8 * Math.max(0, sin((s - STRIKE - 0.45) * 9)) : 1.4;
    else if (s > STRIKE - 0.25 && s <= STRIKE && hunt) jaw = 1.4 * progress(s, STRIKE - 0.25, STRIKE - 0.05);

    const headPts = [
      [hx - 27, hy + 3], [hx - 24, hy - 3], [hx - 17, hy - 9], [hx - 8, hy - 15], [hx - 1, hy - 20], [hx + 4, hy - 17],
      [hx + 6, hy - half(0)[0] + 2], [hx + 6, hy + half(0)[1]], [hx - 6, hy + 11], [hx - 18, hy + 8 + jaw],
    ];
    g.fillPolygon(headPts, hs[0], aa);
    // casque ridge and cheek shading
    g.stroke([[hx - 17, hy - 9], [hx - 8, hy - 15], [hx - 1, hy - 20], [hx + 4, hy - 17]], 1.3, hs[3], aa);
    g.fillPolygon([[hx - 18, hy + 8 + jaw], [hx - 6, hy + 11], [hx + 6, hy + half(0)[1]], [hx + 6, hy + 4], [hx - 10, hy + 5]], scale(hs[0], 0.82), aa);
    for (let k = 0; k < 5; k++) g.fillCircle(hx - 21 + k * 4, hy + 5.6 + k * 0.5 + jaw * (1 - k / 5), 0.9, hs[3], aa);   // lip scales
    g.stroke([[hx - 27, hy + 3.2], [hx - 19, hy + 4.6 + jaw * 0.7], [hx - 11, hy + 4.2]], 0.9, scale(hs[1], 0.8), aa);
    if (jaw > 0.2) g.fillPolygon([[hx - 26.5, hy + 3.4], [hx - 19, hy + 4.4], [hx - 19, hy + 4.6 + jaw]], hex('c84a6a'), aa);

    // the turret eye
    const ex = hx - 13, ey = hy - 3.5;
    g.fillCircle(ex, ey, 5.6, scale(hs[0], 0.95), aa);
    g.ring(ex, ey, 3.6, 4.4, scale(hs[1], 1.1), aa);
    g.ring(ex, ey, 4.9, 5.6, scale(hs[1], 0.9), aa);
    const sleeping = night > 0.6;
    let look;
    if (tgt) look = [tgt[0] - ex, tgt[1] - ey];
    else look = [12 * (noise(tod * 0.23, 5) - 0.5), 9 * (noise(tod * 0.19, 6) - 0.5) + (rand(Math.floor(tod / 6), 7) < 0.3 ? 4 : 0)];
    const ll = Math.hypot(look[0], look[1]) || 1, pr = Math.min(2.1, ll * 0.25);
    const px = ex + (look[0] / ll) * pr, py = ey + (look[1] / ll) * pr;
    const blinkSlot = Math.floor(tod / 4.1), bt = tod - blinkSlot * 4.1 - rand(blinkSlot, 8) * 3.5;
    const lid = sleeping ? 1 : (bt > 0 && bt < 0.22) || (s > STRIKE + 1.5 && s < STRIKE + 1.9 && hunt) ? 1 : 0;
    if (!lid) {
      g.fillCircle(px, py, 2.1, hex('f0e070'), aa);
      g.fillCircle(px, py, 1.15, 0x101010, aa);
      g.fillCircle(px - 0.6, py - 0.6, 0.45, 0xffffff, aa);
    } else {
      g.fillCircle(ex, ey, 3.4, scale(hs[0], 0.9), aa);
      g.thickLine(ex - 2.6, ey + 0.2, ex + 2.6, ey + 0.2, 0.9, scale(hs[1], 0.9), aa);
    }
    if (sleeping) for (let k = 0; k < 3; k++) {          // z z z
      const u = ((tod * 0.35 + k / 3) % 1);
      g.text('z', ex - 3 - u * 6 + 2 * sin(u * 6 + k), ey - 9 - u * 10, { font: ctx.kit.font3x5, c: mix(0xffffff, top, u), a: 1 - u });
    }

    // ---- the tongue, then the bug
    if (tongue > 0 && bug) {
      const tx = lerp(mouth[0], bug[0], 1), ty = lerp(mouth[1], bug[1], 1);
      const ex2 = lerp(mouth[0], tx, tongue === 1 ? 1 : tongue), ey2 = lerp(mouth[1], ty, tongue === 1 ? 1 : tongue);
      g.thickLine(mouth[0] + 1, mouth[1], ex2, ey2, 2, hex('f07a9a'), aa);
      g.fillCircle(ex2, ey2, 2, hex('e04a7a'), aa);
    }
    if (bug && !(tongue > 0 && s - STRIKE > 0.12 && tongue < 0.15)) {
      const up = Math.floor(tod * 22) % 2;
      g.blit(up ? BUG_UP : BUG, bug[0] - 3, bug[1] - 1.5);
    }
  },
};
