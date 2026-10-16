// Rube Goldberg: Professor Butts' Self-Operating Timepiece.
//
// A Sunday-newspaper cartoon panel of 1931: cream newsprint, a pale blue
// Ben-Day tint on the wall, black pen line, flat red/yellow/blue inks. In the
// middle two show cards hang from a beam on rings, hand-lettered with red
// drop shadows: the hour and the minute. Around them, round all four edges of
// the panel, runs a machine whose only job is to turn the minute card over.
//
// The chain reaction goes clockwise round the frame and takes exactly one
// minute, so where it is IS the second hand: it starts at the top centre at
// :00, passes the top-right corner at :07, the right middle at :15, the
// bottom-right corner at :22, the bottom middle at :30 and so on, and arrives
// back at the top centre at :60, where it yanks the card.
//
//   :00 a marble pours from the bucket (A) down the rail (B) into the cup of
//   a seesaw (C), which knocks the trapdoor of a birdcage (D). The canary (E)
//   flutters down onto a lever, which lifts a candle (F) under a string; the
//   string smoulders and snaps, the iron weight (G) drops, CLANK, onto a
//   springboard (H) that tips a row of dominoes (I), the last of which sets a
//   bowling ball (J) rolling to a pair of scissors (K), SNIP, which free a
//   balloon (L). The balloon rises up the left edge, nudges the stop-peg off
//   the top rail, and POPs on a tack; the marble rolls along the top into the
//   bucket, the bucket sinks onto the beam, and at :00 the minute card flips
//   over its rings to show the new minute.
//
// Behind the front, each part quietly resets itself half a minute later (the
// canary flies home, the weight is hauled back up, the dominoes stand up in a
// ripple, a new balloon is filled from the gas bottle), so the machine is
// always ready and something is always moving.
//
// The hour: both cards go over, the hour card a beat after the minute, and a
// flock of canaries bursts out from behind the beam.
//
// Palette: four newspaper inks on newsprint (ink, red, yellow, blue) plus wood,
// iron and the card's white. Everything is hard pixels: it is a print.
// Cost: a prebuilt page (one copy), cached card faces, ~60 kit shapes.
import { clamp, ease, rand, sin, cos, mix, font3x5, clockFields, previousMinute } from '../js/kit.js';
import {
  PAGE, INK, PAPER, WOOD, WOOD_LT, RED, YELLOW, ORANGE, BLUE, BLUE_LT, IRON, STEEL, SMOKE, CREAM,
  FLOOR_Y, HOUR_X, MIN_X, CARD_Y, railL, railR, PULLEY_T, PULLEY_W, NAIL, STRING_Y,
  plank, ball, poly, rot, BIRD_UP, BIRD_DOWN, BIRD_SIT, BIRD_PECK, NOTE,
} from './rubegoldberg-scene.js';
import { cardFace, cardBack, CW, CH } from './rubegoldberg-glyphs.js';

const P = (s, a, b) => clamp((s - a) / (b - a), 0, 1);
const lerp = (a, b, u) => a + (b - a) * u;

// ------------------------------------------------------------ the timetable (seconds into the minute)

const T = {
  bucketLand: 59.55, bucketSink: 59.8, tip0: 60.25, tip1: 60.7, pour: 60.75, bucketBack: 61.9,
  rollR: 0.75, cup: 7.0, seesaw: 7.4, trap: 7.7,
  fly0: 7.9, fly1: 13.4, lever: 13.9, burn0: 14.2, snap: 22.0, land: 22.55, board: 22.75,
  domino0: 22.75, dominoStep: 0.6, dominoDur: 0.55,
  ballGo: 27.3, ballStop: 37.8, snip: 38.0, rise0: 38.3, nudge: 51.4, pop: 51.8,
  rollL: 51.8, intoBucket: 59.45,
  // resets
  seesawBack: 40.0, flyHome0: 40.0, flyHome1: 43.0, trapShut: 43.3, haul0: 41.0, haul1: 44.0,
  marbleOut: 44.0, stand0: 45.0, ballBack0: 47.5, ballBack1: 50.5, pegBack: 55.0, scissorsOpen: 2.0, fill0: 2.4, fill1: 5.0,
};

// ------------------------------------------------------------ parts

