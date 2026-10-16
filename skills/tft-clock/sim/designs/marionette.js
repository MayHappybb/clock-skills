// marionette: a puppet theatre seen from the stalls, with the bridge above it
// in view. Four plywood numerals, each a marionette with dowel arms, striped
// stockings and its own wooden control, hang on strings from a leaning rail.
// The puppeteer's two hands work them: all minute one hand or the other
// unhooks a puppet and makes it walk, jig, wave, jump, kick or waltz, then
// hooks it back. The colon is a seconds pendulum, two beads on one thread.
//
// The minute turn is a scene change done the way a marionette theatre does
// it: the puppet whose digit is about to change waves, and the hand flies it
// up out of sight before :00; after :00 the hand lowers the new numeral in,
// it lands with a crouch on its own legs, bows and is hooked up. At the hour
// both hands take the rail itself: a curtain call, the whole troupe flies,
// and the next hour's troupe comes down tilted so they land left to right,
// tap tap tap tap, into a kick line.
//
// Look: stage lighting rather than keylines. A dim painted backcloth (its sky
// follows the real time of day, sun or moon painted on it), lit wood picked
// out by follow-spots that come up on whichever puppet is working, shadows
// thrown on the cloth, footlights, velvet tabs. Wood, strings and limbs are
// anti-aliased because they swing by fractions of a pixel; the painted cloth
// and floor boards are hard flat paint.
//
// Palette: birch plywood and brass on crimson velvet and a muted painted
// cloth; four stocking colours, one per puppet, so the troupe reads as cast.

import { mix, scale, hex, sin, cos, clamp, progress, ease, rand } from '../js/kit.js';
import { GLYPHS } from './marionette-glyphs.js';
import { plan, SLOT_X, railY, COLON_X } from './marionette-plan.js';

const FLOOR = 67;            // where feet stand
const CLOTH_TOP = 13, CLOTH_BOT = 64;

const WOOD = hex('e2bb84'), WOOD_LIT = hex('f4d49e'), WOOD_EDGE = hex('865427'), WOOD_GRAIN = hex('c99c62');
const WOOD_DIM = scale(WOOD, 0.8);
const PIN = hex('f6d37a'), STRING = hex('efe6d2');
const CTRL = hex('b27b42'), CTRL_D = hex('6b4421');
const LIMB = hex('d6a96f'), MITT = hex('f6f0e4'), SHOE = hex('2a1912');
const STOCK = [hex('d8402e'), hex('2a9384'), hex('4660c8'), hex('e09b26')];
const STOCK_DIM = STOCK.map((c) => scale(c, 0.85));
const SKIN = hex('eab08a'), SKIN_SH = hex('8a5038'), SLEEVE = hex('241c2c'), CUFF = hex('e8e2d6');
const VELVET = hex('8e1b2c'), VELVET_D = hex('560c1a'), VELVET_L = hex('b9343f'), GOLD = hex('e0b252');
const BOARD = hex('6a4328'), BOARD_D = hex('472a17'), BOARD_L = hex('94633a');
const APRON = hex('1a100c'), HOOD = hex('3a2e28'), BULB = hex('ffd27a');
const FLIES = hex('0e0a0c'), RAIL = hex('5a3a20'), RAIL_L = hex('8a5e34');
const SPOT = hex('ffe2a0');
const CLOTH_DIM = 0.52;   // the cloth is only spill-lit; the spots bring it up

// The backcloth's sky through the day: [hour, top, horizon], kept dim so the
// lit wood stands out against it.
const SKY = [
  [0, '0f1530', '1e2546'], [5, '161a3a', '3a2e52'], [6.5, '3c3a6a', 'b0705a'], [8, '3f6a92', '9cb0b8'],
  [12, '3d74a6', '8fb6c8'], [16.5, '4a6c98', 'c0a07a'], [18.2, '5a3a6a', 'd0704a'], [19.5, '24204a', '5a3456'],
  [21, '121838', '262a4c'], [24, '0f1530', '1e2546'],
];
function skyAt(hr) {
  for (let k = 1; k < SKY.length; k++) {
    if (hr <= SKY[k][0]) {
      const [h0, a0, b0] = SKY[k - 1], [h1, a1, b1] = SKY[k], u = (hr - h0) / (h1 - h0);
      return [scale(mix(hex(a0), hex(a1), u), CLOTH_DIM), scale(mix(hex(b0), hex(b1), u), CLOTH_DIM)];
    }
  }
  return [scale(hex(SKY[0][1]), CLOTH_DIM), scale(hex(SKY[0][2]), CLOTH_DIM)];
}

