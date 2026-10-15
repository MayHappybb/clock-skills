// The LED boards, as data. Every number here was read off the seller's spec
// photos (screen_description/ in the project, LYQ电子); references/panels.md
// gives the derivation of each and lists what is still unverified.
//
// Conventions, for every board:
//   millimetres, seen from the FRONT (the LED side), x to the right, y DOWN,
//   origin at the centre of the board's bounding box.
//   leds[] is in CHAIN ORDER: leds[0] is the first LED after DIN.
//   bus: 'ws2812' (the default) or 'hub75' (a scanned matrix panel, whose
//   leds[] are in frame-buffer order instead: there is no chain of LEDs).
//
// Each LED carries its position (x, y), the package rotation (rot, degrees,
// clockwise on screen) and lattice coordinates for that board's family:
//   tri     col, hr    column, and half-row (y = hr * pitch/2); col + hr is even
//   square  col, row
//   rhombic col, row   along the board's two lattice directions
// The hexagon also carries ring (hex distance from the centre), ringPos and
// ringLen: ring k has 6k LEDs, ringPos 0 at 12 o'clock, clockwise.

const SQ3 = Math.sqrt(3);

/**
 * LED packages. Sizes are package body sizes in mm, w along the package's
 * own x axis (rot 0 = w horizontal). On the hexagon, triangle and octagon the
 * 3227's long side runs along the columns (vertical: rot 90), with its pads
 * top and bottom (IMG_7899, IMG_7901, IMG_7903/7904); on the arc board along
 * the rings (IMG_7907).
 */
export const PACKAGES = {
  // Clear-top 2020: the three dies are visible as separate dots.
  '2020': { w: 2.0, h: 2.0, kind: 'clear', frosted: false, body: [0.80, 0.80, 0.78] },
  // Frosted ("雾状") 3227: the top diffuses, the whole face glows.
  '3227': { w: 3.2, h: 2.7, kind: 'frosted', frosted: true, body: [0.86, 0.86, 0.84] },
  // Black-body 1515 under GOB ("glue on board"): a clear epoxy coat over the
  // whole panel. The dies sit close and the glue blurs them into one dot;
  // the black body keeps unlit pixels black.
  '1515': { w: 1.5, h: 1.5, kind: 'gob', frosted: false, body: [0.035, 0.035, 0.038] },
};

function hexagon(cx, cy, side, pointyTop = true) {
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const a = (pointyTop ? -90 : 0) + 60 * k;
    pts.push([cx + side * Math.cos((a * Math.PI) / 180), cy + side * Math.sin((a * Math.PI) / 180)]);
  }
  return pts;
}

function rect(w, h) {
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
}

// ---------------------------------------------------------------- hexagon
// WS2812-3227-331灯-P4-S, 正六边形-10层-74.5x86mm, 边长43mm.
// 21 vertical columns, 3.464 mm apart (4 mm * sqrt3/2); a column holds
// 11 + (distance from the edge) LEDs: 11, 12, ... 21 (middle) ... 11.
// The silkscreen numbers 1-11 down the left column, 12 at the bottom of the
// second: serpentine, even columns run down, odd columns run up.
function hex331() {
  const P = 4, dx = P * SQ3 / 2;
  const leds = [];
  for (let c = 0; c <= 20; c++) {
    const q = c - 10, n = 21 - Math.abs(q);
    const js = [...Array(n).keys()];
    if (c % 2) js.reverse();
    for (const j of js) {
      const y = (j - (n - 1) / 2) * P;
      leds.push({ x: q * dx, y, col: q, hr: Math.round(y / (P / 2)), rot: 90 });
    }
  }
  // Rings: axial coordinates of a column-aligned hex lattice.
  for (const l of leds) {
    const q = l.col, r = Math.round(l.y / P - q / 2);
    l.ring = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
  }
  const byRing = new Map();
  for (const l of leds) (byRing.get(l.ring) ?? byRing.set(l.ring, []).get(l.ring)).push(l);
  for (const [k, ring] of byRing) {
    // clockwise from 12 o'clock; the ring is convex round the centre, so
    // sorting by angle walks it in order
    const ang = (l) => (Math.atan2(l.x, -l.y) + 2 * Math.PI) % (2 * Math.PI);
    ring.sort((a, b) => ang(a) - ang(b));
    ring.forEach((l, i) => { l.ringPos = i; l.ringLen = k === 0 ? 1 : 6 * k; });
  }
  return {
    key: 'hex331', label: 'Hexagon, 10 rings, 331 LEDs, P4, 3227 frosted',
    lattice: 'tri', pitch: P, colStep: dx, pkg: '3227', mA: 12,
    size: [74.5, 86], outline: hexagon(0, 0, 43, true),
    din: [-37.25, -5], out: [37.25, -5],     // "输入" is on the right of the back: the left from the front
    leds, notes: 'chain order read from silkscreen (1-11 left column, 12 at the bottom of column 2)',
  };
}