function seesawAngle(s) {
  // > 0: left end up. Rest left-up, tipped by the marble, back at the reset.
  const up = 0.2, down = -0.3;
  if (s < T.cup) return up;
  if (s < T.seesawBack) return lerp(up, down, ease.outBounce(P(s, T.cup, T.seesaw)));
  return lerp(down, up, ease.inOutQuad(P(s, T.seesawBack, T.seesawBack + 0.5)));
}
const SEE = [139, 14], SEE_L = 11;

function seesawEnds(a) {
  const c = Math.cos(a), sn = Math.sin(a);
  return [[SEE[0] - SEE_L * c, SEE[1] - SEE_L * sn], [SEE[0] + SEE_L * c, SEE[1] + SEE_L * sn]];
}

function leverAngle(s) {
  // candle lever, > 0: left end (the perch) down, candle up
  if (s < T.fly1) return 0;
  if (s < T.flyHome0) return 0.48 * ease.outBack(P(s, T.fly1, T.lever));
  return 0.48 * (1 - ease.inOutQuad(P(s, T.flyHome0, T.flyHome0 + 0.4)));
}
const LEV = [141, 38], LEV_L = 8;
function leverEnds(a) {
  const c = Math.cos(a), sn = Math.sin(a);
  return [[LEV[0] - LEV_L * c, LEV[1] + LEV_L * sn], [LEV[0] + LEV_L * c, LEV[1] - LEV_L * sn]];
}

function weightTop(s) {
  if (s < T.snap) return 26;
  if (s < T.land) { const u = P(s, T.snap, T.land); return 26 + 37 * u * u; }
  if (s < T.haul0) return 63 + 4 * P(s, T.land, T.board);
  if (s < T.haul1) return lerp(67, 26, ease.inOutQuad(P(s, T.haul0, T.haul1)));
  return 26;
}

function boardAngle(s) {
  // springboard, > 0: right end up (rest); the weight slams it the other way
  const up = 0.24, down = -0.24;
  if (s < T.land) return up;
  if (s < T.haul0) return lerp(up, down, ease.outBack(P(s, T.land, T.board)));
  return lerp(down, up, P(s, T.haul0, T.haul0 + 0.3));
}

const DOMINOES = 8;
const dominoX = (i) => 121 - 5 * i;
function dominoAngle(i, s) {
  const max = i === DOMINOES - 1 ? 1.25 : 0.98;
  const t0 = T.domino0 + T.dominoStep * i;
  if (s < t0) return 0;
  const back = T.stand0 + 0.22 * (DOMINOES - 1 - i);
  if (s < back) {
    const u = P(s, t0, t0 + T.dominoDur);
    return max * u * u;
  }
  return max * (1 - ease.outQuad(P(s, back, back + 0.3)));
}

function ballX(s) {
  if (s < T.ballGo) return 82;
  if (s < T.ballStop) { const u = P(s, T.ballGo, T.ballStop); return 82 - 46 * (0.75 * u + 0.25 * (1 - (1 - u) * (1 - u))); }
  if (s < T.ballBack0) return 36 + 1.2 * Math.sin(P(s, T.ballStop, T.ballStop + 0.3) * Math.PI);
  return lerp(36, 82, ease.inOutQuad(P(s, T.ballBack0, T.ballBack1)));
}

function scissorsOpen(s) {
  // 1 open, 0 shut
  if (s < T.scissorsOpen) return 0;
  if (s < T.ballStop) return ease.outBack(P(s, T.scissorsOpen, T.scissorsOpen + 0.4));
  return 1 - P(s, T.ballStop, T.snip);
}

// The balloon: centre, radius, or null.
function balloon(s) {
  if (s < T.fill0) return null;
  if (s < T.rise0) {
    const k = ease.outQuad(P(s, T.fill0, T.fill1));
    const bob = 0.6 * sin(s * 2.1);
    return { x: 16 + bob * 0.5, y: 60 - 6 * k + bob * 0.3, r: 0.6 + 4 * k, tied: s < T.snip };
  }
  if (s < T.pop) {
    const u = P(s, T.rise0, T.pop);
    const e = u < 0.08 ? (u * u) / 0.16 : u - 0.04;
    return { x: 16 + 6 * u + 1.4 * sin(u * 11), y: 54 - 36.5 * (e / 0.96), r: 4.6, tied: false };
  }
  return null;
}