// ------------------------------------------------------------ the set

function drawCloth(g, P) {
  const hr = P.tod / 3600, [top, hor] = skyAt(hr);
  g.gradient(0, CLOTH_TOP, 160, CLOTH_BOT - CLOTH_TOP, [top, hor]);
  const day = hr > 6.2 && hr < 18.6;
  // painted sun or moon, crossing the cloth with the real day
  if (day) {
    const u = (hr - 6.2) / 12.4, x = 18 + 124 * u, y = 42 - 22 * sin(Math.PI * u);
    g.fillCircle(x, y, 3.8, mix(hex('d8a850'), hor, 0.45), { aa: true });
    for (let k = 0; k < 8; k++) {   // painted rays, slowly turning: a stage-flat sun
      const a = k * Math.PI / 4 + P.tod * 0.05;
      g.thickLine(x + 5.2 * sin(a), y - 5.2 * cos(a), x + 7.2 * sin(a), y - 7.2 * cos(a), 1.2, mix(hex('d8a850'), hor, 0.55), { aa: true });
    }
  } else {
    const hh = hr < 12 ? hr + 24 : hr, u = (hh - 18.6) / 11.6, x = 20 + 120 * u, y = 44 - 24 * sin(Math.PI * u);
    g.fillCircle(x, y, 5, hex('e6e0c4'), { aa: true });
    g.fillCircle(x + 2.4, y - 1.4, 4.4, top, { aa: true });   // a painted crescent
    for (let k = 0; k < 14; k++) {
      const sx = 10 + rand(k, 1) * 140, sy = CLOTH_TOP + 3 + rand(k, 2) * 26;
      const tw = 0.5 + 0.5 * sin(P.tod * (0.8 + rand(k, 3)) + k);
      g.pixel(sx | 0, sy | 0, mix(top, hex('d8d4c0'), 0.35 + 0.4 * tw));
    }
  }
  // painted hills: the cloth breathes, so their edges ripple a little
  const breathe = (x, k) => 0.7 * sin(x * 0.11 + P.tod * 0.7 + k);
  const far = [], near = [];
  for (let x = 0; x <= 160; x += 10) {
    far.push([x, 47 - 6 * sin(x * 0.045 + 1.2) - 2.5 * sin(x * 0.13) + breathe(x, 0)]);
    near.push([x, 54 - 4 * sin(x * 0.06 + 3.6) - 1.5 * sin(x * 0.19 + 1) + breathe(x, 2)]);
  }
  const dusk = clamp(1 - Math.abs(hr - 12) / 7, 0, 1);
  const farC = mix(scale(mix(hex('243250'), hex('4c6a6a'), dusk), CLOTH_DIM), hor, 0.25);
  const nearC = scale(mix(hex('1b2a2a'), hex('3e5a38'), dusk), CLOTH_DIM);
  g.fillPolygon([...far, [160, CLOTH_BOT], [0, CLOTH_BOT]], farC);
  g.fillPolygon([...near, [160, CLOTH_BOT], [0, CLOTH_BOT]], nearC);
  // a painted cottage and tree on the near hill, flat as scenery
  const cx = 68, cyy = 53.5 - 4 * sin(68 * 0.06 + 3.6) - 1.5 * sin(68 * 0.19 + 1) + breathe(68, 2);
  g.fillRect(cx - 4, cyy - 6, 8, 6, mix(hex('8a6a4a'), nearC, 0.35));
  g.fillPolygon([[cx - 5.5, cyy - 6], [cx, cyy - 10], [cx + 5.5, cyy - 6]], mix(hex('7a2a26'), nearC, 0.35));
  g.fillRect(cx - 1, cyy - 4, 2, 2, day ? mix(hex('3a2a1a'), nearC, 0.3) : hex('f0c060'));
  // the cloth's folds: soft vertical bands
  for (let x = 6; x < 160; x += 15) g.fillRect(x, CLOTH_TOP, 3, CLOTH_BOT - CLOTH_TOP, 0x000000, { a: 0.09 });
  // the cloth's top edge and its batten
  g.fillRect(0, CLOTH_TOP - 1, 160, 1, hex('2a1e18'));
}

