// Jelly: the time is four moulded jellies with eyes on a kitchen table, and
// the minute turns are dessert being eaten and served.
//
// The hours are a layered jelly tower on a white cake stand: a new recipe
// each hour (rainbow, raspberry-and-cream, lime, blackcurrant...). The
// minutes are two single-flavour jellies on a plate. They are soft bodies:
// each wobbles on damped springs (a sway that grows with height, a belly
// mode, squash and stretch), and every second the table gives a tap that
// runs across it left to right, so nothing is ever still. A pendant lamp
// swings slowly over them; it sets every glint, sheen and the coloured
// light each jelly throws onto the plate, so the highlights slide as it
// moves. The jellies have eyes: they drift, blink and glance at the lamp.
//
// Minute turn: a few seconds out the jelly about to go starts to shiver and
// stares at the corner the spoon comes from. The spoon takes it in two
// wobbling bites (the cut face shows wet and light) and leaves heaped. Just
// before :00 a polished fluted copper mould comes down on the empty place;
// after :00 it lifts, the new jelly comes up stuck to it, lets go, slumps
// and rings, and only then opens its eyes. Never a wrong digit: the old one
// is gone before :00, the new one appears after it.
// Hour: from :57 the tower starts to resonate with the taps, harder and
// harder, squeezes its eyes shut and collapses into a puddle; a great
// fluted bundt mould slams down over it (everything jumps) and lifts off a new
// tower in a new recipe, stretched tall, which slumps with a huge wobble.
// The hour is unreadable for about a second.
//
// Type: ten numerals drawn for this face (jelly-glyphs.js): one heavy
// round-ended polyline each, bowls squared off as superellipses like a
// pressed mould, a flat foot clipped where every digit stands, a footed 1.
// Each is shaded as a domed section: a rim, a darker turned-away edge, a
// lit face and a glowing core offset toward the lamp, light pooling at the
// foot, a glint. All AA: everything glides by fractions of a pixel.
//
// Palette: deep teal glazed tiles and dark walnut, the complement of the
// jellies (raspberry, orange, lemon, lime, blackcurrant, cream), so the warm
// fruit colours glow off a cool, deliberately dark room; a warm pool of
// lamplight behind them, a vignette at the corners. White porcelain and
// polished copper (a salmon-to-brown ramp per flute, peach-white streaks
// placed from the lamp) are the only neutrals. At night the room goes navy-blue, the
// backlight dims through ctx.night and the lamp keeps the jellies lit.
//
// Cost: the room (wall, table, stand, plate) is drawn once a minute into a
// second canvas and copied each frame; everything else is kit shapes, no
// per-pixel callbacks.

import { Gfx, hex, mix, scale, sin, cos, clamp, lerp, progress, ease, rand, noise, clockFields, previousMinute } from '../js/kit.js';
import { GLYPHS, FACE } from './jelly-glyphs.js';

// ------------------------------------------------------------ palette
const FL = {
  rasp:   { rim: hex('4a0620'), body: hex('d81a4a'), glow: hex('ff7090'), light: hex('ff5a84') },
  orange: { rim: hex('5a1c00'), body: hex('f27010'), glow: hex('ffc055'), light: hex('ffa640') },
  lemon:  { rim: hex('583a00'), body: hex('f0bc18'), glow: hex('fff28a'), light: hex('ffe466') },
  lime:   { rim: hex('143c08'), body: hex('5ec01e'), glow: hex('c8f474'), light: hex('a4f458') },
  grape:  { rim: hex('260834'), body: hex('8a30c4'), glow: hex('d49aff'), light: hex('c080ff') },
  cream:  { rim: hex('5a3a40'), body: hex('f2d8cc'), glow: hex('fffaf2'), light: hex('fff0e0') },
  blue:   { rim: hex('0a1c4c'), body: hex('2e70e0'), glow: hex('98ccff'), light: hex('80b8ff') },
};
const MIN_FLAVOURS = ['rasp', 'orange', 'lime'];
// the hour tower: layers from the plate up, as fractions of its height
// a new recipe every hour, so the hour's unmoulding shows a new tower
const STOPS = [0, 0.27, 0.52, 0.76];
const RECIPES = [
  ['rasp', 'orange', 'lemon', 'lime'], ['grape', 'rasp', 'cream', 'rasp'], ['lime', 'cream', 'lime', 'lemon'],
  ['blue', 'grape', 'rasp', 'orange'], ['orange', 'cream', 'orange', 'lemon'], ['rasp', 'cream', 'rasp', 'cream'],
].map((r) => r.map((k, i) => [STOPS[i], k]));
const towerRim = (bands) => scale(FL[bands[0][1]].rim, 0.8);

const SILVER = { dark: hex('5a6470'), mid: hex('aeb8c4'), light: hex('eef4fa') };
const WHITE = 0xffffff;

// ------------------------------------------------------------ layout
const TABLE_Y = 47;                                          // the table's far edge
const TW = { base: 55, H: 42, W: 26, w: 9, x0: [12, 42] };   // hours: the tower on the cake stand
const PL = { base: 69, H: 32, W: 22, w: 8, x0: [95, 121] };  // minutes: two jellies on a plate
const STAND = { cx: 40, top: 55 }, PLATE = { cx: 119, cy: 70.4 };
const AA = { aa: true };