// --------------------------------------------------------------- triangle
// 三角形点阵-15行-P4-S形-120灯-3227-12mA雾, 60x52mm.
// 15 vertical columns 3.464 mm apart, column k holding k LEDs (1..15),
// apex at the connector. Stepped outline: each column's board edge is half
// a pitch beyond its end LEDs, which is exactly 52 x 60 mm.
// Serpentine; that column 2 runs DOWN is an assumption (see panels.md).
function tri120() {
  const P = 4, dx = P * SQ3 / 2;
  const leds = [];
  const outlineTop = [], outlineBot = [];
  for (let k = 1; k <= 15; k++) {
    const x = (k - 8) * dx;
    const js = [...Array(k).keys()];
    if (k % 2 === 1 && k > 1) js.reverse();         // col 1 single, col 2 down, col 3 up...
    for (const j of js) {
      const y = (j - (k - 1) / 2) * P;
      leds.push({ x, y, col: k - 8, hr: Math.round(y / (P / 2)), rot: 90 });
    }
    outlineTop.push([x - dx / 2, -k * P / 2], [x + dx / 2, -k * P / 2]);
    outlineBot.push([x - dx / 2, k * P / 2], [x + dx / 2, k * P / 2]);
  }
  // centre the bounding box (it is already: columns -7..7, ±30 mm)
  return {
    key: 'tri120', label: 'Triangle, 15 rows, 120 LEDs, P4, 3227 frosted',
    lattice: 'tri', pitch: P, colStep: dx, pkg: '3227', mA: 12,
    size: [52, 60], outline: [...outlineTop, ...outlineBot.reverse()],
    din: [-24.25, 0], out: [20, 0],
    leds, notes: 'column-2 direction assumed (down); run the chain design on hardware to confirm',
  };
}

// ---------------------------------------------------------------- octagon
// 八边形点阵-64x64MM, WS2812-3227-P4-Z形-196灯. A 16x16 grid on 4 mm with the
// corners cut: column i (1..16) starts at row START[i-1]. The map printed on
// the spec photo: every column runs top to bottom, column 1 first (left,
// seen from the front: the back's "1" is on the right).
function oct196() {
  const P = 4, START = [6, 5, 4, 3, 2, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6];
  const leds = [];
  for (let c = 0; c < 16; c++) {
    for (let r = START[c] - 1; r <= 16 - START[c]; r++)
      leds.push({ x: (c - 7.5) * P, y: (r - 7.5) * P, col: c, row: r, rot: 90 });
  }
  const a = 12, b = 32;    // 24 mm straight edges, 28.284 mm diagonals
  return {
    key: 'oct196', label: 'Octagon, 196 LEDs (16x16, corners cut), P4, 3227 frosted',
    lattice: 'square', pitch: P, pkg: '3227', mA: 12,
    size: [64, 64], outline: [[-a, -b], [a, -b], [b, -a], [b, a], [a, b], [-a, b], [-b, a], [-b, -a]],
    din: [-32, 0], out: [32, 0],
    leds, notes: 'chain map printed on the spec photo',
  };
}

