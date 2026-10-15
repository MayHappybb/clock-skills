// Urwerk — wandering hours, after URWERK's satellite watches (UR-105, UR-110).
//
// Studied from photographs of the UR-105 and UR-110: no hour hand and no
// minute hand. A carousel under a ribbed bridge carries hour satellites; the
// one on duty rides a 0-60 minute arc over its hour, its arrow-shaped
// pointer (the UR-110's "torpedo") showing the minutes, and as it leaves at
// 60 the next one arrives at 0. Out of service the satellites turn, by a
// Maltese cross, to present the numeral they will need next time round.
//
// Here: three cubes, four numerals each (cube k carries the hours h with
// h % 3 == k), hung on forked titanium arms from a hub under the bridge.
// Planetary gearing keeps them level, so the numeral is always upright. The
// carousel is seen tilted (circles on it are ellipses), which fits a
// 120-degree arc into 64 rows and gives depth: cubes on the far side are
// smaller and go out over the top edge. The scale reads left to right
// (the watch's runs right to left): a tick every five minutes, big 15, 30,
// 45, a boxed 60, and a dot for every minute of the hour already used, so
// the bare stretch ahead of the pointer is the time left. Below left, a
// turbine turning once a minute is the seconds; below right, AM / PM.
//
// The numerals are drawn for this face, after the squared lettering URWERK
// uses: 17 px tall, 4 px stems, 3 px bars, rounded-square outside, square
// counters inside (out/urwerk-digits.png).
//
// Each minute: a pulse of light runs up the used dots from 0 to the pointer,
// the newest dot pops out long and settles, and the cube's detent clicks (a
// small roll of the cube and a rock back). The pointer glides continuously
// (2 degrees a minute, from fields.sec).
//
// The hour, the carousel moment: over the last 0.35 s of :59 the blind comes
// down over the hour that is ending. At :00 the whole carousel makes one
// extra revolution in 2.4 s, the three blind cubes tumbling as they fly
// round (the old one rolls one face further, to its next numeral), the
// pointers sweep the used hour off the scale, the detent catches with a
// spring, and the new hour's blind goes up at 0. While a blind is down no
// hour shows at all, so no instant shows a wrong one.
//
// Everything is from the clock: the carousel angle from m + sec/60, the
// turn from fields.sec at m = 0 and 59; nothing is remembered.
//
// Burn-in: the carousel turns 120 degrees an hour, so the arms and cubes
// travel; the scale, bridge and corners walk a 2 px orbit every 3 minutes;
// the minute dots fill and empty every hour. Night (ctx.night) dims the
// panel through oled.contrast().

import { dither, clamp, lerp, progress, orbit, sprite, ease, font3x5, OFF, ON } from '../js/kit.js';

const D2R = Math.PI / 180;

// ------------------------------------------------------------ geometry
//
// The carousel's hub is under the ribbed bridge at the top. Three
// satellites hang from it on forked arms; the 0-60 minute scale is a
// 120-degree arc round the bottom. The carousel is seen tilted, so every
// circle on it is an ellipse squashed by TILT: that buys the height a true
// 120-degree arc would need, and reads as depth. Angles are measured from
// straight down, positive to the right: the hours travel left to right,
// which reads more easily than the UR-105's right-to-left.

const HX = 64, HY = 7;                // hub
const TILT = 0.72;                    // vertical squash of the carousel plane
const SPAN = 120 * D2R;               // the minute arc
const R_CUBE = 36;                    // satellite centres
const R_TIP = 59;                     // pointer tip
const R_DOT = 62.5;                   // the minute dots
const R_LABEL = 70.5;                 // scale numerals
const FACE_W = 25, FACE_H = 21;       // a satellite cube's front face
const GLYPH_H = 17;

const minuteAngle = (m) => -SPAN / 2 + (SPAN * m) / 60;
const at = (r, a, ox = 0, oy = 0) => [HX + ox + r * Math.sin(a), HY + oy + TILT * r * Math.cos(a)];

