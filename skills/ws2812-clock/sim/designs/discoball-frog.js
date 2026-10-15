// Discoball: the rainbow frog in round glasses, dancing on the floor.
// Built from anti-aliased capsules and ellipses so every limb glides.
import * as kit from '../js/kit.js';
import { H } from './discoball-raster.js';
import { capsule, ellipse, flat } from './discoball-shapes.js';

const lutGlass = new Float32Array(3 * H), lutWhite = new Float32Array(3 * H), lutDark = new Float32Array(3 * H);
const GLASS = kit.hex('#ffcf6a'), WHITE = [0.85, 0.85, 0.8], DARK = [0, 0, 0];

const S = 1.05, OUT = 0.75;
let CX = 0, FYL = 0;
// local frog units -> canvas, with a dark cartoon outline under every part
function cap(ax, ay, bx, by, r, lut, a = 1, line = true) {
  const X = (x) => CX + (x - CX) * S, Y = (y) => FYL + (y - FYL) * S;
  if (line) capsule(X(ax), Y(ay), X(bx), Y(by), r * S + OUT, lutDark, a);
  capsule(X(ax), Y(ay), X(bx), Y(by), r * S, lut, a);
}
function ell(x, y, rx, ry, lut, line = true) {
  const X = CX + (x - CX) * S, Y = FYL + (y - FYL) * S;
  if (line) ellipse(X, Y, rx * S + OUT, ry * S + OUT, lutDark);
  ellipse(X, Y, rx * S, ry * S, lut);
}

export function drawFrog(lut, { now, beat, age, hourTurn, night, show, cx, feetY }) {
  CX = cx; FYL = feetY;
  const dim = 1 - 0.6 * night;
  // the rainbow, toe (violet) to crown (red), a touch shimmering
  for (let y = 0; y < H; y++) {
    const h = kit.clamp((feetY - y) / 17);
    const c = kit.hsv(0.78 - 0.8 * h + 0.03 * Math.sin(now * 1.5), 0.85, 0.7 * dim);
    lut[3 * y] = c[0]; lut[3 * y + 1] = c[1]; lut[3 * y + 2] = c[2];
  }
  flat(lutGlass, kit.scale(GLASS, dim)); flat(lutWhite, kit.scale(WHITE, 0.8 * dim)); flat(lutDark, DARK);

  // splits on the hour: drop 0.3..1.1 s, hold, rise 3.6..4.6 s
  const sp = hourTurn ? kit.ease.inOut(kit.smoothstep(0.3, 1.1, age)) * (1 - kit.ease.inOut(kit.smoothstep(3.6, 4.6, age))) : 0;
  const bounce = 0.5 - 0.5 * Math.cos(kit.TAU * beat);           // down on every beat
  const sway = Math.sin(Math.PI * beat) * 1.6 * (1 - sp);
  const w = Math.sin(Math.PI * beat / 2);                         // Travolta: which arm points up
  const ws = Math.max(-1, Math.min(1, w * 1.6));
  const hx = cx + sway;
  const hipY = kit.lerp(feetY - 5.4 + 1.1 * bounce, feetY - 1.6, sp);

  // legs: hip -> knee -> foot
  for (const s of [-1, 1]) {
    const footX = kit.lerp(cx + s * 3.6, cx + s * 9.5, sp), footY = feetY;
    const hipX = hx + s * 1.8;
    const kneeX = kit.lerp((hipX + footX) / 2 + s * (1.4 + 0.8 * bounce), (hipX + footX) / 2, sp);
    const kneeY = kit.lerp((hipY + footY) / 2 - 0.3, footY - 0.6, sp);
    cap(hipX, hipY, kneeX, kneeY, 1.15, lut);
    cap(kneeX, kneeY, footX, footY - 0.4, 1.0, lut);
    ell(footX + s * 0.9, footY, 1.9, 0.9, lut);
  }
  // body
  const bodyY = hipY - 2.6;
  ell(hx, bodyY, 3.5, 3.6, lut);
  // arms: shoulder -> elbow -> hand; one points to the ceiling, one on the hip
  const shY = bodyY - 1.4;
  for (const s of [-1, 1]) {
    const up = kit.clamp(0.5 + 0.5 * ws * s);                     // 1: this arm points up
    const vee = sp;                                                // the splits: both arms up in a V
    let hxp = kit.lerp(hx + s * 5.0, hx + s * 6.6, up), hyp = kit.lerp(bodyY + 0.6, bodyY - 13.5, up);
    hxp = kit.lerp(hxp, hx + s * 8.5, vee); hyp = kit.lerp(hyp, bodyY - 11, vee);
    const shx = hx + s * 2.8;
    const ex = kit.lerp(shx + s * 3.0, (shx + hxp) / 2 + s * 1.0, Math.max(up, vee));
    const ey = kit.lerp(shY + 0.4, (shY + hyp) / 2, Math.max(up, vee));
    cap(shx, shY, ex, ey, 0.85, lut);
    cap(ex, ey, hxp, hyp, 0.8, lut);
  }
  // head, bobbing a beat behind the body
  const headX = hx + 0.5 * Math.sin(Math.PI * beat - 0.6), headY = bodyY - 4.9 + 0.4 * bounce;
  ell(headX, headY, 5.0, 3.1, lut);
  // round glasses: gold rims, white eyes, pupils that glance about
  const look = Math.sin(now * 0.7) * 0.5;
  for (const s of [-1, 1]) {
    const ex = headX + s * 2.6, ey = headY - 2.3;
    ell(ex, ey, 2.25, 2.25, lutGlass);
    ell(ex, ey, 1.45, 1.45, lutWhite, false);
    ell(ex + look, ey + 0.2, 0.62, 0.62, lutDark, false);
  }
  // grin
  cap(headX - 2.6, headY + 0.6, headX - 0.9, headY + 1.5, 0.35, lutDark, 0.9, false);
  cap(headX - 0.9, headY + 1.5, headX + 0.9, headY + 1.5, 0.35, lutDark, 0.9, false);
  cap(headX + 0.9, headY + 1.5, headX + 2.6, headY + 0.6, 0.35, lutDark, 0.9, false);
}