// ------------------------------------------------------- rectangular grids
// Z order ("Z形"): every column top to bottom, left column first.
function grid(key, label, cols, rows, P, size, mA) {
  const leds = [];
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++)
      leds.push({ x: (c - (cols - 1) / 2) * P, y: (r - (rows - 1) / 2) * P, col: c, row: r });
  return {
    key, label, lattice: 'square', pitch: P, pkg: '2020', mA,
    size, outline: rect(...size), din: [-size[0] / 2, 0], out: [size[0] / 2, 0], leds,
  };
}

// WS2812点阵-96x24.4MM, 32X8-P3-Z形-256灯-2020. Front: 1 top-left, 8 bottom-left,
// 249 top-right, 256 bottom-right.
const strip256 = () => ({
  ...grid('strip256', 'Strip 32x8, 256 LEDs, P3, 2020', 32, 8, 3, [96, 24.4], 5),
  notes: 'mA per channel not stated; 5 mA assumed (2020 parts are usually 5 mA)',
});

// WS2812点阵-400灯, 20X20-P3-Z形-2020-5mA, 60x60mm. Front: 1 top-left, 20
// bottom-left, 381 top-right, 400 bottom-right.
const sq400 = () => grid('sq400', 'Square 20x20, 400 LEDs, P3, 2020 5 mA', 20, 20, 3, [60, 60], 5);

// ---------------------------------------------------------- parallelogram
// WS2812斜点阵 16X8-P2.55-S形-128灯-2020, 52.8 x 19.1 mm, corners 61/119 deg,
// top edge 42.275 mm, slanted edge 21.832 mm.
// Rows are horizontal, 16 LEDs at 2.55 mm. The 8 LEDs of a column run along
// the slanted edge, also 2.55 mm apart (8 x 2.55 = 20.4 in 21.83, the same
// ~0.7 mm margin as 16 x 2.55 in 42.275). Packages are turned 31 degrees
// anticlockwise (edges at -31 / 59 degrees: measured 58 mod 90 from the
// package edges in IMG_7896; the owner confirmed it against the board).
// Chain: 1 at the top of the left column down to 8 at the bottom-left, 9 next
// to 8 going up: serpentine.
function para128() {
  const P = 2.55, A = (61 * Math.PI) / 180;
  const u = [P, 0], v = [-P * Math.cos(A), P * Math.sin(A)];       // along a row; down a column
  const leds = [];
  for (let c = 0; c < 16; c++) {
    const js = [...Array(8).keys()];
    if (c % 2) js.reverse();
    for (const j of js) {
      const a = c - 7.5, b = j - 3.5;
      leds.push({ x: a * u[0] + b * v[0], y: a * u[1] + b * v[1], col: c, row: j, rot: -31 });
    }
  }
  const H = 19.1, top = 42.275, sh = H / Math.tan(A);
  const x0 = -(top + sh) / 2 + sh;                    // top-left corner
  return {
    key: 'para128', label: 'Parallelogram 16x8 (61 deg), 128 LEDs, P2.55, 2020',
    lattice: 'rhombic', pitch: P, angle: 61, pkg: '2020', mA: 5,
    size: [top + sh, H], outline: [[x0, -H / 2], [x0 + top, -H / 2], [x0 + top - sh, H / 2], [x0 - sh, H / 2]],
    din: [-20, 0], out: [20, 0],
    leds, notes: 'mA per channel not stated; 5 mA assumed',
  };
}

