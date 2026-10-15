// Teletext weather: the cloud numerals, drawn on the sixel grid (one sixel
// = one 2x2 px mosaic block). Each digit is a hand-drawn 10 x 15 sixel base
// (strokes three sixels thick, counters at least 4 x 3 sixels open) and a
// cumulus rim around it: the sixels just outside the base where a puff may
// billow. Rims are only allowed on the outer silhouette (a rim sixel needs
// two free directions to the edge of the box), never on an underside (a
// cloud has a flat base: those are its drip points), and never inside a
// counter or the mouth of an open bowl, so no puff can close a counter or
// turn one digit into another.
//
// Everything here is built once at load: flash tables.

export const GW = 10, GH = 15;          // base size, sixels
export const M = 2;                     // rim margin round the base
export const FW = GW + 2 * M, FH = GH + M + 1;   // field: rims above and at the sides, one row below for drips

const ART = {
  0: `
  ..XXXXXX..
  .XXXXXXXX.
  XXXX..XXXX
  XXX....XXX
  XXX....XXX
  XXX....XXX
  XXX....XXX
  XXX....XXX
  XXX....XXX
  XXX....XXX
  XXX....XXX
  XXX....XXX
  XXXX..XXXX
  .XXXXXXXX.
  ..XXXXXX..`,
  1: `
  ...XXXX...
  ..XXXXX...
  .XXXXXX...
  XXX.XXX...
  ....XXX...
  ....XXX...
  ....XXX...
  ....XXX...
  ....XXX...
  ....XXX...
  ....XXX...
  ....XXX...
  .XXXXXXXX.
  .XXXXXXXX.
  .XXXXXXXX.`,
  2: `
  ..XXXXXX..
  .XXXXXXXX.
  XXXX..XXXX
  XXX....XXX
  .......XXX
  ......XXXX
  .....XXXX.
  ....XXXX..
  ...XXXX...
  ..XXXX....
  .XXXX.....
  XXXX......
  XXXXXXXXXX
  XXXXXXXXXX
  XXXXXXXXXX`,
  3: `
  ..XXXXXX..
  .XXXXXXXX.
  XXXX..XXXX
  XXX....XXX
  .......XXX
  ......XXXX
  ...XXXXXX.
  ...XXXXX..
  ...XXXXXX.
  ......XXXX
  .......XXX
  XXX....XXX
  XXXX..XXXX
  .XXXXXXXX.
  ..XXXXXX..`,
  4: `
  ..XXX..XXX
  ..XXX..XXX
  ..XXX..XXX
  .XXX...XXX
  .XXX...XXX
  .XXX...XXX
  XXX....XXX
  XXX....XXX
  XXXXXXXXXX
  XXXXXXXXXX
  XXXXXXXXXX
  .......XXX
  .......XXX
  .......XXX
  .......XXX`,
  5: `
  XXXXXXXXXX
  XXXXXXXXXX
  XXXXXXXXXX
  XXX.......
  XXX.......
  XXXXXXXX..
  XXXXXXXXX.
  XXXXXXXXXX
  .......XXX
  .......XXX
  .......XXX
  XXX....XXX
  XXXX..XXXX
  .XXXXXXXX.
  ..XXXXXX..`,
  6: `
  ..XXXXXX..
  .XXXXXXXX.
  XXXX..XXXX
  XXX....XXX
  XXX.......
  XXX.......
  XXXXXXXX..
  XXXXXXXXX.
  XXXX..XXXX
  XXX....XXX
  XXX....XXX
  XXX....XXX
  XXXX..XXXX
  .XXXXXXXX.
  ..XXXXXX..`,
  7: `
  XXXXXXXXXX
  XXXXXXXXXX
  XXXXXXXXXX
  ......XXXX
  .....XXXX.
  .....XXX..
  ....XXXX..
  ....XXX...
  ...XXXX...
  ...XXX....
  ...XXX....
  ...XXX....
  ...XXX....
  ...XXX....
  ...XXX....`,
  8: `
  .XXXXXXXX.
  XXXXXXXXXX
  XXX....XXX
  XXX....XXX
  XXX....XXX
  .XXXXXXXX.
  .XXXXXXXX.
  XXX....XXX
  XXX....XXX
  XXX....XXX
  XXX....XXX
  XXX....XXX
  XXXX..XXXX
  .XXXXXXXX.
  ..XXXXXX..`,
  9: `
  ..XXXXXX..
  .XXXXXXXX.
  XXXX..XXXX
  XXX....XXX
  XXX....XXX
  XXX....XXX
  XXXX..XXXX
  .XXXXXXXXX
  ..XXXXXXXX
  .......XXX
  .......XXX
  XXX....XXX
  XXXX..XXXX
  .XXXXXXXX.
  ..XXXXXX..`,
};

