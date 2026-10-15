// Tetris clock helpers: the seven tetrominoes (SRS boxes), a cell font of
// ten digits drawn 6 x 14 cells for a 4 px cell on the 64 x 192 tower, and a
// deterministic exact-cover solver that cuts each digit into tetrominoes, so
// every numeral is a stack of real pieces.

// SRS spawn states, cells [x, y] in an n x n box (y down).
export const PIECES = {
  I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};
export const NAMES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
/** Cells of piece p in rotation r (0..3, clockwise), in its box. */
export function cellsOf(p, r) {
  const { n, cells } = PIECES[p];
  let c = cells;
  for (let k = 0; k < (r & 3); k++) c = c.map(([x, y]) => [n - 1 - y, x]);
  return c;
}

// The digits. Strokes are two cells thick so each reads as a built wall of
// blocks; corners are cut by one cell, curves step on the diagonal. Every
// glyph has a multiple of 4 cells and is tiled exactly by tetrominoes.
const G = {
  0: ['.####.', '######', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '######', '.####.'],
  1: ['..##..', '.###..', '####..', '.###..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '######'],
  2: ['.####.', '######', '##..##', '....##', '....##', '....##', '...###', '..###.', '.###..', '###...', '##....', '##....', '######', '######'],
  3: ['.####.', '######', '##..##', '....##', '....##', '..####', '..####', '....##', '....##', '....##', '....##', '##..##', '######', '.####.'],
  4: ['....##', '....##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '######', '######', '....##', '....##', '....##', '....##'],
  5: ['######', '######', '##....', '##....', '##....', '#####.', '######', '...###', '....##', '....##', '....##', '##..##', '######', '.####.'],
  6: ['..###.', '.###..', '###...', '##....', '##....', '##....', '#####.', '######', '##..##', '##..##', '##..##', '##..##', '######', '.####.'],
  7: ['######', '######', '....##', '...###', '...##.', '..###.', '.###..', '.###..', '.##...', '.##...', '.##...', '.##...', '.##...', '.##...'],
  8: ['.####.', '######', '##..##', '##..##', '##..##', '.####.', '.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '######', '.####.'],
  9: ['.####.', '######', '##..##', '##..##', '##..##', '##..##', '######', '.#####', '....##', '....##', '....##', '...###', '..###.', '.###..'],
};
export const GW = 6, GH = 14;
export const GLYPHS = Object.fromEntries(Object.entries(G).map(([k, rows]) => [k, rows.map((r) => [...r].map((ch) => ch === '#'))]));

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
const ORIENTS = (() => {
  const out = [];
  for (const p of NAMES) {
    const seen = new Set();
    for (let r = 0; r < 4; r++) {
      const c = cellsOf(p, r);
      const mx = Math.min(...c.map((q) => q[0])), my = Math.min(...c.map((q) => q[1]));
      const n = c.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      const key = JSON.stringify(n);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ p, r, cells: n, ox: mx, oy: my });   // n[0] is the first cell in reading order
    }
  }
  return out;
})();

/**
 * Exact cover of a boolean mask (rows of booleans) by tetrominoes.
 * Returns [{ p, r, x, y, cells: [[x, y]...] }] with x, y the SRS box origin,
 * or null. `seed` varies the cut; `avoid` discourages runs of the same piece.
 */
export function tile(mask, seed = 1) {
  const H = mask.length, W = mask[0].length, filled = mask.map((r) => r.map((v) => !v));
  const rnd = rng(seed), out = [];
  let steps = 0;
  function go() {
    if (++steps > 200000) return false;
    let fy = -1, fx = -1;
    for (let y = 0; y < H && fy < 0; y++) for (let x = 0; x < W; x++) if (!filled[y][x]) { fy = y; fx = x; break; }
    if (fy < 0) return true;
    const order = ORIENTS.map((o) => [rnd() + (o.p === 'I' ? 0.7 : o.p === 'O' ? 0.3 : 0), o]).sort((a, b) => a[0] - b[0]).map((a) => a[1]);
    for (const o of order) {
      const dx = fx - o.cells[0][0], dy = fy - o.cells[0][1];
      let ok = true;
      for (const [cx, cy] of o.cells) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H || filled[y][x]) { ok = false; break; }
      }
      if (!ok) continue;
      for (const [cx, cy] of o.cells) filled[cy + dy][cx + dx] = true;
      out.push({ p: o.p, r: o.r, x: dx - o.ox, y: dy - o.oy, cells: o.cells.map(([cx, cy]) => [cx + dx, cy + dy]) });
      if (go()) return true;
      out.pop();
      for (const [cx, cy] of o.cells) filled[cy + dy][cx + dx] = false;
    }
    return false;
  }
  return go() ? out : null;
}

/**
 * A droppable play sequence for a W x R area on a floor (the floor is missing
 * under `hole` columns), the way a player builds for a four-line clear: every
 * column but `well` is filled by an exact tiling, ordered so each piece falls
 * straight onto support with nothing above it and leaves no hole; then a
 * vertical I drops into the well and completes all R rows at once.
 */
export function strip(W, R, seed, hole = [], well = 0) {
  const mask = Array.from({ length: R }, () => Array.from({ length: W }, (_, x) => x !== well));
  for (let k = 0; k < 60; k++) {
    const t = tile(mask, seed * 977 + k * 131 + 7);
    if (!t) continue;
    const placed = Array.from({ length: R }, () => Array(W).fill(false));
    const seq = [], left = t.slice(), rnd = rng(seed * 31 + k);
    while (left.length) {
      const ok = left.filter((pc) => {
        const own = new Set(pc.cells.map(([x, y]) => y * W + x));
        let support = false;
        for (const [x, y] of pc.cells) {
          for (let yy = 0; yy < y; yy++) if (placed[yy][x] && !own.has(yy * W + x)) return false;      // path blocked
          if (y < R - 1 && !own.has((y + 1) * W + x) && !placed[y + 1][x]) return false;               // would leave a hole
          if (y === R - 1 ? !hole.includes(x) : placed[y + 1][x] && !own.has((y + 1) * W + x)) support = true;
        }
        return support;
      });
      if (!ok.length) break;
      // build low first, like a player: prefer the lowest-resting candidates
      ok.sort((a, b) => Math.max(...b.cells.map((c) => c[1])) - Math.max(...a.cells.map((c) => c[1])));
      const pick = ok[Math.floor(rnd() ** 2 * ok.length)];
      left.splice(left.indexOf(pick), 1);
      for (const [x, y] of pick.cells) placed[y][x] = true;
      seq.push(pick);
    }
    if (left.length) continue;
    seq.push({ p: 'I', r: 1, x: well - 2, y: 0, cells: [0, 1, 2, 3].map((y) => [well, y]) });
    return seq;
  }
  return null;
}