function drawFloor(g, P) {
  g.fillRect(0, CLOTH_BOT, 160, 8, BOARD);
  g.hline(0, CLOTH_BOT, 160, BOARD_D);
  for (let k = -5; k <= 5; k++) {   // board seams running to a vanishing point upstage
    const xb = 80 + k * 17, xt = 80 + k * 13.5;
    g.thickLine(xt, CLOTH_BOT + 0.5, xb, 72, 0.9, BOARD_D);
  }
  g.hline(0, 71, 160, BOARD_L);
  g.fillRect(0, 72, 160, 8, APRON);
  // footlights: hooded lamps along the apron, throwing light up onto the boards
  const flick = 0.92 + 0.08 * sin(P.tod * 9.1);
  for (let k = 0; k < 7; k++) {
    const x = 20 + k * 20;
    g.fillEllipse(x, 71.5, 9, 3.2, BULB, { a: 0.16 * flick, aa: true });
    g.fillRect(x - 4, 73, 9, 3, HOOD);
    g.hline(x - 4, 73, 9, hex('5a4a40'));
    g.fillRect(x - 2, 72, 5, 1, mix(BULB, 0xffffff, 0.3 * flick));
  }
  g.hline(0, 76, 160, hex('2a1a12'));
}

function drawCurtains(g, P) {
  for (const side of [0, 1]) {
    const sway = 0.6 * sin(P.tod * 0.6 + side * 2);
    const X = (x) => (side ? 160 - x : x);
    const pts = [[0, 0], [16, 0], [13.5, 12], [10, 30], [7 + sway, 44], [8 + sway, 52], [13, 66], [15, 80], [0, 80]].map(([x, y]) => [X(x), y]);
    g.fillPolygon(pts, VELVET, { aa: true });
    // the folds: dark grooves and a lit ridge, following the gathered shape
    for (const [k, c, a] of [[3, VELVET_D, 0.8], [6.5, VELVET_L, 0.55], [9.5, VELVET_D, 0.6]]) {
      const f = k / 16;
      g.stroke([[X(16 * f), 0], [X(13.5 * f), 12], [X(10 * f), 30], [X((7 + sway) * f), 44], [X((8 + sway) * f), 52], [X(13 * f), 66], [X(15 * f), 80]], 1.2, c, { a, aa: true });
    }
    // the gold tie-back
    g.thickLine(X(0), 46, X(8.5 + sway), 47.5, 2, GOLD, { aa: true });
    g.fillCircle(X(8.5 + sway), 47.8, 1.5, mix(GOLD, 0xffffff, 0.3), { aa: true });
  }
  // a velvet border along the very top: the hands work in front of it
  g.fillRect(0, 0, 160, 2, VELVET_D);
}

// ------------------------------------------------------------ the puppets

/** Local glyph coordinates -> screen, for a puppet's tilt and bow. */
function xform(sl) {
  const p = sl.pose, c = cos(p.tilt), s = sin(p.tilt), cb = cos(p.bow);
  const ox = sl.ox, oy = sl.oy;
  return (x, y) => {
    const yb = 24 - (24 - y) * cb, dy = yb - 12;
    return [ox + x * c - dy * s, oy + 12 + x * s + dy * c];
  };
}

