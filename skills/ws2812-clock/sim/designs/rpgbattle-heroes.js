// The party: three chibi heroes (~23 px), drawn from shapes with coverage so
// they glide and animate between pixels. Every part gets its own black
// keyline (grow pass) in back-to-front order, like hand-made sprite art.
// All face left. (x, y) is the point between the feet on the ground.
import * as G from './rpgbattle-gfx.js';

const lin = (h) => { const n = parseInt(h.slice(1), 16), f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return [f(n >> 16), f((n >> 8) & 255), f(n & 255)]; };
const OUT = [0, 0, 0];
const C = {
  skin: lin('#ffc890'), skinM: lin('#f2a86c'), eye: lin('#140c18'),
  steel: lin('#c8d4ea'), steelD: lin('#7484a4'), armor: lin('#3c74ff'), armorL: lin('#8cb4ff'), cape: lin('#e0202c'),
  blade: lin('#f0f6ff'), gold: lin('#ffc030'),
  robe: lin('#2c4cd8'), robeL: lin('#6a8cff'), hat: lin('#d8a03a'), hatD: lin('#9a6a1c'), void: lin('#06040c'),
  glowEye: lin('#ffe83a'), staff: lin('#9a6430'), orb: lin('#ff3a3a'),
  gi: lin('#ff8a1a'), giD: lin('#c85a08'), pants: lin('#4a3a9a'), band: lin('#ff2a3a'), hair: lin('#3a2414'),
};
export { C as HC };

// draw a shape with a keyline: fn() is called once grown in black, once in colour
function K(fn, g = 0.95) { const s0 = G.S.grow; G.S.grow = s0 + g; G.S.ink = OUT; fn(); G.S.grow = s0; G.S.ink = null; fn(); }
const eye = (x, y, open, c = C.eye) => {
  if (open > 0.2) G.capsule(x, y - 0.75 * open, x, y + 0.75 * open, 0.72, c);
  else G.capsule(x - 0.7, y, x + 0.7, y, 0.45, c);
};

/**
 * P: { b: breath bob (px), st: stride (-1..1), arm: weapon angle (rad from
 * up, + = forward/left), fl: cape/flutter phase, blink: 0..1 eyes open,
 * flash: 0..1 white, lean: forward lean in px at the head }
 */
export function knight(x, y, P) {
  const b = P.b, st = P.st * 2.2, ln = P.lean;
  // cape, behind
  K(() => G.poly([x + 0.4 + ln * 0.5, y - 12.6 + b, x + 3.6 + ln * 0.5, y - 12.2 + b, x + 6.8 + Math.sin(P.fl) * 1.2, y - 2.2, x + 1.6, y - 3.4], C.cape));
  // legs
  K(() => G.capsule(x + 1.7, y - 6, x + 1.6 - st, y - 1.4, 1.75, C.steelD));
  K(() => G.capsule(x - 1.6, y - 6, x - 1.8 + st, y - 1.4, 1.75, C.steel));
  // torso: blue plate with a light chest
  K(() => G.capsule(x + ln * 0.4, y - 11.4 + b, x, y - 6.4 + b * 0.5, 3.5, C.armor));
  G.ellipse(x - 1.3 + ln * 0.4, y - 10.4 + b, 1.5, 1.8, C.armorL);
  // head: helmet with an open face, plume
  const hx = x - 0.3 + ln, hy = y - 16.6 + b;
  K(() => G.capsule(hx + 0.8, hy - 5, hx + 5.2, hy - 3 + Math.sin(P.fl + 1) * 0.8, 1.35, C.cape));
  K(() => G.disc(hx, hy, 5.3, C.steel));
  G.ellipse(hx - 1.7, hy + 0.9, 3.5, 3.0, C.skin);
  G.capsule(hx - 4.6, hy - 2.1, hx + 1.4, hy - 2.1, 0.7, C.steelD);
  eye(hx - 3.5, hy + 0.5, P.blink); eye(hx - 0.6, hy + 0.5, P.blink);
  // sword arm
  const ax = x - 3.2 + ln * 0.5, ay = y - 8.8 + b, sa = Math.sin(P.arm), ca = Math.cos(P.arm);
  K(() => G.capsule(ax, ay, ax - sa * 12.5, ay - ca * 12.5, 0.95, C.blade, 0.6));
  K(() => G.capsule(ax - sa * 1.6 - ca * 2.3, ay - ca * 1.6 + sa * 2.3, ax - sa * 1.6 + ca * 2.3, ay - ca * 1.6 - sa * 2.3, 0.8, C.gold));
  K(() => G.disc(ax, ay, 1.45, C.skin));
}

