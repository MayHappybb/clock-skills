// Dollhouse: the house itself, baked once. A cutaway front of an L-shaped
// dollhouse on the 128x128 raster with its top-right panel missing:
//   roof     y 0..14   (left tower only)
//   nursery  x 2..61,  y 17..60   (hours are crayoned on this wall)
//   kitchen  x 2..61,  y 66..122  (stairs up the back wall, stove, kettle)
//   living   x 66..125, y 66..122 (minutes are crayoned on this wall)
// Each pixel has an albedo, a room, and how strongly that room's lamp
// reaches it; frame() multiplies by the room's light of the moment.
export const W = 128, H = 128;
export const ROOM = { FRAME: 0, NURSERY: 1, KITCHEN: 2, LIVING: 3, ROOF: 4, WINDOW: 5 };
export const FLOOR = { up: 60, down: 122 };
export const STAIR = { x0: 60, y0: 122, x1: 16, y1: 60 };          // foot (kitchen) to top (nursery)
export const stairY = (x) => STAIR.y0 - ((STAIR.x0 - x) * (STAIR.y0 - STAIR.y1)) / (STAIR.x0 - STAIR.x1);
export const LAMPS = [
  null,
  { x: 31, y: 50, r: 34 },   // nursery: bedside lamp
  { x: 40, y: 74, r: 40 },   // kitchen: pendant
  { x: 119, y: 112, r: 46 }, // living: table lamp
];
export const WIN = { x: 3, y: 70, w: 12, h: 17 };                  // kitchen window
export const TABLE = { x: 86, w: 21, top: 114 };                   // coffee table in the living room

export const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !(x >= 64 && y < 64);

const hexl = (s) => {
  const n = parseInt(s.slice(1), 16), f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
};
const k = (c, a) => [c[0] * a, c[1] * a, c[2] * a];