/** Where everything on one puppet is, in screen pixels. */
function rig(sl) {
  const G = GLYPHS[sl.d], T = xform(sl), p = sl.pose;
  const legs = [0, 1].map((k) => {
    const sd = k ? 1 : -1, H = T(...G.hip[k]);
    const a = p.hip[k], phi = p.knee[k] * 1.3;
    let K = [H[0] + 4.5 * sd * sin(a), H[1] + 4.5 * cos(a) * cos(phi)];
    const sa = a * 0.4;
    let F = [K[0] + 4.5 * sd * sin(sa), K[1] + 4.5 * cos(sa)];
    if (F[1] > FLOOR) {             // the foot is on the boards: bend the knee outward
      F = [F[0] + sd * 0.4 * (F[1] - FLOOR), FLOOR];
      const dx = F[0] - H[0], dy = F[1] - H[1], d = Math.sqrt(dx * dx + dy * dy);
      if (d < 9) {
        const h = Math.sqrt(20.25 - d * d / 4), mx = (H[0] + F[0]) / 2, my = (H[1] + F[1]) / 2;
        let nx = -dy / d, ny = dx / d;
        if (nx * sd < 0) { nx = -nx; ny = -ny; }
        K = [mx + nx * h, my + ny * h];
      }
    }
    return { H, K, F, sd };
  });
  const arms = [0, 1].map((k) => {
    const sd = k ? 1 : -1, S = T(...G.sh[k]);
    const [a, b] = p.arm[k];
    const E = [S[0] + 4.5 * sd * sin(a), S[1] + 4.5 * cos(a)];
    const M = [E[0] + 4 * sd * sin(a + b), E[1] + 4 * cos(a + b)];
    return { S, E, M };
  });
  const c = sl.ctrl, cr = cos(c.roll), sr = sin(c.roll), cl = cos(c.leg), sl2 = sin(c.leg);
  const bar = (k) => [c.x + k * cr, c.y + k * sr];
  const legBar = (k) => [c.x + k * cl, c.y + 2.6 + k * sl2];
  return { G, T, legs, arms, bar, legBar, tops: G.top.map(([x, y]) => T(x, y)) };
}

function drawShadow(g, sl, R) {
  const o = 3;
  for (const pc of R.G.pieces) g.stroke(pc.map(([x, y]) => { const q = R.T(x, y); return [q[0] + o, q[1] + o - 1]; }), 5, 0x000000, { a: 0.3 });
}

