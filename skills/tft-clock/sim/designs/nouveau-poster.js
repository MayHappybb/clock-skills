// The poster of "nouveau": everything that is not the four locks of hair.
//
// At load the poster is drawn once into a palette-index map (BASE, 12.8 KB
// flash): the gold frame with its rounded inner corners, the muse's head and
// shoulders (copper hair crown, centre parting, a gold circlet with jewels,
// closed eyes, a sage robe with a gold collar), and her halo, a pale gold disc
// with a ring of mosaic tiles. Three codes in BASE are not colours but zones
// the frame paints each frame: the poster ground (where her loose hair lies
// in long faint lines), the two rows of the halo's mosaic, and their grout.
//
// The ground's lines are spirals unwinding from her head with an S-bend in
// them, the way Mucha fills a whole poster with a woman's hair: PSI is the
// fractional line coordinate (uint8), RHO the radius from her head (uint8),
// ANG the angle (uint8) for the mosaic. Flash: 4 x 12.8 KB.

export const W = 160, H = 80, N = W * H;
export const HX = 80, HY = 24;            // the centre of her head and halo

// palette slots (each palette below gives a colour for every slot)
export const C = {
  GROUND: 0, OUT: 1, HAIR: 2, DK: 3, LT: 4, LINE: 5, GOLD: 6, GOLDLT: 7, TEAL: 8, ROSE: 9,
  SKIN: 10, ROBE: 11, ROBEDK: 12, WHITE: 13, LEAF: 14, HALO: 15, TILE2: 16, STAMEN: 17, LIPS: 18, CREAM: 19,
};
export const NCOL = 20;
export const Z_GROUND = 40, Z_ROW1 = 41, Z_ROW2 = 42, Z_GROUT = 43;
/** What a zone shows where a lock's moat clears it. */
export const PLAIN = new Uint8Array(64);
for (let i = 0; i < 64; i++) PLAIN[i] = i;
PLAIN[Z_GROUND] = C.GROUND; PLAIN[Z_ROW1] = C.GOLD; PLAIN[Z_ROW2] = C.GOLD; PLAIN[Z_GROUT] = C.OUT;

// Mucha's 'Times of the Day' (1899) give the day its palettes:
// morning awakening, brightness of day, evening reverie, night's rest.
const hexes = (s) => s.trim().split(/\s+/).map((h) => parseInt(h, 16));
//                 ground  out    hair   dk     lt     line   gold   goldlt teal   rose   skin   robe   robedk white  leaf   halo   tile2  stamen lips   cream
export const PALETTES = {
  morning: hexes('ece7c4 3a2a1c b8612f 7c3a1d eaa266 dcc2a0 c4a04a e6cf86 86a596 d9a597 f4e0c8 a9bd96 6f8a66 fbf7e6 7f9a5e efe2a6 c7d3a6 d9a23a c2685e f6efd2'),
  day: hexes('efe0bf 3a2418 b8612f 7c3a1d eaa266 dbbb94 c79a46 e8cb84 7f9e98 d8a49a f3dcc6 9fb4a2 63806e fbf6ea 7d9a62 f0dca0 a9c2b4 d39a34 c0645a f7ecd6'),
  evening: hexes('e6cfc6 3b2228 b65a34 783522 e89c66 d4aca0 c08f56 e2bf8c 8f8fa8 cf8f94 f1d8c8 b49ab4 7a5f80 f8efe8 7f8f68 ecd0b0 c0a8c4 cf8e3a b85466 f3e4dc'),
  night: hexes('1f2b36 0c1218 e88c48 9a4c26 ffc480 2e3f4e 7c6c46 8c7c5c 44606a 6c5864 8a8690 34495a 26343f a4a8b0 365244 46566a 3c5260 a07838 7c5050 34424e'),
};

export const BASE = new Uint8Array(N), PSI = new Uint8Array(N), RHO = new Uint8Array(N), ANG = new Uint8Array(N);