export function bake() {
  const alb = new Float32Array(3 * W * H), emis = new Float32Array(3 * W * H);
  const room = new Uint8Array(W * H), pool = new Float32Array(W * H);
  const put = (x, y, c, r = -1) => {
    if (!inside(x, y)) return;
    const p = y * W + x; alb[3 * p] = c[0]; alb[3 * p + 1] = c[1]; alb[3 * p + 2] = c[2];
    if (r >= 0) room[p] = r;
  };
  const glow = (x, y, c) => { if (!inside(x, y)) return; const p = y * W + x; emis[3 * p] = c[0]; emis[3 * p + 1] = c[1]; emis[3 * p + 2] = c[2]; };
  const rect = (x0, y0, w, h, c, r) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(x, y, c, r); };

  const FRAMEC = hexl('#6e5a44'), FRAMEHI = hexl('#9a8366');
  const WOOD = hexl('#5a3418'), WOODHI = hexl('#7d4a24'), WOODDK = hexl('#2e1a0c');
  // ---- walls (wallpaper per room)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    let c = FRAMEC, r = ROOM.FRAME;
    if (x >= 2 && x <= 61 && y >= 17 && y <= 60) {
      // nursery: dusk-blue paper with tiny gold stars
      r = ROOM.NURSERY; c = hexl('#34406c');
      const sx = (x + (Math.floor(y / 9) % 2) * 5) % 10, sy = y % 9;
      if ((sx === 2 && sy === 4) || ((sx === 1 || sx === 3) && sy === 4 && false)) c = hexl('#7a6a40');
    } else if (x >= 2 && x <= 61 && y >= 66 && y <= 122) {
      // kitchen: two-tone mint tiles
      r = ROOM.KITCHEN; c = ((Math.floor(x / 5) + Math.floor(y / 5)) & 1) ? hexl('#2e5a4a') : hexl('#264c3e');
    } else if (x >= 66 && x <= 125 && y >= 66 && y <= 122) {
      // living room: rose paper with a faint diamond dot
      r = ROOM.LIVING; c = hexl('#5c3236');
      if ((x + y) % 8 === 0 && (x - y + 128) % 8 === 0) c = hexl('#74444a');
    } else if (x >= 62 && x <= 65 && y >= 91 && y <= 122) {
      r = ROOM.LIVING; c = hexl('#3a2626');                // doorway: the passage between the rooms
    }
    put(x, y, c, r);
  }
  // ---- skirting boards
  for (let x = 2; x <= 125; x++) for (const y of [119, 120, 121]) {
    if (x >= 62 && x <= 65) continue;
    put(x, y, y === 119 ? WOODHI : WOOD);
  }
  for (let x = 2; x <= 61; x++) for (const y of [58, 59]) put(x, y, y === 58 ? WOODHI : WOOD);
  // ---- floors and slabs (front edge of the boards)
  for (let x = 0; x < W; x++) {
    for (let y = 61; y <= 65; y++) if (inside(x, y)) put(x, y, y === 61 || y === 64 && x >= 64 ? FRAMEHI : (y === 65 ? WOODDK : FRAMEC), ROOM.FRAME);
    for (let y = 123; y <= 124; y++) put(x, y, (x % 13 === 0) ? WOODDK : (y === 123 ? WOODHI : WOOD), ROOM.FRAME);
    for (let y = 125; y <= 127; y++) put(x, y, ((x + (y - 125) * 4) % 9 === 0) ? hexl('#1a1a1c') : hexl('#3a3a3e'), ROOM.FRAME);
    for (let y = 15; y <= 16; y++) if (x < 64) put(x, y, y === 15 ? FRAMEHI : FRAMEC, ROOM.FRAME);
  }
  // stairwell: the hole in the nursery floor
  for (let x = 8; x <= 24; x++) for (let y = 61; y <= 65; y++) put(x, y, hexl('#14100c'), ROOM.KITCHEN);
  // divider wall lintel between kitchen and living room
  for (let x = 62; x <= 65; x++) for (let y = 66; y <= 90; y++) put(x, y, x === 62 || x === 65 ? FRAMEHI : FRAMEC, ROOM.FRAME);
  // ---- roof: terracotta scallops in the gable
  for (let y = 0; y <= 14; y++) for (let x = 0; x < 64; x++) {
    const half = 2 + (y + 1) * 2.25, dx = Math.abs(x - 31.5);
    if (dx > half) { put(x, y, [0, 0, 0], ROOM.FRAME); continue; }
    let c = hexl('#7a2a18');
    const row = Math.floor(y / 3), off = (row & 1) * 3, sc = ((x + off) % 6), yy = y % 3;
    if (yy === 2 && (sc === 0 || sc === 5)) c = hexl('#3a120a');
    else if (yy === 0) c = hexl('#94381e');
    if (dx > half - 1.2) c = FRAMEHI;                     // fascia
    put(x, y, c, ROOM.ROOF);
  }
  for (let y = 6; y <= 11; y++) for (let x = 28; x <= 35; x++) {          // attic window
    const d = Math.hypot(x - 31.5, y - 8.5);
    if (d < 3.6) put(x, y, d > 2.6 ? FRAMEHI : hexl('#1a2440'), ROOM.ROOF);
  }

  // ---- nursery furniture
  rect(38, 52, 21, 3, hexl('#a03050'), ROOM.NURSERY);       // blanket
  rect(52, 50, 6, 3, hexl('#c8c0c8'), ROOM.NURSERY);        // pillow
  rect(38, 55, 21, 1, hexl('#d0c8d0'), ROOM.NURSERY);       // sheet edge
  rect(38, 56, 21, 2, WOOD, ROOM.NURSERY);                  // bed frame
  rect(38, 58, 2, 3, WOOD, ROOM.NURSERY); rect(57, 58, 2, 3, WOOD, ROOM.NURSERY);
  rect(59, 48, 2, 13, WOODHI, ROOM.NURSERY);                // headboard
  rect(37, 51, 1, 10, WOODHI, ROOM.NURSERY);                // footboard
  rect(27, 55, 8, 6, WOOD, ROOM.NURSERY);                   // nightstand
  rect(27, 55, 8, 1, WOODHI, ROOM.NURSERY);
  rect(30, 53, 2, 2, WOODDK, ROOM.NURSERY);                 // lamp stem
  for (let y = 49; y <= 52; y++) for (let x = 27 + (52 - y) * 0 - (y - 49) * 0; x <= 34; x++) {
    const inset = Math.round((52 - y) * 0.5);
    if (x >= 27 + inset && x <= 34 - inset) { put(x, y, hexl('#3a3020'), ROOM.NURSERY); glow(x, y, k(hexl('#ffcf7a'), 0.55)); }
  }
  // stairwell railing round the hole
  for (let x = 6; x <= 26; x++) put(x, 52, WOODHI, ROOM.NURSERY);
  for (let x = 7; x <= 25; x += 3) for (let y = 53; y <= 60; y++) put(x, y, WOOD, ROOM.NURSERY);

  // ---- kitchen: stairs up the back wall
  for (let x = 14; x <= 61; x++) {
    const ys = stairY(x);
    for (let y = Math.ceil(ys); y <= 122; y++) {                          // under-stair cupboard
      // under-stair cupboard: vertical boards with a little arched door
      const dr = Math.hypot((x - 47) / 6, (y - 112) / 9);
      let c = (x % 4 === 0) ? hexl('#2a1a10') : hexl('#3a2618');
      if (x >= 41 && x <= 53 && y >= 106 && y <= 121 && (y >= 112 || dr < 1)) c = (x === 41 || x === 53 || (y < 112 && dr > 0.85)) ? hexl('#3a2210') : hexl('#5a3a20');
      if (x === 51 && y === 114) c = hexl('#e0c060');
      if (y > ys + 3) put(x, y, c, ROOM.KITCHEN);
      else put(x, y, WOOD, ROOM.KITCHEN);                                 // stringer
    }
  }
  for (let s = 1; s <= 10; s++) {                                         // treads
    const yt = STAIR.y0 - 6.2 * s, xt = STAIR.x0 - 4.4 * s;
    for (let x = Math.round(xt) - 1; x <= Math.round(xt) + 4; x++) {
      put(x, Math.round(yt) - 1, FRAMEHI, ROOM.KITCHEN); put(x, Math.round(yt), WOODHI, ROOM.KITCHEN); put(x, Math.round(yt) + 1, WOODDK, ROOM.KITCHEN);
    }
  }
  for (let x = 18; x <= 60; x++) {                                        // handrail + balusters
    const yr = Math.round(stairY(x) - 10);
    put(x, yr, WOODHI, ROOM.KITCHEN);
    if (x % 6 === 0) for (let y = yr + 1; y < stairY(x) - 1; y++) put(x, y, WOOD, ROOM.KITCHEN);
  }
  // window frame (the glass is drawn live)
  for (let y = WIN.y - 1; y <= WIN.y + WIN.h; y++) for (let x = WIN.x - 1; x <= WIN.x + WIN.w; x++) {
    const edge = x < WIN.x || y < WIN.y || x >= WIN.x + WIN.w || y >= WIN.y + WIN.h || x === WIN.x + 5 || y === WIN.y + 8;
    if (edge) put(x, y, FRAMEHI, ROOM.KITCHEN);
    else { const p = y * W + x; room[p] = ROOM.WINDOW; }
  }
  rect(2, WIN.y + WIN.h + 1, 15, 1, WOODHI, ROOM.KITCHEN);                // sill
  // stove with oven door
  rect(2, 104, 16, 18, hexl('#202024'), ROOM.KITCHEN);
  rect(2, 104, 16, 1, hexl('#4a4a50'), ROOM.KITCHEN);
  rect(4, 109, 12, 8, hexl('#101012'), ROOM.KITCHEN);
  for (let x = 6; x <= 13; x++) for (let y = 111; y <= 114; y++) glow(x, y, k(hexl('#ff5a10'), 0.18));
  rect(3, 118, 2, 4, hexl('#101012'), ROOM.KITCHEN); rect(15, 118, 2, 4, hexl('#101012'), ROOM.KITCHEN);
  // kettle on the hob
  for (let y = 97; y <= 103; y++) for (let x = 5; x <= 14; x++) {
    const d = Math.hypot((x - 9.5) / 4.6, (y - 101) / 3.4);
    if (d < 1 && y >= 98) put(x, y, y === 98 ? hexl('#e07040') : hexl('#b04020'), ROOM.KITCHEN);
  }
  put(9, 97, hexl('#202024'), ROOM.KITCHEN); put(10, 97, hexl('#202024'), ROOM.KITCHEN);
  for (const [x, y] of [[4, 100], [3, 99], [2, 98]]) put(x, y, hexl('#b04020'), ROOM.KITCHEN);   // spout
  for (const [x, y] of [[7, 96], [8, 95], [9, 95], [10, 95], [11, 95], [12, 96]]) put(x, y, hexl('#303034'), ROOM.KITCHEN);
  // pendant lamp
  for (let y = 66; y <= 71; y++) put(40, y, hexl('#202020'), ROOM.KITCHEN);
  for (let y = 72; y <= 75; y++) for (let x = 40 - (y - 70); x <= 40 + (y - 70); x++) { put(x, y, hexl('#2a4a3a'), ROOM.KITCHEN); if (y === 75) glow(x, y, k(hexl('#ffd890'), 0.6)); }

  // ---- living room
  rect(TABLE.x, TABLE.top, TABLE.w, 2, WOODHI, ROOM.LIVING);              // coffee table
  rect(TABLE.x + 1, TABLE.top + 2, TABLE.w - 2, 1, WOOD, ROOM.LIVING);
  rect(TABLE.x + 2, TABLE.top + 3, 2, 6, WOOD, ROOM.LIVING); rect(TABLE.x + TABLE.w - 4, TABLE.top + 3, 2, 6, WOOD, ROOM.LIVING);
  rect(113, 117, 12, 2, WOODHI, ROOM.LIVING); rect(114, 119, 2, 3, WOOD, ROOM.LIVING); rect(122, 119, 2, 3, WOOD, ROOM.LIVING);
  rect(118, 115, 2, 2, WOODDK, ROOM.LIVING);                              // lamp stem
  for (let y = 110; y <= 114; y++) {
    const inset = Math.round((114 - y) * 0.6);
    for (let x = 114 + inset; x <= 123 - inset; x++) { put(x, y, hexl('#40301c'), ROOM.LIVING); glow(x, y, k(hexl('#ffc070'), 0.5)); }
  }
  // the rug on the floorboards, and a stack of toy blocks
  for (let x = 74; x <= 112; x++) put(x, 122, ((x >> 1) & 1) ? hexl('#5a2a46') : hexl('#3a6a6a'), ROOM.LIVING);
  rect(68, 116, 6, 6, hexl('#c03020'), ROOM.LIVING); rect(74, 116, 6, 6, hexl('#2050b0'), ROOM.LIVING);
  rect(71, 110, 6, 6, hexl('#d0a020'), ROOM.LIVING);
  for (const [x, y] of [[68, 116], [74, 116], [71, 110]]) { rect(x, y, 6, 1, [0.5, 0.45, 0.4], ROOM.LIVING); }

  // lamp pools
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, r = room[p] === ROOM.WINDOW ? 0 : room[p];
    const L = LAMPS[r];
    if (!L) continue;
    const d2 = ((x - L.x) ** 2 + (y - L.y) ** 2) / (L.r * L.r);
    pool[p] = 1 / (1 + 2.2 * d2);
  }
  return { alb, emis, room, pool };
}