function pegDown(s) {
  if (s < T.nudge) return 0;
  if (s < T.pegBack) return ease.outQuad(P(s, T.nudge, T.pop));
  return 1 - P(s, T.pegBack, T.pegBack + 0.3);
}

// The marble: where it is, or null when it is in the pipe.
function marble(s) {
  const cw = s < 30 ? s + 60 : s;
  if (cw >= T.intoBucket && cw < T.bucketLand) {
    const u = P(cw, T.intoBucket, T.bucketLand);
    return [lerp(77, 80, u), railL(77) - 2.5 + 4 * u * u, 2];
  }
  if (cw >= T.bucketLand && cw < T.pour) {
    const b = bucketPose(s);
    if (cw < T.tip0) return [80, 6.5 + b.dy, 2, false, true];
    const u = P(cw, T.tip0, T.pour);
    return [lerp(80, 86, u), lerp(6.5 + b.dy, railR(86) - 2.5, u) - 2 * Math.sin(u * Math.PI), 2, false, true];
  }
  if (s >= T.rollR && s < T.cup) {
    const u = P(s, T.rollR, T.cup);
    const x = 86 + 42.5 * (0.45 * u + 0.55 * u * u);
    return [x, railR(x) - 2.5, 2];
  }
  if (s >= T.cup && s < T.seesawBack) {
    const [l] = seesawEnds(seesawAngle(s));
    return [l[0] + 0.5, l[1] - 2.6, 2];
  }
  if (s >= T.seesawBack && s < T.seesawBack + 0.6) {
    const u = P(s, T.seesawBack, T.seesawBack + 0.6);
    return [128.5, 10 + 9 * u * u, 2, true];
  }
  if (s >= T.marbleOut && s < T.rollL) {
    const u = P(s, T.marbleOut, T.marbleOut + 1);
    const x = -3 + 10.5 * ease.outBack(u);
    return [x, railL(x) - 2.5, 2];
  }
  if (s >= T.rollL && s < T.intoBucket) {
    const u = P(s, T.rollL, T.intoBucket);
    const x = 7.5 + 69.5 * (0.35 * u + 0.65 * u * u);
    return [x, railL(x) - 2.5, 2];
  }
  return null;
}

function bucketPose(s) {
  const cw = s < 30 ? s + 60 : s;
  let dy = 0, tip = 0;
  if (cw >= T.bucketLand && cw < T.bucketBack + 0.8) {
    dy = 1.5 * ease.outBack(P(cw, T.bucketLand, T.bucketSink)) * (1 - ease.inOutQuad(P(cw, T.bucketBack, T.bucketBack + 0.8)));
    tip = 0.95 * ease.inOutQuad(P(cw, T.tip0, T.tip1)) * (1 - ease.inOutQuad(P(cw, T.pour + 0.2, T.bucketBack)));
  }
  return { dy, tip };
}

// ------------------------------------------------------------ drawing

function drawBucket(g, s) {
  const { dy, tip } = bucketPose(s);
  const piv = [83.5, 13.5 + dy];
  const pts = [[76.5, 7 + dy], [83.5, 7 + dy], [82.5, 13.5 + dy], [77.5, 13.5 + dy]].map(([x, y]) => rot(x, y, piv[0], piv[1], tip));
  const rim = rot(80, 7 + dy, piv[0], piv[1], tip);
  g.line(PULLEY_T[0] - 1, PULLEY_T[1] + 1, Math.round(rim[0]) - 1, Math.round(rim[1]) - 2, INK);
  g.line(Math.round(pts[0][0]), Math.round(pts[0][1]), Math.round(rim[0]), Math.round(rim[1]) - 2, INK);
  g.line(Math.round(pts[1][0]), Math.round(pts[1][1]) - 1, Math.round(rim[0]), Math.round(rim[1]) - 2, INK);
  poly(g, pts, BLUE);
  const band = [rot(77, 9 + dy, piv[0], piv[1], tip), rot(83, 9 + dy, piv[0], piv[1], tip)];
  g.line(Math.round(band[0][0]), Math.round(band[0][1]), Math.round(band[1][0]), Math.round(band[1][1]), BLUE_LT);
}