// ------------------------------------------------------------ the minute's jobs (seconds)
const SP_DUR = 1.45, SP_END = 59.15;          // the spoon eats one digit in SP_DUR, done by SP_END
const MD0 = 59.25, MD1 = 59.9;                // moulds come down over the empty places
const LIFT0 = 0.3, LIFT1 = 1.25, RISE = 95;   // and lift after :00
const SMAX = 0.24;                            // how far a new jelly stretches before it lets go
// the hour
const RES0 = 57.7, COL0 = 59.45, COL1 = 59.8;   // the tower shakes itself to bits, then slumps
const GM0 = 59.5, GM1 = 59.9;                   // the great mould comes down
const GL0 = 0.1, GL1 = 1.1, GRISE = 118, GSMAX = 0.3;

/** A damped ring started at t0: amp * e^(-d/tau) * sin(w d). */
function ring(t, t0, amp, w, tau) {
  const d = t - t0;
  if (d <= 0 || d > 4 * tau) return 0;
  return amp * Math.exp(-d / tau) * sin(w * d);
}

/** Flavour of minute slot i (2 tens, 3 units) for this minute. Tens keep theirs for ten minutes. */
function minuteFlavours(f) {
  const tensKey = f.minuteKey - (f.m % 10);
  const a = Math.floor(rand(tensKey, 7) * 3);
  const b = (a + 1 + Math.floor(rand(f.minuteKey, 9) * 2)) % 3;
  return [FL[MIN_FLAVOURS[a]], FL[MIN_FLAVOURS[b]]];
}

// ------------------------------------------------------------ the jelly itself

/** The deformed centre line of digit d standing on `base`, and where its eyes sit. def: sway (top, px), sway2 (belly), st (stretch), spread. */
function shapeOf(d, x0, base, W, H, w, def) {
  const G = GLYPHS[d], cx = x0 + W / 2, sy = 1 + def.st, sx = 1 - 0.55 * def.st;
  const span = H - w + 1, foot = w / 2 - 1, inner = W - w;
  const at = (u, v) => {
    const hgt = (1 - v) * span + foot, h = hgt / H;
    const lx = w / 2 + u * inner - W / 2;
    return [cx + lx * sx * (1 + def.spread * (1 - h)) + def.sway * h * (0.35 + 0.65 * h) + def.sway2 * sin(Math.PI * h),
      base - hgt * sy];
  };
  const pts = new Array(G.length);
  for (let k = 0; k < G.length; k++) pts[k] = at(G[k][0], G[k][1]);
  const F = FACE[d];
  return { pts, face: at(F[0], F[1]), sep: F[2] * w * 0.3 };
}

/**
 * Where a glint sits: the part of the centre line facing the lamp (dx, dy is
 * the unit direction from the lamp to the jelly). A soft arg-min, so the
 * glint slides along the shape as the lamp swings instead of hopping.
 */
function lit(pts, dx, dy) {
  let vmin = Infinity;
  for (let k = 0; k < pts.length; k++) { const v = pts[k][0] * dx + pts[k][1] * dy; if (v < vmin) vmin = v; }
  let sx = 0, sy = 0, sw = 0;
  for (let k = 0; k < pts.length; k++) {
    const e = 1 - (pts[k][0] * dx + pts[k][1] * dy - vmin) / 2.5;
    if (e <= 0) continue;
    const wgt = e * e;
    sx += pts[k][0] * wgt; sy += pts[k][1] * wgt; sw += wgt;
  }
  return [sx / sw, sy / sw];
}

function shifted(pts, dx, dy) {
  const out = new Array(pts.length);
  for (let k = 0; k < pts.length; k++) out[k] = [pts[k][0] + dx, pts[k][1] + dy];
  return out;
}

/**
 * One jelly's layers, inside whatever clip is set: a dark rim, the body
 * (per layer if banded), a raised glowing ridge down the middle (the
 * moulded dome), light pooling at the foot, a sheen and a glint.
 */
function jellyLayers(g, J, light) {
  const { pts, w, fl, bands, base, top, lx, ly } = J;
  const L = (c) => scale(c, light);
  g.stroke(pts, w + 1.7, L(bands ? towerRim(bands) : fl.rim), AA);
  // a domed section: darker where it turns away from the lamp, a lit face, a glowing core
  const face = shifted(pts, -lx * w * 0.13, -ly * w * 0.13), core = shifted(pts, -lx * w * 0.2, -ly * w * 0.2);
  const layer = (f) => {
    g.stroke(pts, w, L(mix(f.body, f.rim, 0.35)), AA);
    g.stroke(face, w - 2.4, L(f.body), AA);
    g.stroke(core, w * 0.3, L(f.glow), { aa: true, a: 0.8 });
  };
  if (!bands) layer(fl);
  else {
    const hgt = base - top;
    for (let b = 0; b < bands.length; b++) {
      const y1 = base - bands[b][0] * hgt, y0 = b + 1 < bands.length ? base - bands[b + 1][0] * hgt : top - 6;
      const r0 = Math.round(y0), r1 = Math.round(y1);
      g.clip(0, r0, 160, r1 - r0);
      layer(FL[bands[b][1]]);
      g.unclip();
      if (b > 0) {   // where two layers meet, a bright meniscus
        g.clip(0, r1 - 1, 160, 1);
        g.stroke(pts, w - 1, L(WHITE), { aa: true, a: 0.28 });
        g.unclip();
      }
    }
  }
  const foot = bands ? FL[bands[0][1]] : fl;
  g.clip(0, base - 3, 160, 3);
  g.stroke(pts, w - 2, L(foot.glow), { aa: true, a: 0.5 });
  g.unclip();
  g.stroke(shifted(pts, -lx * w * 0.3, -ly * w * 0.3), 1, WHITE, { aa: true, a: 0.22 * light });
  const p = J.glint;
  g.fillEllipse(p[0] - lx * w * 0.22, p[1] - ly * w * 0.22, 1.8, 1.15, WHITE, { aa: true, a: 0.92 * light });
}