// ------------------------------------------------------------ arc triangle
// 圆弧三角形-20行-P4-Z形-210灯-3227-12mA雾, 86 x 72.7 mm, sides R83, base R100.
// MEASURED from the lit photo IMG_7907: all 210 LED centroids, fitted (rms
// 0.2 mm) by a bipolar lattice. LEDs sit where two families of concentric
// circles cross, one centred at each base corner (C1 left, C2 right), radii
// r0 + 4 mm steps. Ring u (1..20) is a circle round C1, ring v (1..20) a
// circle round C2, and w = u + v - 20 (1..20) counts rows up from the base.
// The two convex sides are the outermost rings (81 mm + 2 mm margin = the
// spec's R83); the base row lies on an ellipse with foci C1, C2, 4.4 mm
// above the concave R100 base arc (that fits the spec's 63.1 mm height).
// Chain order is ASSUMED: rings u = 1..20 in turn (the silkscreen numbers
// 1-20 along the base), each from the base up its ring. See
// references/panels.md.
function arc210() {
  const S = 4, r0 = 5.042, D = 81.62;            // ring step, inner radius, |C1 C2| (mm)
  const pts = [];
  for (let u = 1; u <= 20; u++) {
    for (let v = 21 - u; v <= 20; v++) {
      const r1 = r0 + S * (u - 1), r2 = r0 + S * (v - 1);
      const x = (r1 * r1 - r2 * r2) / (2 * D), y = Math.sqrt(Math.max(0, r1 * r1 - (x + D / 2) ** 2));
      pts.push({ x, y, u, v, w: u + v - 20 });
    }
  }
  // outline, y up: the sides are arcs of radius RS round the opposite corner,
  // the base an R100 arc whose top is 4.4 mm under the base row's middle
  const RS = r0 + 19 * S + 2;
  const baseRow = Math.sqrt(((2 * r0 + 19 * S) / 2) ** 2 - (D / 2) ** 2);
  const bc = baseRow - 4.4 - 100;                                   // base circle centre (0, bc)
  const side = (cx, a) => [cx + RS * Math.cos(a), RS * Math.sin(a)];
  const aApex = Math.acos(D / 2 / RS);                              // angle round C1 of the apex
  let lo = 0, hi = aApex;                                           // right corner: side meets base
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2, [px, py] = side(-D / 2, m); if (Math.hypot(px, py - bc) < 100) lo = m; else hi = m; }
  const aCorner = hi, N = 48, out = [];
  for (let i = 0; i <= N; i++) out.push(side(-D / 2, aApex + ((aCorner - aApex) * i) / N));       // apex -> right corner
  const [xr, yr] = out[N], b0 = Math.atan2(yr - bc, xr);
  for (let i = 1; i < N; i++) { const b = b0 + ((Math.PI - 2 * b0) * i) / N; out.push([100 * Math.cos(b), bc + 100 * Math.sin(b)]); }  // base, right -> left
  for (let i = 0; i < N; i++) out.push(side(D / 2, Math.PI - aCorner + ((aCorner - aApex) * i) / N));  // left corner -> apex
  // to the board frame: y down, origin at the bounding-box centre
  const xs = out.map((p) => p[0]), ys = out.map((p) => p[1]);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
  return {
    key: 'arc210', label: 'Arc triangle, 20 rings, 210 LEDs, P4, 3227 frosted',
    lattice: 'arc', pitch: S, pkg: '3227', mA: 12,
    size: [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)],
    outline: out.map(([x, y]) => [x - mx, my - y]),
    din: [0, my - Math.min(...ys)], out: [-D / 2 - mx, my - Math.min(...ys)],
    corners: { C1: [-D / 2 - mx, my], C2: [D / 2 - mx, my] },     // the ring centres, board frame
    // package long side along ring u: the tangent of the circle round C1 (IMG_7907)
    leds: pts.map((p) => {
      const x = p.x - mx, y = my - p.y, cx = -D / 2 - mx, cy = my;
      return { x, y, u: p.u, v: p.v, w: p.w, col: p.u, row: p.w, rot: (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90 };
    }),
    notes: 'measured from a photo (rms 0.2 mm); chain order assumed (ring by ring from the base)',
  };
}