function drawSeesaw(g, s) {
  const [l, r] = seesawEnds(seesawAngle(s));
  plank(g, l[0], l[1], r[0], r[1], 1, WOOD);
  // cup on the left end
  poly(g, [[l[0] - 2.5, l[1] - 3.5], [l[0] + 3, l[1] - 3.5], [l[0] + 2, l[1] - 0.5], [l[0] - 1.5, l[1] - 0.5]], RED);
}

function drawCage(g, s, birdInside, f) {
  // hook, dome, bars
  g.vline(152, 0, 2, INK);
  g.fillRect(147, 3, 11, 8, CREAM);
  for (let x = 147; x <= 157; x += 5) g.vline(x, 3, 8, INK);
  g.hline(148, 2, 9, INK); g.pixel(147, 3, INK); g.pixel(157, 3, INK);
  g.hline(148, 10, 9, IRON);
  if (birdInside) {
    const hop = Math.floor(s * 1.6) % 3 === 0 ? 1 : 0;
    g.blit(hop ? BIRD_PECK : BIRD_SIT, 149, 3 + hop - (hop ? 1 : 0), { flipX: Math.floor(s / 4) % 2 === 1 });
  }
  for (const x of [149.5, 154.5]) g.pixel(x, 4, INK);
  // the trapdoor, hinged at the right
  let open = 0;
  if (s >= T.seesaw && s < T.trapShut + 0.3) open = ease.outBounce(P(s, T.seesaw, T.trap)) * (1 - P(s, T.trapShut, T.trapShut + 0.3));
  const a = 1.35 * open;
  const end = [157 - 10 * Math.cos(a), 11 + 10 * Math.sin(a)];
  g.thickLine(157.5, 11.5, end[0] + 0.5, end[1] + 0.5, 1.6, INK);
}

function birdPathOut(u) {
  // from the cage door down to the perch on the candle lever
  const x = lerp(151, 133, u) + 6 * sin(u * Math.PI * 2.2) * (1 - u);
  const y = lerp(12, 34, u) - 5 * sin(u * Math.PI) + 2 * sin(u * Math.PI * 4);
  return [x, y];
}

function drawBird(g, s, f) {
  // returns true when it is in the cage
  let pos, mode, flip = false;
  if (s < T.fly0 || s >= T.flyHome1) return true;
  if (s < T.fly1) { pos = birdPathOut(P(s, T.fly0, T.fly1)); mode = 'fly'; }
  else if (s < T.flyHome0) {
    const [l] = leverEnds(leverAngle(s));
    pos = [l[0] + 1, l[1] - 7.5];
    mode = 'sit'; flip = true;
  } else {
    const u = P(s, T.flyHome0, T.flyHome1);
    pos = birdPathOut(1 - u); mode = 'fly'; flip = true;
  }
  if (mode === 'fly') {
    const up = Math.floor(s * 12) % 2 === 0;
    g.blit(up ? BIRD_UP : BIRD_DOWN, pos[0] - 4, pos[1] - 3, { flipX: flip });
  } else {
    const peck = Math.floor(s * 2.5) % 4 === 0;
    g.blit(peck ? BIRD_PECK : BIRD_SIT, pos[0] - 3, pos[1], { flipX: flip });
  }
  return false;
}

function drawLeverCandle(g, s) {
  const a = leverAngle(s);
  const [l, r] = leverEnds(a);
  plank(g, l[0], l[1], r[0], r[1], 1, WOOD);
  // candle on the right end
  const cx = r[0] - 1, by = r[1] - 1;
  g.fillRect(Math.round(cx - 2), Math.round(by - 8), 5, 8, INK);
  g.fillRect(Math.round(cx - 1), Math.round(by - 7), 3, 7, RED);
  g.pixel(Math.round(cx - 1), Math.round(by - 6), CREAM); g.pixel(Math.round(cx - 1), Math.round(by - 5), CREAM);
  const tip = by - 8;
  g.pixel(Math.round(cx), Math.round(tip), INK);
  const fl = 0.6 * sin(s * 23) + 0.4 * sin(s * 37 + 1);
  const h = 4.2 + 0.8 * fl + (s >= T.burn0 && s < T.snap ? 0.8 : 0);
  g.fillCircle(cx + 0.5, tip - h / 2 + 0.5, 4.5, YELLOW, { a: 0.18 });
  g.fillEllipse(cx + 0.5, tip - h / 2 + 0.2, 1.6, h / 2 + 0.3, YELLOW);
  g.fillEllipse(cx + 0.5, tip - 0.6, 0.9, 1.3, ORANGE);
  return [cx, tip - h];
}

