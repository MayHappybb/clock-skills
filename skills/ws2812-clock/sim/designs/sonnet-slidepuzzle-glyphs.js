// Marquetry digit paths: a brass inlay wire ("filet") let into wood veneer,
// one continuous bent-wire line per stroke group, drawn in a W x H box
// (x right, y down). Proportioned bold and round, like real boulle-work
// brass stringing: wide open counters, no hairlines, no closed loop that
// retraces itself (a bent wire doesn't double back exactly). Rendered by
// sonnet-slidepuzzle.js with a round-capped stroke, a bevel highlight along
// the top-left edge and a dark groove shadow, so it reads as metal set
// into wood, not a pixel font.

const W = 20, H = 34;
const deg = Math.PI / 180;
function arc(cx, cy, r, a0, a1, n = 14) {
  const pts = [];
  for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * deg; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}
const L = (...pts) => pts;

// Each digit: array of open polylines (the wire's own path; several wires
// may inlay one digit, e.g. a crossbar laid over a bowl).
const PATHS = {
  // A tall lens, not a round ring: two straight sides joined by tight top
  // and bottom caps, so it spans the full digit height like every other
  // numeral instead of sitting as a small coin in the middle of the box.
  0: [[...arc(10, 8.0, 7.2, 180, 360, 10), ...arc(10, 26.0, 7.2, 0, 180, 10), [2.8, 8.0]]],
  1: [L([5.5, 7.5], [10.2, 2.4], [10.2, 31.6]), L([5.8, 31.6], [14.6, 31.6])],
  2: [[...arc(10.2, 9.6, 7.4, 205, 395, 16), [2.6, 31.6], [17.4, 31.6]]],
  3: [arc(9.0, 9.8, 7.2, -105, 150, 16), arc(9.6, 24.6, 8.0, -140, 108, 18)],
  4: [L([12.4, 2.2], [2.6, 23.6], [17.0, 23.6]), L([13.0, 2.2], [13.0, 31.6])],
  5: [L([15.6, 2.6], [3.8, 2.6], [2.8, 15.6], [5.8, 14.0]), arc(9.4, 23.8, 8.8, -112, 150, 18)],
  6: [[...arc(11.0, 6.6, 5.0, -30, 150, 10), ...arc(9.6, 23.2, 8.6, 118, 462, 20)]],
  7: [L([2.8, 2.6], [17.2, 2.6], [8.2, 17.4]), L([8.2, 17.4], [10.8, 31.6])],
  8: [arc(10.0, 9.8, 6.4, 0, 360, 18), arc(10.0, 23.8, 7.8, 0, 360, 20)],
  9: [[...arc(9.8, 11.2, 8.2, -62, 282, 20)], L([16.0, 15.8], [8.2, 30.8])],
};

/** Flatten a digit's paths into [{pts:[[x,y]...]}] in the W x H box. */
function build(d) {
  return PATHS[d].map((pts) => ({ pts }));
}

export const BOX = { w: W, h: H };
export const GLYPHS = [];
for (let d = 0; d <= 9; d++) GLYPHS[d] = build(d);