// ------------------------------------------------------------ HUB75 panel
// Waveshare RGB-Matrix-P2-64x64-B (GOB), IMG_8301-8303. NOT a WS2812 board:
// a HUB75 panel, 1/32 scan, 2 mm pitch, 128 x 128 mm, 5 V 3 A (<= 15 W).
// It has no memory: the controller re-scans it continuously (two rows at a
// time, 32 row pairs), so the cost model is refresh rate and frame-buffer
// RAM, not wire time (ws2812.js hub75Budget). LED order here is the frame
// buffer's: row by row from the top-left seen from the front, index y*64+x.
// The HUB75 input header is on the left of the BACK (the right, seen from
// the front); panels daisy-chain input to output.
// PCB silkscreen DCHY-P2-6464-1515-VP: 1515 packages.
function hub64() {
  const P = 2, N = 64, leds = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) leds.push({ x: (c - 31.5) * P, y: (r - 31.5) * P, col: c, row: r });
  return {
    key: 'hub64', label: 'HUB75 RGB matrix 64x64, P2, GOB, 1/32 scan',
    bus: 'hub75', order: 'rows', lattice: 'square', pitch: P, pkg: '1515',
    // panel-level power: the spec's 3 A at full white; idle (drivers, logic) ASSUMED
    hub: { w: N, h: N, scan: 32, fullA: 3, idleA: 0.1 },
    size: [128, 128], outline: rect(128, 128), din: [64, 0], out: [-64, 0],
    leds, notes: 'HUB75, not WS2812: refresh and RAM budget instead of wire time; spec 5 V 3 A',
  };
}

// --------------------------------------------------------- ESP32-S3-Matrix
// Waveshare ESP32-S3-Matrix, IMG_8304: a 25 x 25 mm board with its own
// ESP32-S3 and an 8 x 8 WS2812 matrix on GPIO14 (WS2812C timing, colour
// order R, G, B, per the Zephyr board DTS). Pitch MEASURED from the
// dimension drawing (27.9 px/mm, calibrated on the 2.54 mm header pads):
// 2.65 mm across, 2.75 mm down, centred on the board. Order: rows, each
// left to right, from the top-left with the USB-C edge up (Zephyr
// `circulative`; NeoMatrix TOP+LEFT+ROWS+PROGRESSIVE). Waveshare warns that
// high brightness heats and damages the board: the MCU shares the 6 cm2.
function s3m64() {
  const PX = 2.65, PY = 2.75, leds = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) leds.push({ x: (c - 3.5) * PX, y: (r - 3.5) * PY, col: c, row: r });
  return {
    key: 's3m64', label: 'ESP32-S3-Matrix 8x8 (own MCU), 2.65 x 2.75 mm, 2020',
    bus: 'ws2812', order: 'rows', lattice: 'square', pitch: PX, pitchY: PY, pkg: '2020', mA: 5,
    rgbOrder: 'RGB', ownMcu: true, mcuW: 0.4,       // the ESP32-S3 with Wi-Fi on: ASSUMED 0.4 W
    size: [25, 25], outline: rect(25, 25), din: [0, -12.5], out: [0, 12.5],
    leds, notes: 'own ESP32-S3 drives it (GPIO14); colour order RGB; chain origin assumed USB edge up; mA assumed (WS2812C 5 mA)',
  };
}

const BUILDERS = { hex331, tri120, oct196, strip256, sq400, para128, arc210, hub64, s3m64 };

const cache = {};
/** A board by key, with its LEDs (built once). */
export function panel(key) {
  if (!BUILDERS[key]) throw new Error(`unknown panel '${key}' (have: ${Object.keys(BUILDERS).join(', ')})`);
  if (!cache[key]) {
    const p = BUILDERS[key]();
    p.leds.forEach((l, i) => { l.local = i; l.rot ??= 0; });
    p.bus ??= 'ws2812';
    p.package = PACKAGES[p.pkg];
    cache[key] = p;
  }
  return cache[key];
}

export const PANEL_KEYS = Object.keys(BUILDERS);
