// The Otis, the side flats: the hour-tens lift only serves floors 0-2 and
// the minute-tens lift 0-5, so their shafts stop short. Each ends in a small
// machine room (sheave turning with its car), and above it there are more
// flats: left block floors 4-9, right block floors 7-9.
import * as kit from '../js/kit.js';
import * as G from './elevators-gfx.js';
import { person, lampLevel, lightRoom, hourDark, hoursF, inWin, AWAKE } from './elevators-scene.js';

const C = kit.hex;
const floorTop = (f) => 30 + (9 - f) * 15;
const SLAB = C('#34343a'), SILL = C('#5c5c64'), SKIN = C('#e0a070');

function paper(x0, x1, y0, col, stripe = 0) {
  for (let x = x0; x < x1; x++) G.rect(x, y0, x + 1, y0 + 12, kit.scale(col, stripe && x % stripe === 0 ? 1.35 : 1));
  G.rect(x0, y0 + 12, x1, y0 + 13, C('#3a3634'));
  G.rect(x0, y0 + 13, x1, y0 + 15, SLAB); G.rect(x0, y0 + 13, x1, y0 + 13.5, SILL, 0.4);
}

// --- left block, x 2..23 ----------------------------------------------------
const L = {
  9(x, y, now) {            // the painter at her easel
    paper(x, x + 21, y, C('#2a2430'), 3);
    G.line(x + 12, y + 12, x + 14, y + 3, C('#6a4a30'), 1, 0.8); G.line(x + 18, y + 12, x + 16, y + 3, C('#6a4a30'), 1, 0.8);
    G.rect(x + 12, y + 2.5, x + 19, y + 8, C('#d8d0c0'));
    G.rect(x + 13, y + 4, x + 15, y + 6, C('#e05030')); G.rect(x + 15.5, y + 3.5, x + 18, y + 5, C('#3070d0')); G.rect(x + 14, y + 6, x + 18, y + 7, C('#40a050'));
    person(x + 6, y + 12, C('#b03070'));
    const b = Math.sin(now * 2.6);
    G.line(x + 9, y + 7, x + 12.5 + 0.8 * b, y + 4.5 + 1.2 * Math.cos(now * 2.6), SKIN, 1, 0.8);
  },
  8(x, y, now) {            // the plant room: everything sways
    paper(x, x + 21, y, C('#1c2a20'), 0);
    for (let k = 0; k < 4; k++) {
      const px = x + 2.5 + k * 5, sw = 0.6 * Math.sin(now * 1.1 + k * 1.7);
      G.rect(px - 1.2, y + 9.5, px + 1.8, y + 12, C('#9a4a2a'));
      for (let l = 0; l < 3; l++) G.line(px + 0.3, y + 9.5, px + 0.3 + (l - 1) * 1.8 + sw, y + 5 + l * 0.8 - (k % 2) * 1.5, C('#40b040'), 1, 1);
    }
  },
  7(x, y, now) {            // the toy train going round its oval
    paper(x, x + 21, y, C('#202c3c'), 4);
    for (let k = 0; k < 24; k++) { const a = (k / 24) * kit.TAU; G.add(Math.round(x + 10.5 + 7.5 * Math.cos(a) - 0.5), Math.round(y + 9 + 2 * Math.sin(a) - 0.5), [0.15, 0.12, 0.1], 1); }
    for (let c = 0; c < 3; c++) {
      const a = now * 1.5 - c * 0.45, px = x + 10.5 + 7.5 * Math.cos(a), py = y + 9 + 2 * Math.sin(a);
      G.rect(px - 0.9, py - 1.6, px + 0.9, py + 0.2, c === 0 ? C('#e03030') : C('#3060e0'));
    }
    G.splat(x + 10.5 + 7.5 * Math.cos(now * 1.5), y + 7.2 + 2 * Math.sin(now * 1.5), 1, [1, 0.9, 0.5], 0.5);
    person(x + 2, y + 12, C('#f0c030'));
  },
  6(x, y, now) {            // grandma rocking and knitting
    paper(x, x + 21, y, C('#36241c'), 5);
    const r = 0.8 * Math.sin(now * 1.4);
    G.line(x + 4 + r, y + 12, x + 12 + r, y + 12.4 - 0.4 * r, C('#6a4a30'), 1, 0.9);   // rocker
    G.rect(x + 5 + r * 0.5, y + 3.5, x + 6.5 + r * 0.5, y + 11, C('#6a4a30'));
    person(x + 7 + r * 0.6, y + 11.2, C('#8a5ab0'));
    G.rect(x + 7.4 + r * 0.6, y + 2.7, x + 9.6 + r * 0.6, y + 3.6, C('#d8d8e0'));       // grey bun
    G.disc(x + 13.5, y + 8.5 + 0.3 * Math.sin(now * 5), 1.2, C('#e04050'));             // the ball of wool
    G.line(x + 10 + r * 0.6, y + 7, x + 13, y + 8.4, C('#e04050'), 0.8, 0.6);
    G.rect(x + 16, y + 7, x + 20, y + 12, C('#4a3020')); G.splat(x + 18, y + 6, 2.5, [1, 0.75, 0.4], 0.5);
  },
  5(x, y, now) {            // the bathroom: bubbles and a rubber duck
    for (let yy = y; yy < y + 12; yy++) for (let xx = x; xx < x + 21; xx++) G.set(xx, yy, kit.scale(C('#2a3c44'), (xx % 3 === 0 || yy % 3 === 0) ? 0.75 : 1));
    G.rect(x, y + 12, x + 21, y + 13, C('#3a3634')); G.rect(x, y + 13, x + 21, y + 15, SLAB); G.rect(x, y + 13, x + 21, y + 13.5, SILL, 0.4);
    G.rect(x + 3, y + 7, x + 18, y + 11.5, C('#7a7a84')); G.rect(x + 4, y + 11.5, x + 5, y + 12, C('#c0a050')); G.rect(x + 16, y + 11.5, x + 17, y + 12, C('#c0a050'));
    G.disc(x + 6, y + 6.5, 1.2, SKIN); G.rect(x + 4.8, y + 5.2, x + 7.2, y + 6, C('#3a2418'));
    const bob = 0.4 * Math.sin(now * 2.2);
    G.rect(x + 12, y + 5.6 + bob, x + 14.5, y + 7 + bob, C('#ffd020')); G.rect(x + 13.5, y + 4.6 + bob, x + 15, y + 5.8 + bob, C('#ffd020'));
    G.add(x + 15 | 0, y + 5 + bob | 0, C('#ff8020'), 0.8);
    for (let k = 0; k < 4; k++) {
      const t = kit.fract(now / 3 + k / 4), bx = x + 5 + k * 3 + Math.sin(now * 2 + k) * 0.8, by = y + 7 - 6 * t;
      G.splat(bx, by, 1, [0.6, 0.7, 0.8], 0.5 * Math.sin(Math.PI * t));
    }
  },
  4(x, y, now) {            // the dog in its basket, wagging
    paper(x, x + 21, y, C('#2c2a1c'), 0);
    G.rect(x + 4, y + 9.5, x + 15, y + 12, C('#8a5a2a'));
    G.rect(x + 5, y + 6.5, x + 13, y + 10, C('#d8a060')); G.rect(x + 11, y + 4.5, x + 15, y + 8, C('#d8a060'));
    G.rect(x + 14.5, y + 6, x + 16, y + 7.2, C('#3a2418'));                              // nose
    G.rect(x + 11, y + 4.5, x + 12.2, y + 7.5, C('#8a5030'));                            // ear
    G.set(x + 13, y + 5, [0.01, 0.01, 0.01]);
    const w = Math.sin(now * 9);
    G.line(x + 5, y + 7, x + 2.5 + w * 0.8, y + 4.5 - Math.abs(w) * 0.5, C('#d8a060'), 1, 1);
  },
};
// --- right block, x 84..105 -------------------------------------------------
const R = {
  9(x, y, now) {            // the bird cage
    paper(x, x + 21, y, C('#1e2c2a'), 3);
    G.line(x + 10.5, y, x + 10.5, y + 2, C('#c0a050'), 1, 0.6);
    for (let k = 0; k < 5; k++) G.line(x + 7 + k * 1.75, y + 3 + Math.abs(k - 2) * 0.5, x + 7 + k * 1.75, y + 10, C('#c0a050'), 0.7, 0.6);
    G.rect(x + 6.5, y + 10, x + 14.5, y + 11, C('#c0a050'));
    const hop = Math.max(0, Math.sin(now * 3.1)) ** 4 * 1.5, bx = x + 9 + 1.5 * Math.sign(Math.sin(now * 0.4));
    G.rect(bx, y + 7 - hop, bx + 2.4, y + 9 - hop, C('#50d0e0')); G.add(bx + 2.4 | 0, y + 7.5 - hop | 0, C('#ffb020'), 0.9);
    G.rect(x + 16, y + 6, x + 19, y + 12, C('#3a2a1a'));
  },
  8(x, y, now) {            // the exercise bike
    paper(x, x + 21, y, C('#2a2030'), 0);
    G.disc(x + 13, y + 10.5, 1.4, C('#606068')); G.rect(x + 7, y + 9, x + 14, y + 10, C('#909098'));
    const a = now * 6, fx = x + 10 + 1.2 * Math.cos(a), fy = y + 10 + 1.2 * Math.sin(a);
    person(x + 7.5, y + 9.2, C('#e05030'), 1, false, 0);
    G.line(x + 9, y + 7, fx, fy, C('#2a2c40'), 1, 1);
    G.line(x + 9, y + 7, x + 10 - 1.2 * Math.cos(a), y + 10 - 1.2 * Math.sin(a), C('#2a2c40'), 0.7, 1);
  },
  7(x, y, now) {            // the lava lamp night owl
    paper(x, x + 21, y, C('#20182a'), 4);
    G.rect(x + 4, y + 4, x + 7, y + 11, [0.04, 0.02, 0.05]); G.rect(x + 3.6, y + 11, x + 7.4, y + 12, C('#909098'));
    person(x + 12, y + 12, C('#40c0a0'));
  },
};
function Rglow(y, now, lamp) {
  const x = 84;
  for (let k = 0; k < 2; k++) {
    const t = kit.fract(now / 7 + k * 0.5), by = y + 10.5 - 6 * (0.5 - 0.5 * Math.cos(t * kit.TAU));
    G.splat(x + 5.5, by, 1.6, [1, 0.25, 0.4], 0.8);
  }
  G.splat(x + 5.5, y + 7, 5, [1, 0.3, 0.4], 0.1);
}