// ------------------------------------------------------------ type
//
// The hour numerals engraved on the cubes: a squared industrial face in the
// spirit of the Arame lettering URWERK uses. 17 px tall, 12 wide, 4 px stems
// and 3 px bars, square counters, the lower bowl taller than the upper, and
// every convex outer corner knocked off so the shapes are rounded-square,
// not blocky. Each digit is spelled as rows of a few kinds (full bar, left
// stem, right stem, both stems) and the corners are rounded by rule, so the
// set stays consistent. Nothing here is a kit font.

const GW = 12;
const ROW = {
  F: '############', L: '####........', R: '........####', B: '####....####',
  M: '...#########', // the 3's shorter middle bar
};
const spell = (code) => [...code].map((c) => ROW[c]);
const DIGIT_ROWS = {
  //        top  upper mid  lower  bottom
  0: spell('FFF' + 'BBB' + 'BBB' + 'BBBBB' + 'FFF'),
  2: spell('FFF' + 'RRR' + 'FFF' + 'LLLLL' + 'FFF'),
  3: spell('FFF' + 'RRR' + 'MMM' + 'RRRRR' + 'FFF'),
  4: spell('BBB' + 'BBB' + 'FFF' + 'RRRRR' + 'RRR'),
  5: spell('FFF' + 'LLL' + 'FFF' + 'RRRRR' + 'FFF'),
  6: spell('FFF' + 'LLL' + 'FFF' + 'BBBBB' + 'FFF'),
  8: spell('FFF' + 'BBB' + 'FFF' + 'BBBBB' + 'FFF'),
  9: spell('FFF' + 'BBBBB' + 'FFF' + 'RRR' + 'FFF'),
  // The 7 drops its stem on a slant; the 1 has a short flag, thinner than a bar.
  7: [...spell('FFF'), ...Array.from({ length: 14 }, (_, i) => {
    const x = Math.round(8 - (5 * Math.min(i, 9)) / 9);
    return '.'.repeat(x) + '####' + '.'.repeat(GW - 4 - x);
  })],
  1: ['#######', '#######', ...Array(15).fill('...####')],
};

/** Knock off every convex corner pixel: a lit pixel with both neighbours on one corner's two sides unlit. */
function roundCorners(rows) {
  const h = rows.length, w = rows[0].length;
  const lit = (x, y) => x >= 0 && y >= 0 && x < w && y < h && rows[y][x] === '#';
  return rows.map((r, y) => [...r].map((c, x) => {
    if (c !== '#') return '.';
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
      if (!lit(x + dx, y) && !lit(x, y + dy) && !lit(x + dx, y + dy)) return '.';
    return '#';
  }).join(''));
}
const HOUR_DIGIT = Object.fromEntries(Object.entries(DIGIT_ROWS).map(([k, v]) => [k, sprite(roundCorners(v))]));

/** An hour numeral (1..12) as one sprite: digits 2 px apart. */
const HOUR_SPRITE = {};
for (let h = 1; h <= 12; h++) {
  const ds = [...String(h)].map((c) => HOUR_DIGIT[c]);
  const w = ds.reduce((s, d) => s + d.w, 0) + 2 * (ds.length - 1);
  const data = new Uint8Array(w * GLYPH_H);
  let x0 = 0;
  for (const d of ds) {
    for (let y = 0; y < GLYPH_H; y++) for (let x = 0; x < d.w; x++) data[y * w + x0 + x] = d.data[y * d.w + x];
    x0 += d.w + 2;
  }
  HOUR_SPRITE[h] = { w, h: GLYPH_H, data };
}

// The scale's big numerals (15, 30, 45 and the 60): the same face cut at
// 7 px with 2 px stems.
const SCALE_BIG = Object.fromEntries(Object.entries({
  0: ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  1: ['.##', '###', '.##', '.##', '.##', '.##', '.##'],
  3: ['####.', '...##', '...##', '.###.', '...##', '...##', '####.'],
  4: ['##.##', '##.##', '##.##', '#####', '...##', '...##', '...##'],
  5: ['#####', '##...', '##...', '####.', '...##', '...##', '####.'],
  6: ['.####', '##...', '##...', '####.', '##.##', '##.##', '.###.'],
}).map(([k, v]) => [k, sprite(v)]));