/** Draw a jelly, whole or bitten (cut: per-column top, world y). */
function drawJelly(g, J, light) {
  const y0 = J.hide > 0 ? Math.round(J.hide) : 0;
  if (y0 >= J.base) return;
  g.clip(0, y0, 160, J.base - y0);
  if (!J.cut) jellyLayers(g, J, light);
  else {
    const x0 = Math.floor(J.x0 - J.w), x1 = Math.ceil(J.x0 + J.W + J.w);
    for (let x = x0; x < x1; x++) {
      const c = Math.round(J.cut(x + 0.5));
      if (c >= J.base) continue;
      g.clip(x, c, 1, J.base - c);
      jellyLayers(g, J, light);
      // the freshly cut face is wet and lighter
      g.clip(x, c, 1, 2);
      g.stroke(J.pts, J.w + 1.7, scale(J.bands ? FL[J.bands[2][1]].glow : J.fl.glow, light), { aa: true, a: 0.6 });
      g.unclip();
      g.unclip();
    }
  }
  g.unclip();
}

/** Light thrown through a jelly onto the surface in front of it, away from the lamp. */
function caustic(g, J, surfY, ky, light) {
  const { pts, base } = J, kx = J.lx * 0.45;
  const proj = new Array(pts.length);
  for (let k = 0; k < pts.length; k++) {
    const hh = base - pts[k][1];
    proj[k] = [pts[k][0] + hh * kx, surfY + hh * ky];
  }
  const c = J.bands ? FL[J.bands[1][1]].light : J.fl.light;
  g.stroke(proj, J.w * 1.3, c, { aa: true, a: 0.16 * light });
  g.stroke(proj, J.w * 0.5, mix(c, WHITE, 0.25), { aa: true, a: 0.3 * light });
  const p = J.glint, hh = base - p[1];
  g.fillEllipse(p[0] + hh * kx, surfY + hh * ky, 2.6, 1, mix(c, WHITE, 0.6), { aa: true, a: 0.7 * light });
}

// ------------------------------------------------------------ faces

/**
 * Two eyes on the jelly, riding its wobble. They drift about, blink, glance
 * at the lamp, stare at the spoon when it comes, open only once a new jelly
 * has settled, and squeeze shut when the tower shakes itself apart.
 */
function eyes(g, J, s, tod, sp, LX, LY, hourOut, hourIn, light) {
  const [fx, fy] = J.face;
  if (J.cut && J.cut(fx) > fy - 1.5) return;               // bitten off
  if (J.top > fy + 2 || (J.hide && fy < J.hide + 1)) return;
  let tx = fx + 30 * (J.slot < 2 ? 1 : -1) * (noise(tod * 0.23, J.slot * 7) - 0.4), ty = fy - 6 + 14 * noise(tod * 0.31, J.slot * 7 + 3);
  if (noise(tod * 0.11, J.slot) > 0.68) { tx = LX; ty = LY; }
  let size = 1, open = 1;
  if (J.doomed > 0.2) { tx = J.x0 + 50; ty = -20; size = 1 + 0.2 * J.doomed; }   // where the spoon comes from
  if (sp) {
    tx = sp.p[0]; ty = sp.p[1];
    const d = Math.abs(sp.cx - (J.x0 + J.W / 2));
    if (d < 4) size = 1.25;
  }
  // blink: one in each 3.1 s slot, somewhere in it
  const slot = Math.floor((tod + J.slot * 0.9) / 3.1), bt = tod + J.slot * 0.9 - slot * 3.1 - rand(slot, J.slot, 5) * 2.8;
  if (bt > 0 && bt < 0.13) open = 0;
  // a new jelly keeps them shut until it has slumped, then pops them open
  if (J.born !== undefined) open = Math.min(open, progress(s, J.born, J.born + 0.12));
  if (hourOut && J.tower && s > COL0 - 0.6) open = 0;
  const dx = tx - fx, dy = ty - fy, n = Math.hypot(dx, dy) || 1, gx = (dx / n) * 0.6, gy = (dy / n) * 0.55;
  const rim = J.bands ? towerRim(J.bands) : J.fl.rim;
  for (const sd of [-1, 1]) {
    const ex = fx + sd * J.sep, ey = fy;
    if (open < 0.25) { g.thickLine(ex - 1.3, ey + 0.3, ex + 1.3, ey + 0.3, 0.9, scale(rim, light), AA); continue; }
    g.fillEllipse(ex, ey, 1.45 * size, 1.8 * size * open, scale(hex('fff8f0'), light), AA);
    g.fillCircle(ex + gx * size, ey + gy * size * open, 0.9 * size, hex('1a0810'), AA);
  }
}

// ------------------------------------------------------------ props