function drawPuppet(g, sl, R, P) {
  const face = mix(WOOD_DIM, WOOD_LIT, sl.lit), stock = mix(STOCK_DIM[sl.i], STOCK[sl.i], sl.lit);
  // contact shadow on the boards, shrinking as it leaves the floor
  const footY = Math.max(R.legs[0].F[1], R.legs[1].F[1]), gap = clamp(FLOOR - footY, 0, 20);
  if (gap < 16) g.fillEllipse(sl.ox, FLOOR + 1, 9 - gap * 0.4, 1.6, 0x000000, { a: 0.4 * (1 - gap / 16), aa: true });
  // legs: striped stockings on dowel, black shoes
  for (const L of R.legs) {
    g.stroke([L.H, L.K, L.F], 2.2, stock, { aa: true });
    const mx = (L.K[0] + L.F[0]) / 2, my = (L.K[1] + L.F[1]) / 2;
    g.thickLine(mx - 0.9, my, mx + 0.9, my, 1.1, 0xf4ece0, { aa: true, a: 0.85 });   // a stocking stripe
    g.fillCircle(L.K[0], L.K[1], 0.9, PIN, { aa: true });
    g.thickLine(L.F[0], L.F[1], L.F[0] + L.sd * 2, L.F[1] + 0.2, 2.2, SHOE, { aa: true });
  }
  // the plywood numeral: its cut edge, its face, a grain line, brass pins
  for (const pc of R.G.pieces) g.stroke(pc.map(([x, y]) => { const q = R.T(x, y); return [q[0] + 0.8, q[1] + 1]; }), 5, WOOD_EDGE, { aa: true });
  for (const pc of R.G.pieces) g.stroke(pc.map(([x, y]) => R.T(x, y)), 5, face, { aa: true });
  for (const pc of R.G.pieces) g.stroke(pc.map(([x, y]) => { const q = R.T(x, y); return [q[0] + 0.5, q[1] + 0.6]; }), 0.8, WOOD_GRAIN, { aa: true, a: 0.6 });
  for (const [x, y] of R.G.pins) { const q = R.T(x, y); g.fillCircle(q[0], q[1], 1.05, PIN, { aa: true }); }
  // arms: sleeves in the puppet's colour, a brass shoulder pin, white mitts
  for (const A of R.arms) {
    g.stroke([A.S, A.E, A.M], 1.9, stock, { aa: true });
    g.fillCircle(A.S[0], A.S[1], 0.9, PIN, { aa: true });
    g.fillCircle(A.M[0], A.M[1], 1.35, MITT, { aa: true });
  }
  // strings: head to the bar, mitts to the bar ends, knees to the leg bar
  const sc = { aa: true, a: 0.55 };
  g.thickLine(...R.bar(-5), ...R.tops[0], 0.6, STRING, sc);
  g.thickLine(...R.bar(5), ...R.tops[1], 0.6, STRING, sc);
  g.thickLine(...R.bar(-8.5), ...R.arms[0].M, 0.6, STRING, sc);
  g.thickLine(...R.bar(8.5), ...R.arms[1].M, 0.6, STRING, sc);
  g.thickLine(...R.legBar(-5), ...R.legs[0].K, 0.6, STRING, { aa: true, a: 0.4 });
  g.thickLine(...R.legBar(5), ...R.legs[1].K, 0.6, STRING, { aa: true, a: 0.4 });
  // the control: a main bar, a leg bar, a hook loop
  g.thickLine(...R.bar(-9), ...R.bar(9), 2, CTRL, { aa: true });
  g.thickLine(...R.legBar(-5.5), ...R.legBar(5.5), 1.5, CTRL_D, { aa: true });
  g.thickLine(sl.ctrl.x, sl.ctrl.y - 3.2, sl.ctrl.x, sl.ctrl.y, 1, CTRL_D, { aa: true });
}

// ------------------------------------------------------------ the hands

function drawHand(g, hand, side, P) {
  // (x, y) is the grip point: the bar the hand holds. The hand comes down
  // from the puppeteer above: dark sleeve, white shirt cuff, the back of the
  // hand, four fingers outlined so they read apart, and the thumb inside.
  const sd = side ? 1 : -1, x = hand.x, y = hand.y, tl = hand.tilt * 0.5;
  const grip = clamp(hand.grip, 0, 1);
  g.thickLine(x + sd * 9, y - 30, x + sd * 1.5, y - 11, 10, SLEEVE, { aa: true });
  g.thickLine(x + sd * 2, y - 11.5, x + sd * 1.1, y - 9, 9, CUFF, { aa: true });
  g.fillEllipse(x, y - 4.6, 6.6, 4.8, SKIN_SH, { aa: true });            // outline
  g.fillEllipse(x, y - 4.9, 5.9, 4.1, SKIN, { aa: true });
  g.fillEllipse(x - sd * 1.6, y - 6.2, 3, 1.5, mix(SKIN, 0xffffff, 0.22), { aa: true });   // light on the knuckles
  const drum = hand.idle * (P.tod % 7 < 1.4 ? 1 : 0);
  const fingers = [];
  for (let j = 0; j < 4; j++) {
    const bx = x + sd * (-4.6 + j * 3.05), by = y - 2.6 + Math.abs(j - 1.5) * 0.35;
    let len = 6 - 2.6 * grip - (j === 0 ? 1.2 : 0);
    if (drum) len -= 1.8 * Math.max(0, sin(P.tod * 16 - j * 1.1));
    const ang = tl + sd * (j - 1.5) * 0.09 * (1 - grip);
    fingers.push([bx, by, bx + len * sin(ang), by + len * cos(ang)]);
  }
  for (const [ax, ay, bx, by] of fingers) g.thickLine(ax, ay, bx, by, 3.3, SKIN_SH, { aa: true });
  for (const [ax, ay, bx, by] of fingers) g.thickLine(ax, ay, bx, by - 0.2, 2.1, SKIN, { aa: true });
  // the thumb, on the inner side, folded round the bar
  const tx = x + sd * 6.2, ty = y - 5;
  const ex = tx + sd * (0.6 - 1.8 * grip), ey = ty + 4.6;
  g.thickLine(tx, ty, ex, ey, 3.3, SKIN_SH, { aa: true });
  g.thickLine(tx, ty, ex, ey - 0.2, 2.1, mix(SKIN, SKIN_SH, 0.2), { aa: true });
}