// ------------------------------------------------------------ helpers (load time only)
function fill(test, idx, x0 = 0, y0 = 0, x1 = W, y1 = H) {
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++)
      if (test(x + 0.5, y + 0.5)) BASE[y * W + x] = idx;
}
const ell = (cx, cy, rx, ry) => (px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
/** An ellipse filled with `idx` and outlined 1 px in OUT. */
function blob(cx, cy, rx, ry, idx) {
  fill(ell(cx, cy, rx + 1, ry + 1), C.OUT);
  fill(ell(cx, cy, rx, ry), idx);
}
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
const put = (x, y, idx) => { if (x >= 0 && y >= 0 && x < W && y < H) BASE[y * W + x] = idx; };
function pts(list, idx) { for (const [x, y] of list) put(x, y, idx); }

// ------------------------------------------------------------ the ground and its maps
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - HX, dy = y + 0.5 - HY, r = Math.hypot(dx, dy);
    let th = Math.atan2(dy, dx);                          // 0 = right, +pi/2 = down
    const i = y * W + x;
    RHO[i] = Math.min(255, Math.round(r));
    ANG[i] = Math.round(((th + Math.PI) / (2 * Math.PI)) * 256) & 255;
    // hair falls from her head to both sides: lines leave nearly sideways and droop, with an S-bend
    const side = dx < 0 ? -1 : 1;
    const droop = Math.atan2(dy, Math.abs(dx));            // -pi/2 up .. +pi/2 down, mirrored
    const psi = (droop * 30) / Math.PI - 0.09 * r + 1.1 * Math.sin(r / 11) + (side < 0 ? 0.5 : 0);
    PSI[i] = Math.round((psi - Math.floor(psi)) * 256) & 255;
    BASE[i] = Z_GROUND;
  }

// ------------------------------------------------------------ the halo
const ringR = (r0, r1) => (px, py) => { const r = Math.hypot(px - HX, py - HY); return r >= r0 && r < r1; };
fill(ringR(0, 30.2), C.GOLD);
fill(ringR(0, 29.2), Z_GROUND);
fill(ringR(0, 26.6), C.OUT);
fill(ringR(0, 25.6), Z_ROW2);
fill(ringR(0, 22.4), Z_GROUT);
fill(ringR(0, 21.6), Z_ROW1);
fill(ringR(0, 18.4), C.OUT);
fill(ringR(0, 17.4), C.HALO);

// ------------------------------------------------------------ the muse
// the robe: shoulders falling to the bottom of the poster
const ROBE = [[61, 80], [64, 58], [69, 50], [76, 45.5], [80, 48], [84, 45.5], [91, 50], [96, 58], [99, 80]];
fill(polyTest(ROBE.map(([x, y]) => [x + (x < 80 ? -1 : x > 80 ? 1 : 0), y - 1])), C.OUT);
fill(polyTest(ROBE), C.ROBE);
// the neck
fill((px, py) => px > 76 && px < 84 && py > 34 && py < 49.5 - Math.abs(px - 80) * 0.3, C.OUT);
fill((px, py) => px > 77 && px < 83 && py > 34 && py < 48.5 - Math.abs(px - 80) * 0.3, C.SKIN);
// the collar: a gold band on the neckline, a brooch
for (let x = 68; x <= 92; x++) {
  const y = Math.round(49.5 + (12 - Math.abs(x - 80)) * 0.38);
  put(x, y, C.OUT); put(x, y + 1, C.GOLD); put(x, y + 2, C.GOLD); put(x, y + 3, C.OUT);
}
blob(80, 55.5, 2.4, 2.4, C.TEAL);
pts([[80, 55]], C.CREAM);
// folds of the drapery
for (const [x0, y0, x1, y1] of [[70, 60, 66, 80], [74, 61, 72, 80], [86, 61, 88, 80], [90, 60, 94, 80], [80, 59, 80, 80]])
  for (let y = y0; y < y1; y++) put(Math.round(x0 + ((x1 - x0) * (y - y0)) / (y1 - y0)), y, C.ROBEDK);