/** Where the spoon is in its job, and how much jelly it holds. */
function spoonPose({ tau, cx, top, base, H, fl }) {
  const E = [cx + 46, -16], A = [cx + 1, top - 1], Bp = [cx - 1, top + 0.42 * H - 2], C = [cx + 1, top + 0.33 * H], D = [cx, base - 4], X = [cx + 52, -24];
  const seg = (P, Q, u) => [lerp(P[0], Q[0], u), lerp(P[1], Q[1], u)];
  let p, blob;
  if (tau < 0.35) { p = seg(E, A, ease.outCubic(tau / 0.35)); blob = 0; }
  else if (tau < 0.6) { const u = ease.inOutQuad((tau - 0.35) / 0.25); p = seg(A, Bp, u); blob = u; }
  else if (tau < 0.8) { p = seg(Bp, C, ease.inOutQuad((tau - 0.6) / 0.2)); blob = 1; }
  else if (tau < 1.05) { const u = ease.inOutQuad((tau - 0.8) / 0.25); p = seg(C, D, u); blob = 1 + u; }
  else { p = seg(D, X, ease.inCubic((tau - 1.05) / 0.4)); blob = 2; }
  return { p, blob, fl, cx };
}

/** A silver teaspoon, bowl at (bx, by), handle off up and to the right; `blob` jelly in the bowl. */
function spoon(g, bx, by, blob, fl, light, tod) {
  const L = (c) => scale(c, light);
  const hx = bx + 5, hy = by - 1.5, ex = hx + 30, ey = hy - 34;
  g.thickLine(hx, hy, ex, ey, 2.6, L(SILVER.dark), AA);
  g.thickLine(hx - 0.5, hy - 0.4, ex - 0.5, ey - 0.4, 1.1, L(SILVER.light), { aa: true, a: 0.8 });
  g.fillEllipse(bx, by, 6.6, 3.4, L(SILVER.dark), AA);
  g.fillEllipse(bx - 0.3, by - 0.5, 5.8, 2.6, L(SILVER.mid), AA);
  g.fillEllipse(bx - 2.2, by - 1.1, 2, 0.8, L(SILVER.light), { aa: true, a: 0.9 });
  if (blob > 0.02) {
    const wob = 0.35 * sin(tod * 19), r = Math.min(1, blob);
    const rx = 3 + 2.4 * r + 0.6 * Math.max(0, blob - 1), ry = 1.6 + 1.8 * blob;
    const cy = by - 1 - ry * 0.7;
    g.fillEllipse(bx + wob * 0.5, cy, rx * (1 - wob * 0.08), ry * (1 + wob * 0.08), L(fl.rim), AA);
    g.fillEllipse(bx + wob * 0.5, cy + 0.2, rx - 0.9, ry - 0.8, L(fl.body), AA);
    g.fillEllipse(bx + wob * 0.6 - 0.4, cy - 0.2, (rx - 0.9) * 0.5, (ry - 0.8) * 0.5, L(fl.glow), { aa: true, a: 0.8 });
    g.fillEllipse(bx - rx * 0.45 + wob, cy - ry * 0.5, 1.3, 0.8, WHITE, { aa: true, a: 0.9 * light });
  }
}

/**
 * A polished copper jelly mould: a fluted bundt dome, rim on y = rimY, seen
 * from the side. It is a body of revolution: radius r(h) from the wide base
 * up round the shoulders to a flat top, cut into `n` fat lobes round its
 * front half. A lobe's edges are meridians, x = cx + r(h) sin(theta), so
 * they curve in over the shoulders like the real thing. Each lobe is shaded
 * as a little cylinder of polished metal: dark brown edges, a copper body,
 * a salmon band and a sharp peach-white streak where its surface turns the
 * lamp toward the viewer. The streak is placed from the lamp's position, so
 * it slides as the lamp swings. Then a dark outline, a reflected warm edge
 * on the shadow side, a rolled flange, a flat top and a ring handle.
 */
const CU = { dark: hex('2a0c04'), brown: hex('6e2a10'), mid: hex('c45a2c'), salmon: hex('ff9a6c'), peach: hex('fff0e2'), bounce: hex('ff8a5a') };
const MH = [0, 0.16, 0.34, 0.5, 0.64, 0.76, 0.86, 0.94, 1];           // sample heights, 0 rim .. 1 top
const MR = MH.map((h) => 0.4 + 0.6 * Math.sqrt(Math.max(0, 1 - Math.pow(h, 2.2))) + 0.1 * (1 - h) ** 4);   // radius / R: flared base, round shoulders
const MTOP = MR[MR.length - 1], SHOULDER = 4;                              // MH index where the shoulder starts

