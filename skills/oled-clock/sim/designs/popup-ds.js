// Pop-up -- an open pop-up book, and the time is what it folds.
//
// The glass shows one spread of an open book, seen from just above its near
// edge in one-point perspective: the gutter runs down the middle, the pages
// rake away to a far edge, and the black above is the room the book stands
// in. Beyond the far edge is the block of pages still to come, and below the
// near edge the block already read.
//
// The minute stands on the right page as a V-fold: one card cut to the
// numeral and creased down its middle, between the two digits, so that each
// of them sits whole on its own panel -- the panel turned to the light lit,
// the one leaning away in its own shade, and the page showing through the
// counters, where the card is cut away. It is pushed up through a slot in
// the page; when the minute turns it sinks back through the slot with the
// crease flattening as it goes, so the card goes in flat, and the next one
// rises and folds open in its place. Nothing is ever a wrong time: the swap
// happens with both cards off the glass.
//
// The hour is the other paper mechanism, on the left page: a flat card. The
// numeral is die-cut from it, stood up through a slot and left leaning back,
// so it reads at the card's own angle with the cut it came from showing as a
// seam along its base -- no fold at all, where the minute is nothing but the
// fold. The hour changes only when the leaf turns: on the hour the right
// page -- the minute's page, its card long since sunk -- lifts off the
// spread about the gutter, stands edge-on (one pixel wide at the top of its
// swing) and lies down on the left carrying the new hour, while the page it
// uncovers has the new minute already rising on it. The seconds are a pull
// tab in the right page that creeps out of its slot all minute: it is what
// draws the card down.
//
// Burn-in: the whole face walks kit.orbit, the paper is an ordered dither
// rather than solid white, nothing static is lit solid, and the panel dims
// from 23:00 to 07:00.

import { Gfx, dither, orbit, clamp, ease } from '../js/kit.js';

const W = 128, H = 64;

// ------------------------------------------------------------------ the book
// Page space: x across the spread with the gutter at 64, z into the book
// (0 = the near edge, ZA = the far edge), y height above the paper. The
// projection is linear in every axis, so a straight line in the book stays
// straight on the glass and a flat quad stays a quad.
const ZA = 64;
const Y_NEAR = 62, Y_FAR = 31;         // where those two edges land on the glass
const S_NEAR = 1.30, S_FAR = 0.84;     // how wide one page unit is there
const X0 = 6, X1 = 122;                // the spread's outer edges (it bleeds off)
const GUT = 64;

let OX = 0, OY = 0;                    // this frame's burn-in offset
const sAt = (z) => S_NEAR + (S_FAR - S_NEAR) * (z / ZA);
const yb = (z) => Y_NEAR + (Y_FAR - Y_NEAR) * (z / ZA);
/** A point in the book -> its pixel on the glass. */
const pj = (x, y, z) => [OX + GUT + (x - GUT) * sAt(z), OY + yb(z) - y * sAt(z)];
/** The page point under a pixel: the paper's own plane, y = 0. */
function pageAt(px, py) {
  const z = ((Y_NEAR - (py - OY)) * ZA) / (Y_NEAR - Y_FAR);
  return [GUT + (px - OX - GUT) / sAt(z), z];
}
/** The paper's tone. A lamp above the near right catches the page in a broad
 *  pool round the minute's slot, and the leaves dip into the spine. */
function paper(x, z) {
  if (x < X0 - 4 || x > X1 + 4) return -1;
  // beyond the far edge and below the near one, the blocks of closed pages
  if (z > ZA) { const d = z - ZA; return d > 7 ? -1 : 0.4 * (1 - d / 7) ** 1.6; }
  if (z < 0) { const d = -z; return d > 9 ? -1 : 0.46 * (1 - d / 9) ** 1.3; }
  const pool = clamp(1 - Math.hypot((x - 92) / 1.4, (z - 18) / 1.1) / 54, 0, 1);
  const dg = Math.abs(x - GUT);
  return (0.05 + 0.26 * pool) * (0.14 + 0.86 * Math.min(1, dg / 11));
}

// ------------------------------------------------------------------ drawing
function polyTest(pts) {
  return (px, py) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}
/** Fill a world-space polygon at a dither level (1 = solid light, 0 = clear). */
function fill3(g, wpts, level, c = 1) {
  const sp = wpts.map((p) => pj(p[0], p[1], p[2]));
  const xs = sp.map((p) => p[0]), ys = sp.map((p) => p[1]);
  const box = [Math.min(...xs) - 1, Math.min(...ys) - 1,
    Math.max(...xs) - Math.min(...xs) + 2, Math.max(...ys) - Math.min(...ys) + 2];
  const hit = polyTest(sp);
  if (c === 0) g.fillWhere(hit, 0, box);
  else if (level >= 1) g.fillWhere(hit, 1, box);
  else g.fillWhere((px, py) => hit(px, py) && dither(px - OX, py - OY, level), 1, box);
}
/** A straight edge of the book, drawn as a line. */
function line3(g, a, b, w = 1, c = 1) {
  const A = pj(a[0], a[1], a[2]), B = pj(b[0], b[1], b[2]);
  g.thickLine(A[0], A[1], B[0], B[1], w, c);
}