// hair falling beside the face
blob(71.2, 32, 4.6, 10, C.HAIR);
blob(88.8, 32, 4.6, 10, C.HAIR);
// the crown
blob(80, 19.5, 12.4, 10, C.HAIR);
// the face
blob(80, 29.5, 6.3, 8.2, C.SKIN);
// the centre parting: hair sweeps from the parting over the temples
fill((px, py) => ell(80, 29.5, 6.4, 8.3)(px, py) && py < 22.6 + 0.2 * (px - 80) ** 2 && py < 28.8, C.HAIR);
fill((px, py) => ell(80, 29.5, 6.4, 8.3)(px, py) && Math.abs(py - (23.6 + 0.2 * (px - 80) ** 2)) < 0.55 && py < 29, C.OUT);
// strand lines in the crown and the side hair
for (const [cx, cy, rx, ry, a0, a1] of [[80, 23, 9.5, 8, 3.5, 6.0], [80, 23, 6.5, 5.5, 3.6, 5.8], [80, 23, 9.5, 8, -2.6, 0.5]]) {
  for (let a = a0; a <= a1; a += 0.02) {
    const x = Math.round(cx + rx * Math.cos(a) - 0.5), y = Math.round(cy + ry * Math.sin(a) - 0.5);
    if (BASE[y * W + x] === C.HAIR) put(x, y, C.DK);
  }
}
for (let y = 26; y < 41; y++) { put(70, y, BASE[y * W + 70] === C.HAIR ? C.DK : BASE[y * W + 70]); put(89, y, BASE[y * W + 89] === C.HAIR ? C.DK : BASE[y * W + 89]); }
// the circlet: gold over the crown, jewels set in it
for (let a = 3.4; a <= 6.03; a += 0.01) {
  const x = Math.round(80 + 11.6 * Math.cos(a) - 0.5), y = Math.round(23.5 + 8.6 * Math.sin(a) - 0.5);
  put(x, y, C.GOLD); put(x, y + 1, C.GOLD);
}
for (const a of [3.75, 4.2, 4.71, 5.22, 5.67]) {
  const x = Math.round(80 + 11.6 * Math.cos(a) - 0.5), y = Math.round(23.5 + 8.6 * Math.sin(a) - 0.5);
  put(x, y, C.OUT); put(x, y + 1, a === 4.71 ? C.ROSE : C.TEAL);
}
// her features: closed lids, brows, the nose, the mouth
pts([[75, 29], [76, 30], [77, 30], [78, 29], [82, 29], [83, 30], [84, 30], [85, 29]], C.OUT);
pts([[75, 27], [76, 26], [77, 26], [83, 26], [84, 26], [85, 27]], C.DK);
pts([[80, 31], [80, 32]], C.ROSE);
pts([[79, 34], [80, 34], [81, 34]], C.LIPS);
pts([[80, 35]], C.ROSE);

// ------------------------------------------------------------ the frame
// the opening is a rounded rectangle; outside it a gold band between dark keylines
function opening(px, py) {
  const ins = 4, r = 7;
  const qx = Math.abs(px - W / 2) - (W / 2 - ins - r), qy = Math.abs(py - H / 2) - (H / 2 - ins - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const e = opening(x + 0.5, y + 0.5);
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) BASE[y * W + x] = C.OUT;
    else if (e > 1) BASE[y * W + x] = C.GOLD;
    else if (e > 0) BASE[y * W + x] = C.OUT;
  }
// a jewel in each corner of the frame
for (const [cx, cy] of [[4.5, 4.5], [W - 4.5, 4.5], [4.5, H - 4.5], [W - 4.5, H - 4.5]]) blob(cx, cy, 1.6, 1.6, C.TEAL);