/**
 * One glyph, as flat lists of field coordinates (x + y * FW):
 *   base   the digit itself, with a rank in [0, 1) each (the order it rains out / blows in)
 *   rim1   puff sixels touching the base, rim2 one further out (each with the index of its rim1 parent)
 *   drip   underside sixels just below the base, where rain falls from
 */
function build(d) {
  const rows = ART[d].split('\n').map((r) => r.trim()).filter(Boolean);
  if (rows.length !== GH || rows.some((r) => r.length !== GW)) throw new Error(`teletext glyph ${d}: bad size`);
  const B = new Uint8Array(FW * FH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (rows[y][x] === 'X') B[(y + M) * FW + x + M] = 1;
  const isB = (x, y) => x >= 0 && y >= 0 && x < FW && y < FH && B[y * FW + x] === 1;
  // how many of the four straight rays from (x, y) leave the field without touching the base
  const free = (x, y) => {
    let n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let cx = x + dx, cy = y + dy, hit = false;
      while (cx >= 0 && cy >= 0 && cx < FW && cy < FH) { if (isB(cx, cy)) { hit = true; break; } cx += dx; cy += dy; }
      if (!hit) n++;
    }
    return n;
  };
  const base = [], rank = [];
  for (let i = 0; i < FW * FH; i++) if (B[i]) base.push(i);
  // a fixed shuffle: removal and arrival are spread evenly over the digit
  let s = 0x9e3779b9 ^ (d * 2654435761);
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  const order = base.map((_, k) => [rnd(), k]).sort((a, b) => a[0] - b[0]);
  const rk = new Float32Array(base.length);
  order.forEach(([, k], n) => { rk[k] = n / base.length; });
  for (let k = 0; k < base.length; k++) rank.push(rk[k]);

  const rim1 = [], rim2 = [], par2 = [], drip = [];
  const r1at = new Int16Array(FW * FH).fill(-1);
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      if (isB(x, y)) continue;
      const up = isB(x, y - 1), dn = isB(x, y + 1), lf = isB(x - 1, y), rt = isB(x + 1, y);
      if (!(up || dn || lf || rt)) continue;
      if (up && !dn && !lf && !rt) {        // only the base above: an underside
        let clear = true;
        for (let cy = y + 1; cy < FH; cy++) if (isB(x, cy)) clear = false;
        if (clear) drip.push(y * FW + x);
        continue;
      }
      if (up && !dn) continue;               // undersides never puff
      if (free(x, y) < 2) continue;          // inside a counter or a bowl's mouth
      r1at[y * FW + x] = rim1.length;
      rim1.push(y * FW + x);
    }
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      if (isB(x, y) || r1at[y * FW + x] >= 0) continue;
      // one further out from a rim1 sixel, above it or beside it (never below)
      let p = -1;
      if (y + 1 < FH && r1at[(y + 1) * FW + x] >= 0) p = r1at[(y + 1) * FW + x];
      else if (x + 1 < FW && r1at[y * FW + x + 1] >= 0 && !isB(x, y + 1)) p = r1at[y * FW + x + 1];
      else if (x > 0 && r1at[y * FW + x - 1] >= 0 && !isB(x, y + 1)) p = r1at[y * FW + x - 1];
      if (p < 0 || free(x, y) < 3) continue;
      rim2.push(y * FW + x); par2.push(p);
    }
  return {
    base: Int16Array.from(base), rank: Float32Array.from(rank), srank: Float32Array.from(rank.map(Math.sqrt)),
    rim1: Int16Array.from(rim1), rim2: Int16Array.from(rim2), par2: Int16Array.from(par2),
    drip: Int16Array.from(drip),
  };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => build(d));