function bigText(g, str, cx, cy, c = ON) {
  const ds = [...str].map((ch) => SCALE_BIG[ch]);
  const w = ds.reduce((s, d) => s + d.w, 0) + ds.length - 1;
  let x = Math.round(cx - w / 2);
  const y = Math.round(cy - 3.5);
  for (const d of ds) { g.blit(d, x, y, { c }); x += d.w + 1; }
  return [x - w - 1, y, w, 7];
}

function smallText(g, str, cx, cy, c = ON) {
  const w = font3x5.measure(str);
  const x = Math.round(cx - w / 2), y = Math.round(cy - 2.5);
  g.text(str, x, y, { font: font3x5, c });
  return [x, y, w, 5];
}

// ------------------------------------------------------------ the cube
//
// A satellite is a cube carrying four hour numerals, one per face, held level
// by its planetary gear and rolled a quarter turn about its horizontal axle
// by a Maltese cross. Seen square on, one face shows; mid-roll two faces show,
// each foreshortened by the cosine of its angle, with the numeral squashed
// with its face. A shutter (a ribbed blind, like the bridge's grille) closes
// over the windows of every cube that is not on the minute scale.

const FACE_INSET = 2;   // rows above the numeral on a face

/**
 * Draw a cube centred on (cx, cy). `roll` is in quarter turns (integer =
 * square on; increasing rolls the front face down). `numeralOf(j)` is the
 * sprite on face j, or null. `shut` 0..1 is how far the blinds are drawn.
 */
function drawCube(g0, cx, cy, roll, numeralOf, shut, k = 1, fade = 1) {
  cx = Math.round(cx); cy = Math.round(cy);
  // Far back, a cube fades into the dark of the movement: its lit pixels
  // thin out as an ordered dither.
  const g = fade >= 1 ? g0 : {
    pixel: (x, y, c) => (c === OFF || dither(x, y, fade)) && g0.pixel(x, y, c),
    fillRect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.pixel(x + i, y + j, c); },
  };
  // Far side of the carousel: smaller, and blind (it is always shuttered there).
  const fw = k >= 0.999 ? FACE_W : 2 * Math.round((FACE_W * k - 1) / 2) + 1;
  const fh = k >= 0.999 ? FACE_H : Math.round(FACE_H * k);
  if (k < 0.999) numeralOf = () => null;
  const s = fh / 2, hw = (fw - 1) / 2, boss = k < 0.75 ? 1 : 2;
  const base = Math.floor(roll), phi = (roll - base) * Math.PI / 2;
  const faces = [];
  for (const [j, psi] of [[base, phi], [base + 1, phi - Math.PI / 2]]) {
    const c = Math.cos(psi);
    if (c < 0.06) continue;
    const yc = cy + s * Math.sin(psi);
    faces.push({ j, c, y0: yc - s * c, y1: yc + s * c });
  }
  const top = Math.round(Math.min(...faces.map((f) => f.y0)));
  const bot = Math.round(Math.max(...faces.map((f) => f.y1)));
  // Keyline round the cube and its axle.
  g.fillRect(cx - hw - 1 - boss, top - 1, fw + 2 + 2 * boss, bot - top + 2, OFF);
  // Axle bosses either side, at the roll axis.
  g.fillRect(cx - hw - boss, cy - 1, boss, 3, ON);
  g.fillRect(cx + hw + 1, cy - 1, boss, 3, ON);
  for (const f of faces) {
    const y0 = Math.round(f.y0), y1 = Math.round(f.y1);
    if (y1 <= y0) continue;
    const spr = numeralOf(((f.j % 4) + 4) % 4);
    const nx = cx - Math.floor(spr ? spr.w / 2 : 0);
    const shutRows = Math.round(shut * (y1 - y0 - 2));
    for (let y = y0; y < y1; y++) {
      const edgeRow = y === y0 || y === y1 - 1;
      for (let x = cx - hw; x <= cx + hw; x++) {
        const edgeCol = x === cx - hw || x === cx + hw;
        // Rounded silhouette: knock the outermost corners off.
        if ((y === top || y === bot - 1) && edgeCol) continue;
        if (edgeRow || edgeCol) { g.pixel(x, y, ON); continue; }
        const iy = y - y0 - 1;
        if (iy < shutRows) {
          // The blind: a lit slat every third row.
          if ((iy - shutRows + 999) % 3 === 0 && x > cx - hw + 1 && x < cx + hw - 1 && ((x + y) & 1)) g.pixel(x, y, ON);
          continue;
        }
        // A face turned away from us is metal, not window: hatch it.
        if (f.c < 0.55) { if ((y & 1) === 0 && dither(x, y, 0.5)) g.pixel(x, y, ON); continue; }
        if (!spr) continue;
        const ly = ((y + 0.5 - f.y0) / (f.y1 - f.y0)) * fh - FACE_INSET;
        const ry = Math.floor(ly), rx = x - nx;
        if (ry >= 0 && ry < spr.h && rx >= 0 && rx < spr.w && spr.data[ry * spr.w + rx]) g.pixel(x, y, ON);
      }
    }
  }
}