function mould(g, cx, rimY, Wm, Hm, n, light, LX, ring) {
  const L = (c) => scale(c, light), R = Wm / 2 / 1.1, nh = MH.length;
  const lh = clamp((LX - cx) / 70, -1, 1);          // where the lamp is, left (-1) to right (+1)
  const thL = 1.1 * lh, thS = 0.5 * thL;            // light direction; the normal that mirrors it to us
  const merid = (th, dx, k0, k1, out) => {          // one meridian between two sample heights
    const sn = sin(th);
    for (let k = k0; k <= k1; k++) out.push([cx + (R * MR[k] + dx) * sn, rimY - MH[k] * Hm]);
    return out;
  };
  const band = (ta, tb, k0 = 0, k1 = nh - 1) => {   // a patch of the surface between two angles and two heights
    const pts = merid(ta, 0, k0, k1, []), right = merid(tb, 0, k0, k1, []);
    for (let k = right.length - 1; k >= 0; k--) pts.push(right[k]);
    return pts;
  };
  // outline: the silhouette a touch larger, near-black copper
  const sil = merid(-Math.PI / 2, 0.9, 0, nh - 1, []), rs = merid(Math.PI / 2, 0.9, 0, nh - 1, []);
  for (let k = nh - 1; k >= 0; k--) sil.push(rs[k]);
  g.fillPolygon(sil, L(CU.dark), AA);
  const dth = Math.PI / n, K = 2.4;                 // each lobe bulges: its normal sweeps K times its span
  for (let j = 0; j < n; j++) {
    const ta = -Math.PI / 2 + j * dth, tc = ta + dth / 2;
    const lam = 0.5 + 0.5 * cos(tc - thL);
    const at = (u) => ta + u * dth;
    const u = clamp(0.5 + (thS - tc) / (K * dth), 0.25, 0.75), e = Math.max(0.45, 1 - Math.abs(thS - tc) / 1.6);
    const sd = u < 0.5 ? 1 : 0;                      // the lobe's far side from the lamp is the dark one
    g.fillPolygon(band(at(0.03), at(0.97)), L(mix(CU.dark, CU.brown, 0.4 + 0.6 * lam)), AA);
    g.fillPolygon(band(at(sd ? 0.03 : 0.3), at(sd ? 0.7 : 0.97)), L(mix(CU.brown, CU.mid, lam)), AA);
    g.fillPolygon(band(at(u - 0.2), at(u + 0.2)), L(mix(CU.mid, CU.salmon, 0.35 + 0.65 * lam)), AA);
    // the shoulder faces up into the lamp: a broad warm sheen across it
    g.fillPolygon(band(at(0.08), at(0.92), SHOULDER, nh - 2), L(CU.salmon), { aa: true, a: 0.3 + 0.25 * lam });
    const st = merid(at(u), 0, 0, nh - 2, []);
    st[0] = [st[0][0], st[0][1] - 2.5];
    g.stroke(st, 1, L(CU.peach), { aa: true, a: e });
  }
  // reflected warm light up the shadow side
  const sh = merid(lh < 0 ? Math.PI / 2 - 0.14 : -Math.PI / 2 + 0.14, -0.3, 0, nh - 2, []);
  g.stroke(sh, 1, L(CU.bounce), { aa: true, a: 0.55 });
  // flat top and a tab (a ring handle on the big one)
  const tr = R * MTOP, ty = rimY - Hm;
  g.fillEllipse(cx, ty + 0.6, tr + 0.6, 1.6, L(CU.dark), AA);
  g.fillEllipse(cx, ty + 0.4, tr - 0.3, 1.0, L(CU.salmon), AA);
  if (ring) {
    const hr = 3.2;
    g.fillRoundRect(cx - 1.6, ty - 2.4, 3.2, 3, 0.8, L(CU.brown), AA);
    g.ring(cx, ty - 2 - hr, hr - 1.2, hr + 0.3, L(CU.dark), AA);
    g.ring(cx, ty - 2 - hr, hr - 0.9, hr, L(CU.mid), AA);
    g.arc(cx, ty - 2 - hr, hr - 0.8, hr - 0.1, -1.9 + lh * 0.5, -0.7 + lh * 0.5, L(CU.peach), { aa: true, a: 0.9 });
  } else {
    g.fillRoundRect(cx - tr * 0.8, ty - 2.6, tr * 1.6, 3, 1, L(CU.dark), AA);
    g.fillRoundRect(cx - tr * 0.8 + 0.4, ty - 2.4, tr * 1.6 - 0.8, 2, 0.8, L(CU.mid), AA);
    g.fillRect(Math.round(cx - tr * 0.5 + lh * 2), Math.round(ty - 2.2), 2, 1, L(CU.peach));
  }
  // the rolled flange: dark rim line under, a bright lip on top
  const fw = R * MR[0];
  g.fillRoundRect(cx - fw - 1.6, rimY - 3.2, 2 * fw + 3.2, 3.8, 1.9, L(CU.dark), AA);
  g.fillRoundRect(cx - fw - 1.2, rimY - 3, 2 * fw + 2.4, 2.8, 1.4, L(CU.mid), AA);
  g.fillRoundRect(cx - fw - 0.6 + (lh + 1) * fw * 0.4, rimY - 2.7, fw, 1, 0.5, L(CU.peach), { aa: true, a: 0.9 });
  g.fillRect(Math.round(cx - fw - 1), Math.round(rimY), Math.round(2 * fw + 2), 1, L(CU.dark), { a: 0.7 });
}

// ------------------------------------------------------------ the room (cached per minute)

const SKY = [ // hour, wall top, wall low, light (sun patch colour, strength)
  [0, '0a1a2c', '15283a', 0], [6, '0c1e30', '182c3c', 0], [7.5, '12333c', '22474e', 0.7], [12, '163c44', '28525a', 1],
  [17, '153840', '264a50', 0.9], [19, '102632', '1c3540', 0.3], [20.5, '0a1a2c', '15283a', 0], [24, '0a1a2c', '15283a', 0],
].map(([h, a, b, l]) => [h, hex(a), hex(b), l]);

function keyed(h) {
  let k = 1;
  while (SKY[k][0] < h) k++;
  const a = SKY[k - 1], b = SKY[k], u = (h - a[0]) / (b[0] - a[0]);
  return { top: mix(a[1], b[1], u), low: mix(a[2], b[2], u), sun: a[3] + (b[3] - a[3]) * u };
}

