// The cast of abyss.js, drawn once at load: the anglerfish (an upper body
// and a lower jaw that hinges), the submersible, and the lanternfish masks
// at sixteen sub-pixel phases, so the frame only copies and adds.

import { hex } from '../js/kit.js';
import { buildSprite } from './abyss-gl.js';

// ------------------------------------------------------------ the anglerfish
// A black seadevil (Melanocetus) in profile, facing right: a round body that
// is mostly head, a jaw that juts past the snout, glassy fangs, a beady eye,
// the rod (illicium) rising from the snout. Local frame 80 x 46; the jaw
// hinges at HINGE. Two palettes: by its own lure light (near black, a teal
// rim on the side facing the lure), and under a floodlight (the real
// brown-grey skin and the red mouth).

export const ANG_W = 80, ANG_H = 46;
export const HINGE = [44, 27], ROD_BASE = [55, 6.5], MOUTH = [58, 27];

const pal = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, hex(v)]));
const DARK = pal({ skin: '0d0c16', rim: '275a66', cavity: '0a0308', tooth: '9cb6c0', iris: '3f6472', pupil: '040508', glint: 'e0f8ff', fin: '15182a', spot: '07070d' });
const LIT = pal({ skin: '624a42', rim: '94765f', cavity: '82222c', tooth: 'f6f2e6', iris: 'c4b27c', pupil: '0c0a08', glint: 'ffffff', fin: '725a4e', spot: '4a3832' });

const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
const HEAD = [[36, 6], [50, 5], [59, 9], [65, 15], [67.5, 20.5], [60, 24], [44, 27.5], [36, 18]];
const CAVITY = [[44, 25], [67, 20.5], [67, 30], [57, 37], [44, 36]];
const JAW = [[41, 26], [56, 23.2], [66, 19.4], [71.5, 15.6], [73, 18.5], [69.5, 25], [59, 32.5], [47, 36], [40, 33]];
const upperLine = (x) => 26.6 - ((x - 45) * 5.6) / 21;          // where the upper teeth hang from
const lowerLine = (x) => 25 - ((x - 44) * 8.4) / 27;            // where the lower fangs stand on

function drawUpper(g, p) {
  // tail and fins behind the body
  g.fillPolygon([[16, 20], [2, 8], [6, 22.5], [2, 37], [16, 28]], p.fin);
  g.fillPolygon([[23, 9], [28, 1.5], [34, 7.5]], p.fin);
  // body, rim-lit on the side facing the lure (up and forward)
  g.fillEllipse(35, 23, 21, 17, p.rim);
  g.fillEllipse(34.2, 23.9, 20.6, 16.6, p.skin);
  g.fillPolygon(shift(HEAD, 0.8, -0.8), p.rim);
  g.fillPolygon(CAVITY, p.cavity);
  g.fillPolygon(HEAD, p.skin);
  // warts and a lateral line: skin, not a balloon
  for (const [x, y, r] of [[26, 15, 1.3], [20, 27, 1.1], [31, 33, 1.2], [40, 17, 0.9], [15, 20, 0.9]]) g.fillCircle(x, y, r, p.spot);
  g.stroke([[22, 22], [30, 21], [40, 22.5]], 0.8, p.spot);
  // pectoral fin
  g.fillPolygon([[31, 27], [22, 32], [23, 37], [33, 31]], p.fin);
  g.stroke([[31, 27.5], [23, 33]], 0.7, p.rim, { a: 0.6 });
  // upper fangs, hanging from the upper jaw, raked back
  for (const [x, l] of [[50, 4], [55, 7], [60.5, 5], [65, 3]]) {
    const y = upperLine(x) - 0.6;
    g.fillPolygon([[x - 0.9, y], [x + 0.9, y], [x - 0.4, y + l]], p.tooth);
  }
  // the eye: small, beady, with a catchlight
  g.fillCircle(53, 12.5, 2.3, p.iris);
  g.fillCircle(53.3, 12.7, 1.3, p.pupil);
  g.fillCircle(52.4, 11.6, 0.6, p.glint);
  // the rod's root on the snout
  g.fillCircle(ROD_BASE[0], ROD_BASE[1] + 0.6, 1.3, p.rim);
}

function drawJaw(g, p) {
  g.fillPolygon(shift(JAW, 0.6, 0.8), p.rim);
  g.fillPolygon(JAW, p.skin);
  // lower fangs: long, standing up and leaning forward past the snout
  for (const [x, l] of [[51.5, 5], [57, 8.5], [63, 6], [68.5, 5]]) {
    const y = lowerLine(x) + 0.6;
    g.fillPolygon([[x - 1, y], [x + 1, y], [x + 0.8, y - l]], p.tooth);
  }
}

export const ANGLER = buildSprite(ANG_W, ANG_H, drawUpper, DARK, [LIT]);
export const JAWSPR = buildSprite(ANG_W, ANG_H, drawJaw, DARK, [LIT]);

// ------------------------------------------------------------ the submersible
// A deep-submergence vehicle seen side on, facing left: white hull, orange
// sail, the lit cabin viewport, skids, a stern propeller, floodlights at the
// bow. 32 x 15; the lamps are at SUB_LAMPS (sprite coordinates).

export const SUB_W = 35, SUB_H = 15;
export const SUB_LAMPS = [[2.5, 10.5], [7.5, 12.8]];
const SUBPAL = pal({ hull: '8e9090', belly: '4a5056', top: 'c8c8bc', sail: 'd8641c', glass: '1c2c3c', cabin: 'ffcc70', skid: '6c6e6a', prop: '8c8c84', lamp: 'fff6dc' });