function drawStringWeight(g, s, flameAt) {
  const wt = weightTop(s);
  const wx = PULLEY_W[0] + 2.5;
  const burnX = 148;
  if (s < T.snap || s >= T.haul1) {
    g.line(NAIL[0], NAIL[1], PULLEY_W[0], STRING_Y, INK);
    if (s >= T.burn0 && s < T.snap) {
      // smouldering: a glowing knot, then smoke
      const k = P(s, T.burn0, T.snap);
      const glow = (Math.floor(s * 8) % 2 ? ORANGE : RED);
      g.pixel(burnX, STRING_Y, k > 0.3 ? glow : INK);
      if (k > 0.6) g.pixel(burnX + 1, STRING_Y, glow);
      for (let j = 0; j < 3; j++) {
        const ph = (s * 0.9 + j / 3) % 1;
        g.fillCircle(burnX + 0.5 + 2.5 * sin(ph * 6 + j), STRING_Y - 1 - ph * 11, 0.8 + ph * 1.6, SMOKE, { a: 0.55 * (1 - ph) * Math.min(1, k * 4) });
      }
    }
  } else {
    // snapped: the left end hangs from the nail
    const u = P(s, T.snap, T.snap + 0.6);
    const sw = 2 * Math.sin(u * 7) * (1 - u);
    g.line(NAIL[0], NAIL[1], Math.round(NAIL[0] + 4 * (1 - u) + sw), Math.round(NAIL[1] + 9 * u + 1), INK);
    if (s < T.haul0 && s < T.snap + 0.35) {
      const v = P(s, T.snap, T.snap + 0.35);
      g.line(Math.round(lerp(burnX, PULLEY_W[0], v)), STRING_Y, PULLEY_W[0], STRING_Y, INK);
    }
  }
  // rope from the pulley down to the weight
  if (s < T.snap || s >= T.haul0) g.line(Math.round(wx), PULLEY_W[1], Math.round(wx), Math.round(wt) - 1, INK);
  else if (s < T.land) g.line(Math.round(wx), Math.round(Math.max(PULLEY_W[1], wt - 10)), Math.round(wx), Math.round(wt) - 1, INK);
  else { // a coil of slack rope on top of the weight
    g.line(Math.round(wx), Math.round(wt) - 1, Math.round(wx) - 2, Math.round(wt) - 3, INK);
    g.line(Math.round(wx) - 2, Math.round(wt) - 3, Math.round(wx) + 1, Math.round(wt) - 4, INK);
  }
  // the iron weight
  poly(g, [[wx - 2, wt], [wx + 2, wt], [wx + 3, wt + 6], [wx - 3, wt + 6]], IRON);
  g.pixel(Math.round(wx) - 1, Math.round(wt) + 2, STEEL);
}

function drawBoard(g, s) {
  const a = boardAngle(s);
  const c = Math.cos(a), sn = Math.sin(a);
  const L = 13, py = 70.5;
  plank(g, 142 - L * c, py + L * sn, 142 + L * c, py - L * sn, 1, WOOD_LT);
}

function drawDomino(g, i, s) {
  const x = dominoX(i), a = -dominoAngle(i, s);
  const base = [x, FLOOR_Y];
  const pts = [[x, FLOOR_Y], [x + 3, FLOOR_Y], [x + 3, FLOOR_Y - 10], [x, FLOOR_Y - 10]].map(([px, py]) => rot(px, py, base[0], base[1], a));
  g.fillPolygon(pts, INK);
  for (const [px, py] of [[x + 1.5, FLOOR_Y - 7.5], [x + 1.5, FLOOR_Y - 2.5]]) {
    const q = rot(px, py, base[0], base[1], a);
    g.pixel(q[0], q[1], CREAM);
  }
}