const BG = { key: -1, c: null, room: null };
function room(f) {
  if (BG.key === f.minuteKey) return BG;
  const hour = f.h + f.m / 60, R = keyed(hour);
  const c = new Gfx(160, 80);
  // the wall: deep teal glazed tiles, a warm pool of lamplight, darker toward the corners
  const LAMP = hex('7a5a3c'), lampPool = 0.42 + 0.3 * (1 - R.sun);
  c.coarse((x, y) => {
    let col = mix(R.top, R.low, y / TABLE_Y);
    const dl = ((x - LAMP_X) * (x - LAMP_X)) / 2400 + ((y - 6) * (y - 6)) / 1400;
    col = mix(col, LAMP, lampPool * Math.max(0, 1 - dl));
    const vig = Math.max(0, (Math.abs(x - 80) - 46) / 34);
    return mix(col, 0x000000, 0.4 * vig);
  }, { cell: 4, box: [0, 0, 160, TABLE_Y] });
  for (let y = 5; y < TABLE_Y - 2; y += 6) {
    c.fillRect(0, y, 160, 1, 0x000000, { a: 0.18 });
    c.fillRect(0, y + 1, 160, 1, WHITE, { a: 0.04 });
    for (let x = ((y / 6) & 1) * 6; x < 160; x += 12) c.fillRect(x, y - 5, 1, 5, 0x000000, { a: 0.14 });
  }
  // the table: dark walnut, lighter and glossier toward us, the lamp's reflection in it
  const W0 = hex('24120a'), W1 = hex('5a321c'), GLOSS = hex('a07050');
  c.coarse((x, y) => {
    const u = (y - TABLE_Y) / (80 - TABLE_Y);
    let col = mix(W0, W1, u);
    const g1 = Math.max(0, 1 - Math.abs(x - LAMP_X) / 34) * Math.max(0, 1 - Math.abs(u - 0.35) / 0.35);
    col = mix(col, GLOSS, 0.3 * g1);
    return col;
  }, { cell: 4, box: [0, TABLE_Y, 160, 80 - TABLE_Y] });
  for (let k = -6; k <= 18; k++) {   // grain, converging on the far edge
    const xb = k * 10 + 3, xf = 80 + (xb - 80) * 1.9;
    c.thickLine(xb, TABLE_Y + 1, xf, 81, 0.6, 0x000000, { aa: true, a: 0.16 });
  }
  c.fillRect(0, TABLE_Y, 160, 1, mix(W1, GLOSS, 0.5));
  c.gradient(0, TABLE_Y - 3, 160, 3, [[0, mix(R.low, 0, 0.0)], [1, mix(R.low, 0, 0.45)]]);
  // the cake stand: white porcelain, a scalloped edge
  const POR = hex('eef0ee'), POR_D = hex('9aa2a6'), POR_M = hex('cfd5d6');
  const sc = STAND.cx;
  c.fillEllipse(sc - 3, 74, 18, 2.6, 0x000000, { aa: true, a: 0.4 });
  c.fillEllipse(sc, 72, 12.5, 2.3, POR_D, AA);
  c.fillEllipse(sc, 71.2, 12, 1.9, POR_M, AA);
  c.fillPolygon([[sc - 3.6, 58], [sc + 3.6, 58], [sc + 2.2, 63], [sc + 4.6, 70.6], [sc - 4.6, 70.6], [sc - 2.2, 63]], POR_M, AA);
  c.fillPolygon([[sc + 0.6, 58], [sc + 3.6, 58], [sc + 2.2, 63], [sc + 4.6, 70.6], [sc + 1.4, 70.6], [sc + 0.6, 63]], POR, AA);
  c.fillRect(sc - 4, 63, 8, 1, POR_D);
  c.fillRoundRect(sc - 33, STAND.top + 1.2, 66, 3, 1.5, POR_D, AA);
  for (let x = sc - 32; x <= sc + 32; x += 4) c.fillCircle(x, STAND.top + 3.8, 1.5, POR_M, AA);
  c.fillRoundRect(sc - 34, STAND.top - 0.6, 68, 2.8, 1.4, POR, AA);
  c.fillRect(sc - 32, STAND.top + 1, 64, 1, hex('e06a8a'));
  // the plate: white porcelain with a blue line
  const { cx: px, cy: py } = PLATE;
  c.fillEllipse(px + 3, py + 4, 38, 4.4, 0x000000, { aa: true, a: 0.4 });
  c.fillEllipse(px, py + 1.4, 37, 5.2, hex('7c8890'), AA);
  c.fillEllipse(px, py, 37, 5.2, hex('e9eef0'), AA);
  c.fillEllipse(px, py, 35.4, 4.5, hex('3a64a8'), AA);
  c.fillEllipse(px, py, 34.6, 4.0, hex('e4eaec'), AA);
  c.fillEllipse(px, py + 0.4, 26, 2.9, hex('cdd5da'), AA);
  c.fillEllipse(px - 14, py - 2.8, 9, 0.7, WHITE, { aa: true, a: 0.7 });
  BG.key = f.minuteKey; BG.c = c; BG.room = R;
  return BG;
}

// ------------------------------------------------------------ motion

const W_TAP = 2 * Math.PI * 3.4, TAU_TAP = 0.6;     // a jelly's own wobble
const W_RES = 2 * Math.PI * 2.6;                     // the tower's, when it resonates