export function mage(x, y, P) {
  const b = P.b, ln = P.lean;
  // staff (behind the hand, in front of the robe)
  const sx = x - 5 + ln * 0.3, top = y - 18.5 + b - P.arm * 4;
  // robe
  K(() => G.poly([x - 2.8 + ln * 0.3, y - 9.6 + b, x + 2.8 + ln * 0.3, y - 9.6 + b, x + 4.9, y - 0.6, x - 4.9, y - 0.6], C.robe));
  G.poly([x - 4.6, y - 2.4, x + 4.6, y - 2.4, x + 4.9, y - 0.8, x - 4.9, y - 0.8], C.robeL);
  K(() => G.ellipse(x - 2.4 + P.st, y - 0.2, 1.8, 1.1, C.hatD));
  K(() => G.capsule(sx + 0.6, y - 0.4, sx - 0.4, top, 0.8, C.staff));
  K(() => G.disc(sx - 0.4, top - 1.2, 1.7, C.orb));
  // face: a void under the hat with two glowing eyes
  const hx = x - 0.5 + ln, hy = y - 12.6 + b;
  K(() => G.disc(hx, hy, 3.8, C.void));
  const o = P.blink;
  G.ellipse(hx - 1.8, hy + 0.1, 1.05, 1.15 * Math.max(0.25, o), C.glowEye);
  G.ellipse(hx + 1.0, hy + 0.1, 1.05, 1.15 * Math.max(0.25, o), C.glowEye);
  // hat: brim and a bent cone
  const sw = Math.sin(P.fl) * 1.2;
  K(() => G.poly([hx - 4.0, hy - 3.1, hx + 4.0, hy - 3.1, hx + 2.6 + sw, hy - 10.8, hx + 0.6 + sw, hy - 11.4], C.hat));
  K(() => G.poly([hx + 0.6 + sw, hy - 11.4, hx + 2.6 + sw, hy - 10.8, hx + 6.2 + sw * 1.6, hy - 9.6], C.hat));
  K(() => G.ellipse(hx, hy - 3.0, 7.4, 1.85, C.hat, -0.06));
  G.capsule(hx - 3.6, hy - 4.1, hx + 3.6, hy - 4.1, 0.55, C.hatD);
  // hand on the staff
  K(() => G.disc(sx + 0.2, y - 8.6 + b - P.arm * 3, 1.35, C.robe));
}

export function monk(x, y, P) {
  const b = P.b, st = P.st * 2.4, ln = P.lean;
  // back arm
  K(() => G.capsule(x + 1.6 + ln * 0.4, y - 10.4 + b, x + 0.6 - P.arm * 0.5, y - 8.2 + b, 1.4, C.giD));
  K(() => G.disc(x + 0.2 - P.arm * 0.5, y - 8.2 + b, 1.5, C.skinM));
  // legs, wide stance
  K(() => G.capsule(x + 1.9, y - 6, x + 3.3 - st, y - 1.4, 1.85, C.pants));
  K(() => G.capsule(x - 1.9, y - 6, x - 3.4 + st, y - 1.4, 1.85, C.pants));
  // torso: gi and belt
  K(() => G.capsule(x + ln * 0.4, y - 11.3 + b, x, y - 6.6 + b * 0.5, 3.7, C.gi));
  G.capsule(x - 3.4, y - 6.9 + b * 0.5, x + 3.4, y - 6.9 + b * 0.5, 0.75, C.eye);
  G.poly([x - 1.4 + ln * 0.4, y - 13.2 + b, x + 0.6 + ln * 0.4, y - 13.2 + b, x - 0.4, y - 8.8 + b], C.skinM);
  // head: shaved, top-knot, headband with tails
  const hx = x - 0.4 + ln, hy = y - 16.4 + b, f = Math.sin(P.fl);
  K(() => G.capsule(hx + 4.4, hy - 1.8, hx + 8.6, hy - 0.2 + f * 1.4, 0.75, C.band, 0.5));
  K(() => G.disc(hx + 1.2, hy - 5.6, 1.7, C.hair));
  K(() => G.disc(hx, hy, 5.0, C.skin));
  G.capsule(hx - 4.8, hy - 1.9, hx + 4.8, hy - 1.9, 0.85, C.band);
  eye(hx - 3.3, hy + 0.8, P.blink); eye(hx - 0.5, hy + 0.8, P.blink);
  // front arm: a fist forward
  const fx = x - 4.8 - P.arm * 4 + ln * 0.5, fy = y - 9.6 + b - P.arm * 0.6;
  K(() => G.capsule(x - 1.2 + ln * 0.4, y - 10.4 + b, fx + 1.2, fy, 1.45, C.gi));
  K(() => G.disc(fx, fy, 1.6, C.skin));
}

export const HEROES = [knight, mage, monk];