function drawScissors(g, s) {
  const o = scissorsOpen(s);
  const pv = [23, 69], open = 0.42 * o;
  for (const sg of [-1, 1]) {
    const ang = sg * open;
    const tip = rot(pv[0] - 11, pv[1], pv[0], pv[1], ang);
    const back = rot(pv[0] - 3, pv[1] + sg * 1.5, pv[0], pv[1], ang);
    poly(g, [[pv[0], pv[1]], tip, back], STEEL);
    const ringC = rot(pv[0] + 6, pv[1] + sg * 2.2, pv[0], pv[1], -ang * 0.6);
    g.thickLine(pv[0], pv[1], ringC[0], ringC[1], 1, INK);
    g.fillCircle(ringC[0], ringC[1], 2.2, INK);
    g.fillCircle(ringC[0], ringC[1], 1.2, RED);
  }
  g.pixel(pv[0], pv[1], STEEL);
}

function drawBalloon(g, s) {
  // tether stub (cut) or whole
  const b = balloon(s);
  const cut = s >= T.snip || s < T.fill0;
  if (cut && s >= T.snip) g.vline(16, 70, 3, INK);
  if (!b) return;
  const knotY = b.y + b.r + 1.4;
  if (b.tied) g.line(16, 72, Math.round(b.x), Math.round(knotY), INK);
  else {
    // a trailing string that waves
    for (let k = 0; k < 9; k++) g.pixel(b.x + 1.2 * sin(s * 6 + k * 0.9) * (k / 9), knotY + k, INK);
  }
  g.fillEllipse(b.x, b.y, b.r + 1, b.r * 1.2 + 1, INK);
  g.fillEllipse(b.x, b.y, b.r, b.r * 1.2, RED);
  if (b.r > 2) { g.pixel(b.x - b.r * 0.4, b.y - b.r * 0.6, CREAM); g.pixel(b.x - b.r * 0.4 + 1, b.y - b.r * 0.6, CREAM); }
  g.fillPolygon([[b.x - 1, knotY], [b.x + 1, knotY], [b.x, knotY - 1.6]], RED);
}

function drawPeg(g, s) {
  const d = pegDown(s);
  const piv = [16, 11.5], a = -0.42 * d;   // arm end up = negative rotation
  const L = rot(9, 11.5, piv[0], piv[1], a), R = rot(25, 12.5, piv[0], piv[1], a);
  g.line(Math.round(L[0]), Math.round(L[1]), Math.round(R[0]), Math.round(R[1]), INK);
  g.fillRect(Math.round(L[0]), Math.round(L[1]) - 6, 2, 6, INK);
  g.fillRect(Math.round(R[0]) - 1, Math.round(R[1]) - 1, 3, 2, RED);
  g.pixel(piv[0], piv[1], STEEL);
}

function drawPipe(g) {
  g.fillRect(0, 2, 5, 6, INK);
  g.fillRect(1, 3, 3, 4, STEEL);
}

// A comic sound effect: a jagged yellow burst with lettering, popping in.
function burst(g, cx, cy, text, age) {
  if (age < 0 || age > 0.7) return;
  const k = age < 0.08 ? age / 0.08 : 1;
  const w = text.length * 4 + 5, h = 11;
  const pts = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = (i % 2 ? 0.62 : 1) * k;
    pts.push([cx + Math.cos(a) * (w / 2 + 3) * rr, cy + Math.sin(a) * (h / 2 + 3) * rr]);
  }
  poly(g, pts, YELLOW);
  if (k >= 1) g.text(text, cx - (text.length * 4 - 1) / 2, cy - 2, { font: font3x5, c: INK });
}

// A card, or a card going over its rings (th 0..1.5 pi) to show `next`
// beneath. th = pi/2 (the page edge-on, the new card fully shown) falls on :00.
function drawCard(g, x, cur, next, th) {
  if (th <= 0) { g.draw(cardFace(cur), x, CARD_Y); return; }
  g.draw(cardFace(next), x, CARD_Y);
  if (th >= 1.5 * Math.PI) return;
  const c = Math.cos(th);
  const h = Math.round(Math.abs(c) * CH);
  if (h < 1) return;
  const src = c > 0 ? cardFace(cur) : cardBack();
  for (let r = 0; r < h; r++) {
    const sr = Math.min(CH - 1, Math.floor(((r + 0.5) / h) * CH));
    const y = c > 0 ? CARD_Y + r : CARD_Y - 1 - r;
    g.clip(x, y, CW, 1);
    g.draw(src, x, y - sr);
    g.unclip();
  }
}