/** The table's heartbeat: a tap every second, running across the table left to right. */
function taps(def, tod, i, amp) {
  const dl = i * 0.07, n0 = Math.floor(tod - dl);
  for (let j = 0; j < 3; j++) {
    const n = n0 - j, t0 = n + dl, a = amp * (0.75 + 0.5 * rand(n, 3)) * (n & 1 ? 1 : -1);
    def.sway += ring(tod, t0, a, W_TAP, TAU_TAP);
    def.st += ring(tod, t0, -0.03 * Math.abs(a) / amp, W_TAP * 1.7, 0.3);
  }
}

/** A new jelly let go by its mould: stretched tall, then slumping and ringing. */
function slump(def, s, tr, smax, tau, w, swayAmp, sign) {
  const d = s - tr;
  if (d < 0) return;
  def.st += smax * Math.exp(-d / tau) * cos(w * d);
  def.sway += ring(s, tr, swayAmp * sign, w * 0.9, tau * 1.2);
  def.sway2 += ring(s, tr + 0.08, -0.4 * swayAmp * sign, w * 1.6, tau * 0.7);
}

const easeLift = (u) => u * u * u;
const LAMP_X = 80, LAMP_CORD = 13;

/** The pendant lamp: an enamel shade on a cord from above, a warm bulb under it. */
function lamp(g, bx, by, swing, light) {
  const c = cos(swing), sn = sin(swing);
  const R = (x, y) => [bx + x * c - y * sn, by - 3 + x * sn + y * c];
  const top = R(0, -4);
  g.thickLine(LAMP_X, -1, top[0], top[1], 0.8, hex('1a1410'), AA);
  for (const [r, a] of [[14, 0.06], [9, 0.08], [5, 0.12]]) g.fillCircle(bx, by + 1, r, hex('ffd28a'), { aa: true, a: a * light });
  g.fillPolygon([R(-2, -4.5), R(2, -4.5), R(7, 2), R(-7, 2)], hex('1e4a3c'), AA);
  g.fillPolygon([R(-1.4, -4), R(0.2, -4), R(-3, 1.4), R(-5.6, 1.4)], hex('3f7a62'), { aa: true, a: 0.8 });
  g.fillEllipse(R(0, 2.2)[0], R(0, 2.2)[1], 6.5, 1.2, hex('ffe9b8'), AA);
  g.fillCircle(R(0, 2.6)[0], R(0, 2.6)[1], 1.6, hex('fffbe8'), AA);
}