function drawSub(g, p) {
  // skids and the sample basket under the bow
  g.fillRoundRect(5, 12.6, 22, 1.4, 0.6, p.skid);
  g.fillRect(4, 11, 9, 2, p.skid);
  // the hull: a white capsule, shaded below
  g.fillRoundRect(2, 3.5, 30, 9, 4.5, p.belly);
  g.fillRoundRect(2.3, 3.5, 29.4, 7.2, 3.6, p.hull);
  g.fillRoundRect(6, 3.6, 22, 2.4, 1.2, p.top);
  // the sail, orange
  g.fillRoundRect(15, 0.3, 8, 4.6, 1.6, p.sail);
  // stern propeller in its shroud
  g.fillEllipse(32.8, 8, 1.6, 3.6, p.prop);
  // the manipulator arm, folded forward
  g.stroke([[8, 11.5], [3, 13.8], [0.8, 12.6]], 0.9, p.skid);
  // the viewport, lit from inside
  g.fillCircle(6.5, 7.5, 2.2, p.glass);
  g.fillCircle(6.5, 7.5, 1.3, p.cabin);
  g.fillCircle(SUB_LAMPS[0][0], SUB_LAMPS[0][1], 1, p.lamp);
  g.fillCircle(SUB_LAMPS[1][0], SUB_LAMPS[1][1], 1, p.lamp);
}
export const SUB = buildSprite(SUB_W, SUB_H, drawSub, SUBPAL);

// ------------------------------------------------------------ lanternfish
// A myctophid 12 x 5, facing left: a pointed snout, one big bright eye, a
// line of four photophores along the belly, a forked tail that flicks (three
// positions). Masks are 13 x 6 at 16 sub-pixel phases (4 x 4), facing left
// or right: body, lights, eye. The halo (light scattered by the water) is
// 20 x 13 at the same phases.
export const FISH_LEN = 12, FISH_HT = 5, FISH_CX = 6, FISH_CY = 2.5;
export const FM_W = 13, FM_H = 6, FM_N = FM_W * FM_H;
// the tail: columns 10 and 11 of each row, per flick position
const TAILS = [
  [[0, 1], [1, 0.6], [0.4, 0], [1, 0.6], [0, 1]],
  [[0.8, 1], [1, 0.4], [0.6, 0], [0.5, 0.7], [0, 0]],
  [[0, 0], [0.5, 0.7], [0.6, 0], [1, 0.4], [0.8, 1]],
];
function srcBody(tail) {
  const t = TAILS[tail];
  const b = [
    [0, 0, 0.5, 1, 1, 1, 1, 0.6, 0, 0],
    [0, 0.8, 1, 1, 1, 1, 1, 1, 1, 0.4],
    [0.8, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0.8, 1, 1, 1, 1, 1, 1, 1, 0.4],
    [0, 0, 0.5, 1, 1, 1, 1, 0.6, 0, 0],
  ];
  return b.map((r, j) => [...r, ...t[j]]);
}
const Z = () => new Array(FISH_LEN).fill(0);
const SRC_LIGHT = [Z(), Z(), Z(), Z(), Z()];
SRC_LIGHT[4][3] = 1; SRC_LIGHT[4][5] = 1; SRC_LIGHT[4][7] = 0.9; SRC_LIGHT[3][9] = 0.7;
const SRC_EYE = [Z(), Z(), Z(), Z(), Z()];
SRC_EYE[1][2] = 1; SRC_EYE[2][2] = 0.45; SRC_EYE[1][3] = 0.25;

function shifted(src, flip, fx, fy, out, off) {
  for (let j = 0; j < FM_H; j++)
    for (let i = 0; i < FM_W; i++) {
      let v = 0;
      for (let b = 0; b < 2; b++)
        for (let a = 0; a < 2; a++) {
          const si = i - a, sj = j - b;
          if (si < 0 || sj < 0 || si >= FISH_LEN || sj >= FISH_HT) continue;
          v += src[sj][flip ? FISH_LEN - 1 - si : si] * (a ? fx : 1 - fx) * (b ? fy : 1 - fy);
        }
      out[off + j * FM_W + i] = v;
    }
}

/** Mask index: ((flip * 3 + tail) * 16 + phase) * FM_N; phase = (fy4 * 4 + fx4). */
export const FBODY = new Float32Array(2 * 3 * 16 * FM_N);
export const FLIGHT = new Float32Array(2 * 3 * 16 * FM_N);
export const FEYE = new Float32Array(2 * 3 * 16 * FM_N);
for (let flip = 0; flip < 2; flip++)
  for (let tail = 0; tail < 3; tail++)
    for (let ph = 0; ph < 16; ph++) {
      const fx = (ph & 3) / 4, fy = (ph >> 2) / 4, off = ((flip * 3 + tail) * 16 + ph) * FM_N;
      shifted(srcBody(tail), flip, fx, fy, FBODY, off);
      shifted(SRC_LIGHT, flip, fx, fy, FLIGHT, off);
      shifted(SRC_EYE, flip, fx, fy, FEYE, off);
    }

export const HALO_W = 20, HALO_H = 13, HALO_N = HALO_W * HALO_H, HALO_DX = -4, HALO_DY = -4;
export const FHALO = new Float32Array(16 * HALO_N);
for (let ph = 0; ph < 16; ph++) {
  const fx = (ph & 3) / 4, fy = (ph >> 2) / 4;
  const cx = FISH_CX + fx - HALO_DX, cy = FISH_CY + 1 + fy - HALO_DY;
  for (let j = 0; j < HALO_H; j++)
    for (let i = 0; i < HALO_W; i++) {
      const dx = i + 0.5 - cx, dy = j + 0.5 - cy;
      FHALO[ph * HALO_N + j * HALO_W + i] = Math.exp(-(dx * dx) / 26 - (dy * dy) / 7);
    }
}