/** A short shaft's machine room: motor, turning sheave, run lamp. */
function machineRoom(x, y, st, carX, now) {
  G.rect(x, y, x + 21, y + 13, [0.02, 0.018, 0.022]);
  G.rect(x, y + 13, x + 21, y + 15, SLAB);
  const cx = carX + 4, cy = y + 7.5;
  G.rect(cx - 9 < x ? cx + 3.5 : cx - 9, cy - 1.5, (cx - 9 < x ? cx + 3.5 : cx - 9) + 5, cy + 3, C('#3a5a40'));   // the motor
  G.disc(cx, cy, 3, C('#6a6e78')); G.disc(cx, cy, 2, [0.03, 0.03, 0.035]);
  for (let k = 0; k < 3; k++) { const a = st.pos * 2.4 + (k * kit.TAU) / 3; G.line(cx, cy, cx + Math.cos(a) * 2.3, cy + Math.sin(a) * 2.3, C('#9aa0aa'), 0.9, 0.8); }
  G.disc(cx, cy, 0.7, C('#c0a060'));
  G.splat(x + 3, y + 2.5, 1.2, [1, 0.15, 0.05], st.moving ? 0.9 : 0.12);
  G.splat(x + 10.5, y + 1, 4, [0.6, 0.7, 0.8], 0.06);
}

export function drawSide(now, date, hourAge, sts, carXs) {
  for (const f of [9, 8, 7, 6, 5, 4]) {
    const y = floorTop(f), id = 20 + f;
    L[f](2, y, now);
    lightRoom(id, 2, y, 23, y + 13, now, date, hourAge, lampLevel(id, now, date), f);
    hourDark(2, y, 23, y + 13, f, hourAge);
  }
  for (const f of [9, 8, 7]) {
    const y = floorTop(f), id = 30 + f, lamp = lampLevel(id, now, date);
    R[f](84, y, now);
    lightRoom(id, 84, y, 105, y + 13, now, date, hourAge, lamp, f);
    if (f === 7) Rglow(y, now, lamp);
    hourDark(84, y, 105, y + 13, f, hourAge);
  }
  machineRoom(2, floorTop(3), sts[0], carXs[0], now);
  machineRoom(84, floorTop(6), sts[2], carXs[2], now);
}