export default {
  name: 'Jelly',
  blurb: 'Glossy moulded jelly numerals wobble on a cake stand and a plate; a spoon eats each old digit and a copper mould turns out the new one.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, tod = f.h * 3600 + f.m * 60 + s;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    const light = 1;
    const B = room(f);
    g.draw(B.c, 0, 0);

    const cur = f.hh + f.mm;
    const nf = clockFields(new Date(ctx.date.getTime() + 60000)), nxt = nf.hh + nf.mm;
    const pf = previousMinute(ctx.date), prv = pf.hh + pf.mm;
    const hourOut = cur.slice(0, 2) !== nxt.slice(0, 2), hourIn = cur.slice(0, 2) !== prv.slice(0, 2);
    const mfl = minuteFlavours(f);

    // thumps everyone feels: the moulds landing either side of :00
    const thump = (def, i) => {
      def.sway += ring(s, -0.1, (hourIn ? 3.2 : 0.9) * (i & 1 ? 1 : -1), W_TAP, TAU_TAP);
      def.st += ring(s, -0.1, hourIn ? -0.09 : -0.03, W_TAP * 1.7, 0.35);
      def.sway += ring(s, MD1, (hourOut ? 3.2 : 0.9) * (i & 1 ? -1 : 1), W_TAP, TAU_TAP);
    };

    // the pendant lamp, swinging a little: it sets every glint, sheen and caustic
    const swing = 0.14 * sin(tod * 1.9) + 0.04 * sin(tod * 0.73 + 1);
    const LX = LAMP_X + LAMP_CORD * sin(swing), LY = -6 + LAMP_CORD * cos(swing) + 3;
    const jellies = [], moulds = [];
    let spoonAt = null;

    // ---- the hour tower
    for (let i = 0; i < 2; i++) {
      const def = { sway: 0, sway2: 0, st: 0, spread: 0 };
      taps(def, tod, i, 1.3);
      thump(def, i);
      if (hourOut && s > RES0) {
        const A = 1 + 6 * ease.inQuad(progress(s, RES0, COL0)), ph = W_RES * (s - RES0) + i * 0.7;
        def.sway += A * sin(ph);
        def.st += 0.008 * A * sin(2 * ph);
        if (s > COL0) {
          const c = ease.inQuad(progress(s, COL0, COL1));
          def.sway *= 1 - c;
          def.st = lerp(def.st, -0.86, c);
          def.spread = 1.1 * c;
        }
      }
      let born;
      if (hourIn && s < 8) {
        const tr = GL0 + (GL1 - GL0) * Math.cbrt(GSMAX * TW.H / GRISE);
        if (s < tr) def.st += Math.min(GSMAX, GRISE * easeLift(progress(s, GL0, GL1)) / TW.H);
        else slump(def, s, tr, GSMAX, 0.9, 2 * Math.PI * 2.1, 5.5, i ? 1 : -1);
        born = tr + 1.1 + i * 0.25;
      }
      const { pts, face, sep } = shapeOf(+cur[i], TW.x0[i], TW.base, TW.W, TW.H, TW.w, def);
      jellies.push({ pts, face, sep, slot: i, def, born, hide: 0, w: TW.w, fl: null, bands: RECIPES[f.h % RECIPES.length], base: TW.base, top: TW.base - TW.H * (1 + def.st), x0: TW.x0[i], W: TW.W, cut: null, tower: true });
    }
    if (hourOut && s > GM0) moulds.push([STAND.cx, TW.base + 1 - (1 - ease.inQuad(progress(s, GM0, GM1))) * GRISE, 66, 48, 6]);
    if (hourIn && s < GL1) moulds.push([STAND.cx, TW.base + 1 - GRISE * easeLift(progress(s, GL0, GL1)), 64, 50, 11]);
    if (moulds.length) for (const J of jellies) J.hide = moulds[0][1] - 1;   // inside the mould: hidden

    // ---- the minutes on the plate
    const eat = [3, 2].filter((i) => cur[i] !== nxt[i]);
    for (let i = 2; i < 4; i++) {
      const x0 = PL.x0[i - 2], fl = mfl[i - 2], cx = x0 + PL.W / 2, top = PL.base - PL.H;
      const def = { sway: 0, sway2: 0, st: 0, spread: 0 };
      taps(def, tod, i, 1.1);
      thump(def, i);
      let cut = null, gone = false, doomed = 0;
      const k = eat.indexOf(i);
      if (k >= 0) {
        const T = SP_END - SP_DUR * (eat.length - k), tau = s - T;
        // it knows: a shiver from a few seconds out
        const dread = progress(s, T - 6, T - 1);
        def.sway += 0.45 * dread * sin(tod * 47 + i);
        doomed = dread;
        if (tau >= 1.05) gone = true;
        else if (tau > 0.35) {
          const c1 = ease.inOutQuad(progress(tau, 0.35, 0.6)), c2 = ease.inOutQuad(progress(tau, 0.8, 1.05));
          const H = PL.H, base = PL.base;
          cut = (x) => {
            const q = (x - cx) / (PL.W / 2 + 2), q2 = q * q;
            const y1 = top - 3 + c1 * (0.5 * H + 3) - 0.22 * H * c1 * q2;
            const y2 = c2 > 0 ? lerp(top + 0.3 * H, base + 0.45 * H, c2) - 0.3 * H * c2 * q2 : -99;
            return y1 > y2 ? y1 : y2;
          };
          def.sway += ring(tau, 0.45, 1.6, W_TAP, 0.5) + ring(tau, 0.92, -1.4, W_TAP, 0.5);
          def.st += ring(tau, 0.42, -0.06, W_TAP * 1.7, 0.3) + ring(tau, 0.9, -0.06, W_TAP * 1.7, 0.3);
        }
        if (tau >= 0 && tau < SP_DUR) spoonAt = { tau, cx, top, base: PL.base, H: PL.H, fl };
        if (s > MD0) moulds.push([cx, PL.base + 1 - (1 - ease.inQuad(progress(s, MD0, MD1))) * RISE, PL.W + 4, PL.H + 4, 3]);
      }
      let born, hide = 0;
      if (cur[i] !== prv[i] && s < 6) {
        const tr = LIFT0 + (LIFT1 - LIFT0) * Math.cbrt(SMAX * PL.H / RISE);
        if (s < tr) def.st += Math.min(SMAX, RISE * easeLift(progress(s, LIFT0, LIFT1)) / PL.H);
        else slump(def, s, tr, SMAX, 0.5, 2 * Math.PI * 3, 2.2, rand(f.minuteKey, i) < 0.5 ? -1 : 1);
        born = tr + 0.7;
        if (s < LIFT1) {
          const rim = PL.base + 1 - RISE * easeLift(progress(s, LIFT0, LIFT1));
          moulds.push([cx, rim, PL.W + 4, PL.H + 4, 3]);
          hide = rim - 1;
        }
      }
      if (gone) continue;
      const { pts, face, sep } = shapeOf(+cur[i], x0, PL.base, PL.W, PL.H, PL.w, def);
      jellies.push({ pts, face, sep, slot: i, def, born, hide, doomed, w: PL.w, fl, bands: null, base: PL.base, top: PL.base - PL.H * (1 + def.st), x0, W: PL.W, cut, tower: false });
    }

    // ---- draw: light through the jellies, their shadows, the jellies, the moulds, the spoon
    const sp = spoonAt && spoonPose(spoonAt);
    lamp(g, LX, LY, swing, light);
    for (const J of jellies) {
      const dx = J.x0 + J.W / 2 - LX, dy = (J.base + J.top) / 2 - LY, n = Math.hypot(dx, dy);
      J.lx = dx / n; J.ly = dy / n;
      J.glint = lit(J.pts, J.lx, J.ly);
      if (J.tower) caustic(g, J, 76, 0.07, light);
      else caustic(g, J, J.base + 1, 0.13, light);
    }
    for (const J of jellies) g.fillEllipse(J.x0 + J.W / 2 + J.lx * 3, J.base - 0.3, J.W / 2 + 1, 1.4, 0x000000, { aa: true, a: 0.3 });
    for (const J of jellies) {
      drawJelly(g, J, light);
      eyes(g, J, s, tod, sp, LX, LY, hourOut, hourIn, light);
    }
    for (const [cx, rimY, Wm, Hm, n] of moulds) if (rimY > -2) mould(g, cx, rimY, Wm, Hm, n, light, LX, n > 4);
    if (sp) spoon(g, sp.p[0], sp.p[1], sp.blob, sp.fl, light, tod);
  },
};