// -------------------------------------------------------------- letterforms
// Every numeral is a union of bars on a 9 x 16 card.
const BOXW = 9, BOXH = 16;
const BAR = {
  top: [0, 0, 9, 2], waist: [0, 7, 9, 2], foot: [0, 14, 9, 2],
  ul: [0, 0, 2, 9], ur: [7, 0, 2, 9], ll: [0, 7, 2, 9], lr: [7, 7, 2, 9],
};
const GLYPH = {
  0: 'top ur lr foot ll ul', 1: 'ur lr', 2: 'top ur waist ll foot',
  3: 'top ur waist lr foot', 4: 'ul waist ur lr', 5: 'top ul waist lr foot',
  6: 'top ul waist ll lr foot', 7: 'top ur lr',
  8: 'top ur lr foot ll ul waist', 9: 'top ur lr foot ul waist',
};
const inkOf = (d) => GLYPH[d].split(' ').map((k) => BAR[k]);
const bbox = (rects) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, w, h] of rects) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
  }
  return [x0, y0, x1, y1];
};
/** The numeral's ink for a string, laid out centred on its own bounding box. */
function inkOfText(text, gap) {
  const rects = [];
  for (let i = 0; i < text.length; i++) {
    const [x0, , x1] = bbox(inkOf(+text[i]));
    const off = (i - (text.length - 1) / 2) * (BOXW + gap) - (x0 + x1) / 2;
    for (const r of inkOf(+text[i])) rects.push([r[0] + off, r[1], r[2], r[3]]);
  }
  return rects;
}
/** The union's outline as straight runs: an edge buried in another bar is
 *  not an edge of the numeral. */
function outline(rects) {
  const out = [];
  const strict = (px, py, r) => px > r[0] && px < r[0] + r[2] && py > r[1] && py < r[1] + r[3];
  const buried = (px, py, self) => rects.some((o) => o !== self && strict(px, py, o));
  for (const r of rects) {
    const [x, y, w, h] = r;
    for (const ey of [y, y + h]) {
      let run = -1;
      for (let i = 0; i <= w; i++) {
        const keep = i < w && !buried(x + i + 0.5, ey, r);
        if (keep && run < 0) run = i;
        if (!keep && run >= 0) { out.push([x + run, ey, x + i, ey]); run = -1; }
      }
    }
    for (const ex of [x, x + w]) {
      let run = -1;
      for (let j = 0; j <= h; j++) {
        const keep = j < h && !buried(ex, y + j + 0.5, r);
        if (keep && run < 0) run = j;
        if (!keep && run >= 0) { out.push([ex, y + run, ex, y + j]); run = -1; }
      }
    }
  }
  return out;
}
// ------------------------------------------------------------ the minute card
const M_SLOT = 24;                     // where the card stands, in page units
const M_CX = 94, M_KX = 2.25, M_KY = 1.95, M_GAP = 4;
const M_LEAN = 9.0;                    // how far the crease stands back, page units

/**
 * The minute's card: a numeral cut from one card folded down its middle --
 * a V-fold, the oldest pop-up there is -- standing on the paper at
 * z = M_SLOT. The fold falls between the two digits, so each of them sits
 * whole on its own panel and reads at the angle that panel stands at.
 * `up` is 1 with the fold open, 0 for a card flat on the paper and sunk
 * below the page.
 */