/**
 * How far a cube's outline is from its centre along the unit direction
 * (ux, uy), counting the axle bosses at the sides.
 */
function cubeReach(ux, uy) {
  const sx = Math.abs(ux), sy = Math.abs(uy);
  return Math.min((FACE_W / 2 + 2) / (sx || 1e-6), (FACE_H / 2) / (sy || 1e-6));
}

// ------------------------------------------------------------ the carousel

/**
 * One arm of the carousel, from the hub out to its satellite at angle a: a
 * tapering titanium spoke (lit edges, a dithered face anchored to the arm,
 * a lightening slot) that forks into two prongs holding the cube's axle.
 */
function drawArm(g, a, ox, oy, fade = 1) {
  const [hx, hy] = [HX + ox, HY + oy];
  const [cx, cy] = at(R_CUBE, a, ox, oy);
  const rc = [Math.round(cx), Math.round(cy)];
  const [fx, fy] = at(R_CUBE - 15, a, ox, oy);       // the fork
  const L = Math.hypot(fx - hx, fy - hy) || 1;
  const ux = (fx - hx) / L, uy = (fy - hy) / L;
  const ax = Math.round(fx), ay = Math.round(fy);
  const box = [Math.min(hx, fx) - 6, Math.min(hy, fy) - 6, Math.abs(fx - hx) + 12, Math.abs(fy - hy) + 12];
  g.fillWhere((px, py, ix, iy) => {
    const dx = px - hx, dy = py - hy;
    const u = dx * ux + dy * uy, v = Math.abs(dx * uy - dy * ux);
    if (u < 0 || u > L) return false;
    const w = lerp(4.2, 2.6, u / L);
    if (v > w) return false;
    if (v > w - 1) return fade >= 1 || dither(ix, iy, fade); // lit edge
    if (v < 1.1 && u > 6 && u < L - 3) return false; // lightening slot
    return dither(ix - ax, iy - ay, 0.28 * fade);
  }, ON, box);
  if (fade < 0.5) return;
  // The fork: two prongs out to the axle bosses.
  for (const side of [-1, 1]) {
    const bx = rc[0] + side * (FACE_W / 2 + 1.5), by = rc[1] + 0.5;
    g.thickLine(fx, fy, bx, by, 1.8, ON);
  }
  // A nut at the fork.
  g.fillCircle(fx, fy, 2.6, OFF);
  g.ring(fx, fy, 1.2, 2.3, ON);
}

