// The playfield as flash tables: a byte map of the printed board (seigaiha
// print, brass pins and their flat shadows, the chrome guide rail), and the
// angle and distance of every pixel from the tulip for the fever sunburst.

export const W = 160, H = 80;
export const B = { GROUND: 0, PRINT: 1, PINSH: 2, PIN: 3, RAIL: 4, FRAME: 5 };
export const TX = 122, TY = 17;            // the tulip (start pocket)
export const WMX = 146, WMY = 14;          // the windmill

// The launched ball's hops: leaves the rail at A, strikes pins under B and C, into the tulip.
export const HOPS = [[98, 4.5, 0.62], [103, 9.5, 0.74], [111, 12.5, 0.87], [TX, 14.5, 1.0]];

/** Slot boxes of the four numerals [x, y, w, h]. */
export const SLOT_BOX = [[5, 9, 32, 64], [40, 9, 32, 64], [89, 30, 28, 46], [121, 30, 28, 46]];

export const PINS = [];
{
  const keep = (x, y) => {
    for (const [sx, sy, sw, sh] of SLOT_BOX) if (x > sx - 4 && x < sx + sw + 4 && y > sy - 4 && y < sy + sh + 4) return false;
    if (Math.abs(x - TX) < 10 && y > 6 && y < 25) return false;
    if (Math.hypot(x - WMX, y - WMY) < 9) return false;
    if (y < 9) return false;
    return x > 3 && x < 156 && y < 77;
  };
  for (let j = 0; j < 5; j++)
    for (let i = 0; i < 12; i++) {
      const x = 84 + i * 7 + (j & 1 ? 3 : 0), y = 10 + j * 5;
      if (keep(x, y)) PINS.push([x, y]);
    }
  // the pins the launched ball strikes
  PINS.push([102, 12], [110, 15]);
  // a few down the gaps beside the colon
  for (const y of [14, 22, 30, 66, 72]) PINS.push([79, y]);
}

export const BOARD = new Uint8Array(W * H);
export const ANG = new Uint8Array(W * H);     // angle round the tulip, 0..255
export const DIST = new Uint8Array(W * H);    // distance from the tulip, px
{
  const RC = 12;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, px = x + 0.5, py = y + 0.5;
      // seigaiha: rows of overlapping fans; a pixel shows the lowest row that covers it
      let v = B.GROUND;
      const R = 9;
      for (let j = Math.floor(py / (R / 2)) + 2; j >= 0; j--) {
        const cy = j * (R / 2), ox = j & 1 ? R : 0;
        const ci = Math.round((px - ox) / (2 * R)), cx = ci * 2 * R + ox;
        const d = Math.hypot(px - cx, py - cy);
        if (d < R) { const q = d / 2.25; v = q - Math.floor(q) < 0.34 && d > 1.5 ? B.PRINT : B.GROUND; break; }
      }
      // the guide rail: a chrome band round the field, rounded top corners
      const cx = x < RC ? RC - px : x >= W - RC ? px - (W - RC) : 0, cy = y < RC ? RC - py : 0;
      const e = cx > 0 && cy > 0 ? Math.hypot(cx, cy) - RC + 1.6 : Math.max(-px + 1.6, px - (W - 1.6), -py + 1.6);
      if (e > 1.5) v = B.FRAME; else if (e > -0.3) v = B.RAIL;
      BOARD[i] = v;
      const a = Math.atan2(py - TY, px - TX);
      ANG[i] = Math.floor(((a / (2 * Math.PI)) + 1) * 256) & 255;
      DIST[i] = Math.min(255, Math.round(Math.hypot(px - TX, py - TY)));
    }
  for (const [x, y] of PINS) {
    for (const [dx, dy, c] of [[0, 0, B.PIN], [1, 0, B.PIN], [0, 1, B.PIN], [1, 1, B.PIN], [1, 2, B.PINSH], [2, 2, B.PINSH], [2, 1, B.PINSH]]) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && (c === B.PIN || BOARD[yy * W + xx] <= B.PRINT)) BOARD[yy * W + xx] = c;
    }
  }
}