function minuteCard(g, text, up) {
  const rects = inkOfText(text, M_GAP);
  const [bx0, , bx1, by1] = bbox(rects);
  const cx = (bx0 + bx1) / 2;
  const half = Math.max(1e-6, (bx1 - bx0) / 2);
  const sink = -(1 - up) * (BOXH * M_KY + 6);
  const lean = M_LEAN * up;
  /** A point of the card. The crease is at the two digits' midpoint and
   *  furthest from the reader, so the card stands as a shallow V on the
   *  slot with its inside turned to the glass. */
  const P = (dx, dy) => [
    M_CX + (dx - cx) * M_KX,
    (by1 - dy) * M_KY + sink,
    M_SLOT + lean * (1 - Math.abs(dx - cx) / half),
  ];
  if (up > 0.2) {                      // the shadow it throws, back and left
    for (const [x, y, w, h] of rects) {
      const sh = (dx, dy) => [P(dx, dy)[0] - 0.3 * (by1 - dy) * M_KY, 0.02,
        M_SLOT + 0.7 * lean + 1.5];
      fill3(g, [sh(x, y), sh(x + w, y), sh(x + w, y + h), sh(x, y + h)], 0.05);
    }
  }
  // two panels, split at the crease; the one turned to the light is lit
  const quads = [];
  for (const [x, y, w, h] of rects)
    for (const [xa, xb, lit] of [[x, Math.min(x + w, cx), 1], [Math.max(x, cx), x + w, 0.78]]) {
      if (xb - xa < 1e-6) continue;
      quads.push({ q: [P(xa, y + h), P(xb, y + h), P(xb, y), P(xa, y)], lit });
    }
  quads.sort((a, b) => (b.q[0][2] + b.q[1][2]) - (a.q[0][2] + a.q[1][2]));
  for (const { q, lit } of quads) fill3(g, q, lit * up + 0.34 * (1 - up));
  for (const [x, y, w, h] of rects)    // the crease down the middle, in its own shade
    if (x + 1e-6 < cx && x + w > cx + 1e-6)
      line3(g, P(cx, y), P(cx, y + h), 1, 0);
  for (const s of outline(rects)) cutEdge(g, s, P, cx, 1);   // the cut edge
}

/** A run of the numeral's edge, bent where the card folds. */
function cutEdge(g, s, P, fx, c) {
  const [x0, y0, x1, y1] = s;
  if (x0 === x1 || (x0 < fx) === (x1 < fx)) return line3(g, P(x0, y0), P(x1, y1), 1, c);
  const t = (fx - x0) / (x1 - x0);
  const ym = y0 + (y1 - y0) * t;
  line3(g, P(x0, y0), P(fx, ym), 1, c);
  line3(g, P(fx, ym), P(x1, y1), 1, c);
}

// -------------------------------------------------------------- the hour card
const HOUR = { cx: 37, cz: 32, kx: 2.05, ky: 1.35, lean: 0.6, shade: 0.78 };
/**
 * The hour's card: the numeral die-cut from one card and stood up through a
 * slot in the left page, leaning back, so its face catches the light and the
 * cut it came from shows along its base. No folds -- the minute is the folded
 * one. `map` places a resting point of the page: the identity while the page
 * is still down, the turning leaf while it is in the air.
 */
function hourCard(g, hour, map) {
  const rects = inkOfText(String(hour), 4);
  const [bx0, , bx1, by1] = bbox(rects);
  const bx = HOUR.cx - ((bx0 + bx1) / 2) * HOUR.kx;
  const H = (dx, dy) => {
    const t = dy * HOUR.ky;
    return map([bx + dx * HOUR.kx, t * Math.cos(HOUR.lean), HOUR.cz + t * Math.sin(HOUR.lean)]);
  };
  for (const [x, y, w, h] of rects) {  // the shadow it throws
    const sh = (dx, dy) => [bx + dx * HOUR.kx - 0.42 * (by1 - dy) * HOUR.ky,
      0.02, HOUR.cz + 0.34 * (by1 - dy) * HOUR.ky + 2];
    fill3(g, [sh(x, y), sh(x + w, y), sh(x + w, y + h), sh(x, y + h)], 0.05);
  }
  for (const [x, y, w, h] of rects)
    fill3(g, [H(x, y + h), H(x + w, y + h), H(x + w, y), H(x, y)], HOUR.shade);
  for (const s of outline(rects)) {
    const cut = s[1] === 0 && s[3] === 0;   // the top edge: the card's own thickness
    line3(g, H(s[0], s[1]), H(s[2], s[3]), cut ? 2 : 1, 1);
  }
  for (const s of outline(rects)) {         // the seam it was cut from
    if (s[1] !== by1 || s[3] !== by1) continue;
    const q = (dx) => map([bx + dx * HOUR.kx, 0.05, HOUR.cz - 1.6]);
    line3(g, q(s[0]), q(s[2]), 1, 0);
  }
}