/** The torpedo: a pointer from the cube out to the scale, on a dark keyline. */
function drawPointer(g, a, ox, oy) {
  const [cx0, cy0] = at(R_CUBE, a, ox, oy);
  const cx = Math.round(cx0), cy = Math.round(cy0);
  const [tx, ty] = at(R_TIP, a, ox, oy);
  const L = Math.hypot(tx - cx, ty - cy);
  const ux = (tx - cx) / L, uy = (ty - cy) / L, vx = uy, vy = -ux;
  const r0 = cubeReach(ux, uy) + 0.5;
  if (r0 > L - 3) return;
  const P = (r, w) => [cx + ux * r + vx * w, cy + uy * r + vy * w];
  const len = L - r0;
  const body = [P(r0, -1.6), P(r0 + len * 0.45, -2.7), P(L, 0), P(r0 + len * 0.45, 2.7), P(r0, 1.6)];
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.fillPolygon(body.map(([x, y]) => [x + dx, y + dy]), OFF);
  g.fillPolygon(body, ON);
}

/** The ribbed bridge over the hub, as on the UR-105's front. */
function drawBridge(g, ox, oy) {
  // A narrow plate with chamfered foot over the hub: heavy ribs across its
  // face and a small arrowhead below them, as on the UR-105.
  const x0 = 54 + ox, x1 = 74 + ox, y1 = 13 + oy;
  const P = [[x0, -1], [x1, -1], [x1, y1 - 4], [x1 - 4, y1], [x0 + 4, y1], [x0, y1 - 4]];
  const inside = polyTest(P);
  g.fillWhere((px, py) => {
    // A dark keyline a pixel round the plate.
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1], [0, 0]]) if (inside(px + dx, py + dy)) return true;
    return false;
  }, OFF, [x0 - 2, -1, x1 - x0 + 4, y1 + 3]);
  g.fillWhere((px, py, ix, iy) => {
    if (!inside(px, py)) return false;
    if (!inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py + 1)) return true;   // rim
    const lx = ix - x0, ly = iy - oy;
    if (lx >= 3 && lx <= x1 - x0 - 3 && (ly === 1 || ly === 4 || ly === 7)) return true; // ribs
    if (ly === 10 && Math.abs(lx - 10) <= 2) return true;        // the arrowhead
    if (ly === 9 && Math.abs(lx - 10) <= 1) return true;
    return false;
  }, ON, [x0, -1, x1 - x0 + 1, y1 + 2]);
}

function polyTest(points) {
  return (px, py) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i], [xj, yj] = points[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}

// ------------------------------------------------------------ the scale

/**
 * The minute arc. Every five minutes a tick, longer at the quarters; between
 * them a dot for each minute the hour has already used, so what is left of
 * the hour reads as the stretch of bare scale ahead of the pointer.
 * `glow(m)` lengthens a mark where a pointer is passing (or a dot just
 * arrived).
 */
function drawScale(g, minuteNow, glow, ox, oy, from = 0) {
  for (let m = 0; m <= 60; m++) {
    const a = minuteAngle(m);
    const gl = glow(m);
    const five = m % 5 === 0;
    if (!five && (m > minuteNow || m < from) && gl <= 0) continue;
    let r0, r1;                       // inner and outer reach, in carousel radii
    if (m % 15 === 0) { r0 = R_DOT - 2.5; r1 = R_DOT + 2; }
    else if (five) { r0 = R_DOT - 1.5; r1 = R_DOT + 1.5; }
    else { r0 = r1 = R_DOT; }
    r0 -= gl * 2; r1 += gl * 2;
    const [x0, y0] = at(r0, a, ox, oy), [x1, y1] = at(r1, a, ox, oy);
    g.line(Math.floor(x0), Math.floor(y0), Math.floor(x1), Math.floor(y1), ON);
  }
  // Numerals outside the arc, every five; 15, 30, 45 large; the 60 boxed
  // (on the watch it is red).
  for (let m = 0; m <= 60; m += 5) {
    const a = minuteAngle(m);
    const r = m === 0 ? R_LABEL - 2.5 : m === 60 ? R_LABEL - 0.5 : m % 15 === 0 ? R_LABEL + 1.5 : R_LABEL;
    const [x, y] = at(r, a, ox, oy);
    if (m === 60) {
      const [bx, by, bw, bh] = smallText(g, '60', x - 1, y);
      g.rect(bx - 2, by - 2, bw + 4, bh + 4, ON);
    } else if (m % 15 === 0 && m) bigText(g, String(m), x, y);
    else smallText(g, String(m), x, y);
  }
}