// The page angle at second `s`: falls from :59.7, edge-on at :00, over by :00.6.
function flipAngle(s) {
  if (s >= 59.7) { const u = P(s, 59.7, 60); return (Math.PI / 2) * u * u; }
  if (s < 0.6) { const u = P(s, 0, 0.6); return Math.PI / 2 + Math.PI * (1 - (1 - u) * (1 - u)); }
  return 0;
}

function drawRings(g) {
  for (const x0 of [HOUR_X, MIN_X])
    for (const dx of [10, 31]) { g.rect(x0 + dx - 1, 15, 3, 7, INK); g.vline(x0 + dx, 16, 5, STEEL); }
  g.rect(79, 15, 3, 7, INK); g.vline(80, 16, 5, STEEL);
}

// The hour flock: canaries burst from behind the beam.
function drawFlock(g, age) {
  if (age < 0 || age > 4) return;
  for (let j = 0; j < 7; j++) {
    const a = -Math.PI / 2 + (j - 3) * 0.42 + 0.2 * (rand(j, 7) - 0.5);
    const v = 34 + 14 * rand(j, 3);
    const x = 80 + Math.cos(a) * v * age * 0.9 + 3 * sin(age * 5 + j), y = 22 + Math.sin(a) * v * age * 0.45 + 3 * sin(age * 4 + j * 2);
    const up = Math.floor(age * 12 + j) % 2 === 0;
    g.blit(up ? BIRD_UP : BIRD_DOWN, x - 4, y - 3, { flipX: Math.cos(a) > 0 });
  }
}

export default {
  name: 'Rube Goldberg',
  blurb: 'A 1930s newspaper cartoon contraption runs once round the panel every minute, a clockwise second hand of marbles, canaries, candles and dominoes, to flip the minute card.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    g.draw(PAGE, 0, 0);

    // right edge: weight, candle lever, canary, cage, seesaw
    const flame = drawLeverCandle(g, s);
    drawStringWeight(g, s, flame);
    const inside = drawBird(g, s, f);
    drawCage(g, s, inside, f);
    drawSeesaw(g, s);

    // bottom: springboard, dominoes, ball, scissors
    drawBoard(g, s);
    for (let i = 0; i < DOMINOES; i++) drawDomino(g, i, s);
    const bx = ballX(s);
    ball(g, bx, FLOOR_Y - 3.5, 3, BLUE, -bx / 3);
    drawScissors(g, s);

    // left: balloon, stop-peg
    drawBalloon(g, s);
    drawPeg(g, s);

    // the marble and the bucket
    const m = marble(s);
    if (m && !m[4]) ball(g, m[0], m[1], m[2] - 0.5, RED, m[0] / 2);
    drawBucket(g, s);
    if (m && m[4]) ball(g, m[0], m[1], m[2] - 0.5, RED, m[0] / 2);
    drawPipe(g);

    // the show cards
    const prev = previousMinute(ctx.date);
    const th = flipAngle(s);
    if (th > 0) {
      // before :00 the page in flight is this minute's, after it the last one's
      const a = s >= 59 ? f : prev, b = s >= 59 ? clockFields(new Date(ctx.date.getTime() + 60000)) : f;
      drawCard(g, HOUR_X, a.hh, b.hh, a.hh !== b.hh ? th : 0);
      drawCard(g, MIN_X, a.mm, b.mm, th);
    } else {
      drawCard(g, HOUR_X, f.hh, f.hh, 0);
      drawCard(g, MIN_X, f.mm, f.mm, 0);
    }
    drawRings(g);
    if (prev.hh !== f.hh) drawFlock(g, s - 0.1);

    // sound effects
    burst(g, 142, 56, 'CLANK', s - T.land);
    burst(g, 28, 58, 'SNIP', s - T.snip);
    burst(g, 22, 22, 'POP!', s - T.pop);
    if (s >= T.pop && s < T.pop + 0.5) {
      const u = P(s, T.pop, T.pop + 0.5);
      for (let j = 0; j < 5; j++) g.fillRect(22 + Math.cos(j * 1.3) * 10 * u, 15 + Math.sin(j * 1.3) * 7 * u + 6 * u * u, 2, 1, RED);
    }
    // the canary sings in its cage now and then
    if (inside) {
      const ph2 = (s % 6) / 6;
      if (ph2 < 0.4) g.blit(NOTE, 142 - 6 * ph2, 6 - 10 * ph2);
    }
  },
};