export default {
  name: 'Pop-up',
  blurb: 'An open pop-up book: the minute is a card V-folded across the middle and pushed up through a slot in the right page, the hour is a flat die-cut card leaning out of the left page, and on the hour a leaf turns the whole spread over.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const f = ctx.fields, w = f.sec;
    [OX, OY] = orbit(ctx.date, 3, 2);

    // ------------------------------------------------------------- the clock
    // `up`: 1 = the minute's card stands with its crease open, 0 = flat, sunk.
    let up, incoming = 0, leaf = 0;
    if (f.m === 59) {                       // this minute's turn is the hour
      up = 1 - ease.inOutCubic(clamp((w - 58.1) / 0.7, 0, 1));
      incoming = ease.outCubic(clamp((w - 59.5) / 0.9, 0, 1));
      leaf = Math.PI * ease.inOutCubic(clamp((w - 59) / 1, 0, 1));
    } else if (f.m === 0) {                 // the hour turned at :00
      up = ease.outCubic(clamp((w + 0.5) / 0.9, 0, 1));
    } else if (w >= 59) {
      up = 1 - ease.inOutCubic(clamp((w - 59) / 0.9, 0, 1));
    } else {
      up = ease.outCubic(clamp(w / 0.85, 0, 1));
    }
    const pull = w < 54 ? w / 54 : 1 - ease.inOutQuad(clamp((w - 54) / 6, 0, 1));

    // -------------------------------------------------------------- the leaf
    const sin = Math.sin(leaf), cos = Math.cos(leaf);
    const leafUp = leaf > 0.05 && leaf < Math.PI - 0.05;
    // A resting point of the left page, riding on the leaf as it turns.
    const onLeaf = (p) => [GUT + (GUT - p[0]) * cos, p[1] + (GUT - p[0]) * sin, p[2]];
    const leafQuad = [[X0, 0, 0], [X1, 0, 0], [X1, 0, ZA], [X0, 0, ZA]].map((p) =>
      [GUT + (GUT - p[0]) * cos, (GUT - p[0]) * sin, p[2]]);
    const shadow = leafUp
      ? polyTest(leafQuad.map((p) => { const s = pj(...p); return [s[0] + 5, s[1] + 2]; })) : null;

    // ------------------------------------------------------------- the paper
    const slotY = Math.round(yb(M_SLOT) + OY);
    g.fillWhere((px, py) => {
      const [x, z] = pageAt(px - OX, py - OY);
      let lv = paper(x, z);
      if (lv < 0) return false;
      if (x > 66 && x < 126 && z > M_SLOT - 0.9 && z < M_SLOT + 0.9) lv = 0;    // the slot
      if (shadow && shadow(px, py)) lv *= 0.1;
      return dither(px - OX, py - OY, lv);   // the grain walks with the face, not the glass
    }, 1, [0, 0, W, H]);

    // the near edge of the spread, and the block of pages read already
    line3(g, [X0, 0, 0], [X1, 0, 0], 1);
    // the far edge, and the pages still to come standing behind it
    line3(g, [X0, 0, ZA], [X1, 0, ZA], 1);
    // the two page edges running off the glass
    line3(g, [X0, 0, 0], [X0, 0, ZA], 1);
    line3(g, [X1, 0, 0], [X1, 0, ZA], 1);
    // the gutter: where the leaves curl into the spine
    line3(g, [GUT - 4.6, 0, 0], [GUT - 4.6, 0, ZA], 1);
    line3(g, [GUT + 4.6, 0, 0], [GUT + 4.6, 0, ZA], 1);

    // ------------------------------------------------------------ the hour
    hourCard(g, f.h, leaf < 0.05 ? (p) => p : onLeaf);

    // ------------------------------------------------------------ the leaf
    if (leafUp) {
      fill3(g, leafQuad, 0.9);
      for (let i = 0; i < 4; i++) line3(g, leafQuad[i], leafQuad[(i + 1) % 4], 1);
      if (leaf > Math.PI / 2) hourCard(g, (f.h + 1) % 24, onLeaf);
    }

    // ------------------------------------------------------- the minute card
    g.clip(0, 0, W, slotY + 1);
    if (up > 0.002) minuteCard(g, f.mm, up);
    if (incoming > 0.002) minuteCard(g, '00', incoming);
    g.unclip();
    // the cut lip the card stands behind
    const lipZ = M_SLOT + 1.5, lip = pj(66, 0, lipZ), lip2 = pj(126, 0, lipZ);
    g.hline(Math.round(lip[0]), Math.round(lip[1]), Math.round(lip2[0] - lip[0]), 1);

    // ------------------------------------------------------------- the tab
    const z0 = 5, z1 = 15, tip = 92 + 6 + 20 * pull;
    fill3(g, [[92, 0, z0], [tip, 0, z0], [tip, 0, z1], [92, 0, z1]], 0.6);
    line3(g, [92, 0, z0], [tip, 0, z0], 1);
    line3(g, [tip, 0, z0], [tip, 0, z1], 1);
    line3(g, [tip, 0, z1], [92, 0, z1], 1);
    line3(g, [92, 0, z0], [92, 0, z1], 1);
    fill3(g, [[tip - 6, 0, z0 + 2.5], [tip - 2.5, 0, z0 + 2.5],
      [tip - 2.5, 0, z1 - 2.5], [tip - 6, 0, z1 - 2.5]], 0, 0);

    // ---------------------------------------------------------------- night
    ctx.oled.contrast(255 - 168 * ctx.night);
  },
};