// ------------------------------------------------------------ small things

/**
 * Running seconds, lower left: a small turbine (the UR-110 regulates its
 * winding with air turbines) turning once a minute behind a fixed index at
 * the top; its one solid blade is the seconds hand.
 */
function drawSeconds(g, cx, cy, sec) {
  const R = 7;
  g.circle(cx, cy, R, ON);
  const base = (sec / 60) * 2 * Math.PI;
  for (let k = 0; k < 4; k++) {
    const a = base + (k * Math.PI) / 2;
    // A swept blade: from the hub out, curving back against the turn.
    const pts = [];
    for (let i = 0; i <= 4; i++) {
      const r = 1.6 + (i / 4) * (R - 2.6), aa = a - 0.5 * (i / 4) ** 1.5;
      pts.push([cx + 0.5 + r * Math.sin(aa), cy + 0.5 - r * Math.cos(aa)]);
    }
    g.stroke(pts, k === 0 ? 2 : 1, ON);
  }
  g.fillCircle(cx + 0.5, cy + 0.5, 1.5, ON);
  // Index above the rim.
  g.hline(cx - 1, cy - R - 2, 3, ON);
}

const MERIDIEM = {
  A: sprite(['.#.', '#.#', '###', '#.#', '#.#']),
  P: sprite(['##.', '#.#', '##.', '#..', '#..']),
  M: sprite(['#...#', '##.##', '#.#.#', '#...#', '#...#']),
};

/** Day / night: AM or PM in a small window, lower right. */
function drawMeridiem(g, x, y, pm) {
  g.rect(x, y, 13, 9, ON);
  g.blit(MERIDIEM[pm ? 'P' : 'A'], x + 2, y + 2);
  g.blit(MERIDIEM.M, x + 6, y + 2);
}

// ------------------------------------------------------------ the clock

const DAY = 0xcf, NIGHT = 0x12;

// The hour turn, in seconds after :00.
const T_CLOSE = 0.35;      // the old hour's blind comes down over the last of :59
const T_SPIN0 = 0.05;      // the carousel starts its extra turn
const T_SPIN = 2.45;       // and has made it
const T_OPEN = 2.9;        // the new hour's blind goes up

const glyphOf = (h24) => HOUR_SPRITE[h24 % 12 || 12];

/** Shortest angular distance, radians. */
const angDist = (a, b) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

/**
 * Where the three satellites are and what they show at this instant.
 * Satellite k carries the hours h with h % 3 == k (k = 1: 1, 4, 7, 10).
 * The one on duty rides the scale from 0 to 60 over its hour; the next
 * follows 120 degrees behind and the last one 120 degrees ahead.
 */
function satellites(f) {
  const sec = f.sec, h = f.h;
  const frac = (f.m + sec / 60) / 60;
  const a0 = minuteAngle(frac * 60);
  const turn = f.m === 0 && sec < T_OPEN;
  const spinU = turn ? progress(sec, T_SPIN0, T_SPIN) : 0;
  // The extra turn: eased, with a spring settle as the detent catches.
  let spin = 2 * Math.PI * ease.inOutCubic(spinU);
  if (turn && sec > T_SPIN) {
    const k = sec - T_SPIN;
    spin += 0.07 * Math.exp(-k * 7) * Math.sin(k * 30);
  }
  const out = [];
  for (const d of [1, 2, 0]) {   // draw order: on duty last, in front
    const a = a0 + spin + [0, -1, 1][d] * (SPAN);
    let roll = 0, shut = 1;
    if (d === 0) {
      shut = turn ? 1 - progress(sec, T_SPIN, T_OPEN) : 0;
      // Its blind comes down in the last moments of the hour, so the hour
      // just ending is never on show once the next has begun.
      if (f.m === 59) shut = progress(sec, 60 - T_CLOSE, 60);
      if (!turn && sec < 1.2) {
        // Each minute the cube's detent clicks: a small roll and a rock back.
        roll = -0.16 * Math.exp(-sec * 4.5) * Math.sin(sec * 17);
      }
    }
    if (d === 1 && turn) shut = 1;
    if (d === 2 && turn) {
      shut = 1;
      // Out of service, it presents its next numeral: one face more.
      roll = ease.inOutCubic(spinU);
    }
    // All three tumble once with the carousel's extra turn.
    if (turn) roll += 4 * ease.inOutCubic(spinU);
    const hour = d === 0 ? h : d === 1 ? h + 1 : h - 1;
    out.push({ d, a, roll, shut, hour });
  }
  return { list: out, turn, spinU };
}