// ------------------------------------------------------------ the frame

export default {
  name: 'Marionette',
  blurb: 'Plywood numerals on strings, worked by a puppeteer\'s hands; at the minute the changing one is flown out and the new one lowered in.',
  fps: 60,
  frame(g, ctx) {
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    const P = plan(ctx.date, ctx.night);
    g.fillRect(0, 0, 160, CLOTH_TOP, FLIES);
    drawCloth(g, P);
    drawFloor(g, P);

    // follow-spots: a pool on the cloth and boards behind each working puppet
    for (const sl of P.slots) {
      const k = sl.lit * clamp((sl.oy + 30) / 30, 0, 1);   // the spot follows a puppet up and out
      if (k < 0.02) continue;
      const cx = sl.ox, cy = Math.max(sl.oy, 18) + 18;
      // the beam down from the flies, the pool on the cloth, the pool on the boards
      g.fillPolygon([[cx - 5, CLOTH_TOP], [cx + 5, CLOTH_TOP], [cx + 17, FLOOR + 2], [cx - 17, FLOOR + 2]], SPOT, { a: 0.07 * k, aa: true });
      g.fillEllipse(cx, cy, 15.5, 27, SPOT, { a: 0.13 * k, aa: true });
      g.fillEllipse(cx, cy, 13, 24.5, SPOT, { a: 0.13 * k, aa: true });
      g.fillEllipse(cx, FLOOR + 0.5, 17, 3.6, SPOT, { a: 0.3 * k, aa: true });
    }

    const rigs = P.slots.map((sl) => (sl.show ? rig(sl) : null));
    g.clip(0, CLOTH_TOP, 160, CLOTH_BOT - CLOTH_TOP);
    P.slots.forEach((sl, k) => { if (rigs[k]) drawShadow(g, sl, rigs[k]); });
    g.unclip();

    // the leaning rail with its hooks
    const r = P.rail, ry0 = railY(r, 6), ry1 = railY(r, 154);
    g.thickLine(6, ry0, 154, ry1, 2.6, RAIL, { aa: true });
    g.thickLine(6, ry0 - 0.8, 154, ry1 - 0.8, 0.8, RAIL_L, { aa: true });
    for (const x of SLOT_X) { const hy = railY(r, x); g.thickLine(x, hy + 1, x, hy + 1.8, 1, hex('9a9088'), { aa: true }); }

    // the colon: a seconds pendulum, two beads on one thread
    const py = railY(r, COLON_X) + 1, a = P.colon;
    const bead = (L) => [COLON_X + L * sin(a), py + L * cos(a)];
    const b1 = bead(33), b2 = bead(45), b3 = bead(47);
    g.thickLine(COLON_X, py, ...b3, 0.6, STRING, { aa: true, a: 0.55 });
    for (const [bx, by] of [b1, b2]) {
      g.fillCircle(bx + 1.2, by + 1.6, 2.4, 0x000000, { a: 0.25, aa: true });
      g.fillCircle(bx, by, 2.4, mix(STOCK[0], VELVET, 0.3), { aa: true });
      g.fillCircle(bx - 0.7, by - 0.8, 0.8, 0xffd8c8, { aa: true, a: 0.8 });
    }

    // the troupe, then the hands in front of the rail
    P.slots.forEach((sl, k) => { if (rigs[k]) drawPuppet(g, sl, rigs[k], P); });
    P.hands.forEach((h, k) => drawHand(g, h, k, P));
    drawCurtains(g, P);
  },
};