/** For review: the twelve cubes, as a 6 x 2 sheet on a 186 x 54 canvas. */
export function specimen(g) {
  for (let h = 1; h <= 12; h++) {
    const i = h - 1, x = 16 + (i % 6) * 31, y = 13 + Math.floor(i / 6) * 27;
    drawCube(g, x, y, 0, (j) => (j === 0 ? HOUR_SPRITE[h] : null), 0);
  }
}

export default {
  name: 'Urwerk',
  blurb: 'Wandering hours after URWERK: cubes on a carousel ride a 0-60 arc; the hour is a carousel spin.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { fields: f, date, oled, night }) {
    oled.contrast(DAY + (NIGHT - DAY) * night);
    const [ox, oy] = orbit(date, 2, 3);
    const sec = f.sec;
    const { list, turn } = satellites(f);

    // Arms first (behind everything), then cubes and pointers.
    // Satellites on the far side of the carousel are smaller and fade out.
    for (const s of list) {
      s.k = clamp(0.7 + 0.6 * Math.cos(s.a), 0.42, 1);
      s.fade = s.k >= 0.5 ? 1 : 0;   // gone over the top edge by then
    }
    for (const s of list) if (s.fade > 0 && Math.cos(s.a) > -0.05) drawArm(g, s.a, ox, oy, s.fade);
    for (const s of list) {
      if (s.fade <= 0) continue;
      const [cx, cy] = at(R_CUBE, s.a, ox, oy);
      const spr = glyphOf(s.hour);
      drawCube(g, cx, cy, s.roll, (j) => (j === 0 ? spr : null), s.shut, s.k, s.fade);
    }
    for (const s of list) if (Math.cos(s.a) > 0.2) drawPointer(g, s.a, ox, oy);

    // The scale. A pointer passing lights the tick under it; the tick the
    // minute just reached clicks out long and settles.
    const pointers = list.filter((s) => s.shut < 1 || turn).map((s) => s.a);
    const glow = (m) => {
      const a = minuteAngle(m);
      let gl = 0;
      for (const p of pointers) gl = Math.max(gl, 1 - angDist(a, p) / (1.2 * D2R) * 0.5);
      if (!turn && m <= f.m && sec < 1) {
        // The minute: a pulse runs up the used dots from 0 to the new one,
        // which pops out long and settles.
        const w = f.m * ease.outQuad(progress(sec, 0, 0.55));
        gl = Math.max(gl, 0.9 * (1 - Math.abs(m - w) / 2.2) * (1 - progress(sec, 0.55, 1) * (m < f.m)));
        if (m === f.m) gl = Math.max(gl, 1.2 * (1 - progress(sec, 0.5, 1)) * (sec > 0.4 ? 1 : 0));
      }
      return clamp(gl, 0, 1.2);
    };
    // On the hour the spinning carousel sweeps the used hour off the scale.
    const wipe = turn ? 61 * progress(sec, T_SPIN0 + 0.3, T_SPIN - 0.35) : 0;
    drawScale(g, turn ? 60 : f.m, glow, ox, oy, wipe);

    drawBridge(g, ox, oy);
    drawSeconds(g, 10 + ox, 55 + oy, sec);
    drawMeridiem(g, 113 + ox, 52 + oy, f.pm);
  },
};
