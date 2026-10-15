// Snake numerals: each digit is a spanning tree of 8 px cells, and the snakes
// run the Hamiltonian cycle round it on the 4 px grid (the classic trick a
// Snake AI uses to never bite itself). So every stroke is two snake lanes side
// by side, out along one side and back along the other, with a 1 px seam
// between; tips are U-turns, and a cycle in the digit (the bowl of 0, 6, 8, 9)
// is cut once so the tree stays a tree (the cut shows as one more 1 px seam).
//
// Built once at load (flash on the device): per digit, the loop as a pixel
// path (x, y, direction for every 1 px of arc) and the tube table (every ink
// pixel of the fully covered digit with its arc position s and its lateral
// offset -1, 0, 1 across the lane).

export const CELL = 8, FINE = 4, GW = 32, GH = 56;

// 4 x 7 cells; '#' a cell. cuts: tree edges removed, [c1, r1, c2, r2].
const DIGITS = [
  { rows: ['####', '#..#', '#..#', '#..#', '#..#', '#..#', '####'], cuts: [[1, 0, 2, 0]] },
  { rows: ['.##.', '..#.', '..#.', '..#.', '..#.', '..#.', '.###'], cuts: [] },
  { rows: ['####', '...#', '...#', '####', '#...', '#...', '####'], cuts: [] },
  { rows: ['####', '...#', '...#', '.###', '...#', '...#', '####'], cuts: [] },
  { rows: ['#..#', '#..#', '#..#', '####', '...#', '...#', '...#'], cuts: [] },
  { rows: ['####', '#...', '#...', '####', '...#', '...#', '####'], cuts: [] },
  { rows: ['####', '#...', '#...', '####', '#..#', '#..#', '####'], cuts: [[1, 6, 2, 6]] },
  { rows: ['####', '...#', '..##', '..#.', '..#.', '..#.', '..#.'], cuts: [] },
  { rows: ['####', '#..#', '#..#', '####', '#..#', '#..#', '####'], cuts: [[1, 0, 2, 0], [1, 6, 2, 6]] },
  { rows: ['####', '#..#', '#..#', '####', '...#', '...#', '####'], cuts: [[1, 0, 2, 0]] },
];

function build(def) {
  const R = def.rows.length, C = def.rows[0].length;
  const isCell = (c, r) => r >= 0 && r < R && c >= 0 && c < C && def.rows[r][c] === '#';
  const cut = (a, b, c, d) => def.cuts.some(([p, q, u, v]) => (p === a && q === b && u === c && v === d) || (p === c && q === d && u === a && v === b));
  const link = (c, r, c2, r2) => isCell(c, r) && isCell(c2, r2) && !cut(c, r, c2, r2);
  // fine adjacency
  const adj = new Map();
  const key = (i, j) => j * 64 + i;
  const add = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b); adj.get(b).add(a);
  };
  const del = (a, b) => { adj.get(a)?.delete(b); adj.get(b)?.delete(a); };
  let nCells = 0, nEdges = 0;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (isCell(c, r)) {
    nCells++;
    const tl = key(2 * c, 2 * r), tr = key(2 * c + 1, 2 * r), bl = key(2 * c, 2 * r + 1), br = key(2 * c + 1, 2 * r + 1);
    add(tl, tr); add(bl, br); add(tl, bl); add(tr, br);
  }
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (isCell(c, r)) {
    if (link(c, r, c + 1, r)) {
      nEdges++;
      const tr = key(2 * c + 1, 2 * r), br = key(2 * c + 1, 2 * r + 1), ntl = key(2 * c + 2, 2 * r), nbl = key(2 * c + 2, 2 * r + 1);
      del(tr, br); del(ntl, nbl); add(tr, ntl); add(br, nbl);
    }
    if (link(c, r, c, r + 1)) {
      nEdges++;
      const bl = key(2 * c, 2 * r + 1), br = key(2 * c + 1, 2 * r + 1), dtl = key(2 * c, 2 * r + 2), dtr = key(2 * c + 1, 2 * r + 2);
      del(bl, br); del(dtl, dtr); add(bl, dtl); add(br, dtr);
    }
  }
  if (nEdges !== nCells - 1) throw new Error('snake glyph is not a tree: ' + def.rows.join('/'));
  // walk the cycle from the top-left-most fine cell
  const start = Math.min(...adj.keys());
  const cyc = [start];
  let prev = -1, cur = start;
  for (;;) {
    const nb = [...adj.get(cur)];
    if (nb.length !== 2) throw new Error('snake glyph: bad degree');
    const nx = nb[0] !== prev ? nb[0] : nb[1];
    if (nx === start) break;
    prev = cur; cur = nx; cyc.push(cur);
    if (cyc.length > 4096) throw new Error('snake glyph: no cycle');
  }
  if (cyc.length !== nCells * 4) throw new Error('snake glyph: cycle misses cells');
  // orientation: clockwise on screen (tree on the right of the direction of travel)
  let area = 0;
  for (let k = 0; k < cyc.length; k++) {
    const a = cyc[k], b = cyc[(k + 1) % cyc.length];
    area += (a % 64) * ((b >> 6)) - (b % 64) * ((a >> 6));
  }
  if (area < 0) { cyc.reverse(); cyc.unshift(cyc.pop()); }
  // the pixel path
  const n = cyc.length, L = n * FINE;
  const px = new Int16Array(L), py = new Int16Array(L), dx = new Int8Array(L), dy = new Int8Array(L);
  for (let k = 0; k < n; k++) {
    const a = cyc[k], b = cyc[(k + 1) % n];
    const ax = (a % 64) * FINE + 1, ay = (a >> 6) * FINE + 1, bx = (b % 64) * FINE + 1, by = (b >> 6) * FINE + 1;
    const ux = Math.sign(bx - ax), uy = Math.sign(by - ay);
    for (let m = 0; m < FINE; m++) {
      const s = k * FINE + m;
      px[s] = ax + ux * m; py[s] = ay + uy * m; dx[s] = ux; dy[s] = uy;
    }
  }
  // the tube: every pixel within 1 (Chebyshev) of the path, nearest path pixel wins
  const best = new Map();
  for (let s = 0; s < L; s++) {
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const x = px[s] + ox, y = py[s] + oy, k = y * 256 + x, d2 = ox * ox + oy * oy;
      const b = best.get(k);
      if (!b || d2 < b.d2) {
        // lateral: + is to the right of travel (screen coords: right of (dx,dy) is (-dy, dx))
        const lat = Math.sign(ox * -dy[s] + oy * dx[s]);
        best.set(k, { x, y, s, d2, lat, corner: d2 === 2 });
      }
    }
  }
  const tube = [...best.values()].filter((p) => !p.corner || true);
  const N = tube.length;
  const tx = new Int16Array(N), ty = new Int16Array(N), ts = new Int16Array(N), tl = new Int8Array(N);
  tube.forEach((p, i) => {
    tx[i] = p.x; ty[i] = p.y; ts[i] = p.s;
    // an outer corner pixel (diagonal only) is marked 2: drawn only where the body is full width,
    // left out on the outside of a bend to round it
    tl[i] = p.corner ? (p.lat > 0 ? 3 : -3) : p.lat;
  });
  return { L, px, py, dx, dy, N, tx, ty, ts, tl, cells: nCells };
}

export const GLYPHS = DIGITS.map(build);

// ------------------------------------------------------------ the snakes on each loop
// A digit's loop carries K snakes evenly spaced (sp px of arc apart), each
// LEN = sp - GAP long; the GAP ahead of each nose is where its pellet lies.
export const SPACING = 54, GAP = 8;
for (const G of GLYPHS) {
  const K = Math.max(3, Math.round(G.L / SPACING)), sp = G.L / K;
  G.K = K; G.sp = sp; G.len = Math.floor(sp) - GAP;
  // REL[rel] for rel = (travel - s) mod L: which snake covers arc s, and how far behind its nose
  G.REL = new Uint16Array(G.L);
  for (let r = 0; r < G.L; r++) {
    const k = Math.floor(r / sp);
    G.REL[r] = (k << 8) | Math.floor(r - k * sp);
  }
  G.HOFF = new Int16Array(K);
  for (let k = 0; k < K; k++) G.HOFF[k] = Math.ceil(k * sp - 1e-9);
}

// ------------------------------------------------------------ the pits
// At a turn the snakes dive through (and surface from) a row of pits spaced
// evenly round the whole loop, ~10 px of arc apart. PREV[a]: how far arc a is
// past the pit behind it (0 at a pit). A changing digit drains as every
// stitch slides into the pit ahead of it at once: even all over.
export const PIT_STEP = 10;
for (const G of GLYPHS) {
  const M = Math.round(G.L / PIT_STEP);
  G.PITS = Int16Array.from({ length: M }, (_, m) => Math.floor((m * G.L) / M));
  G.PREV = new Uint8Array(G.L);
  for (let m = 0; m < M; m++) {
    const a0 = G.PITS[m], a1 = m + 1 < M ? G.PITS[m + 1] : G.L;
    for (let a = a0; a < a1; a++) G.PREV[a] = a - a0;
  }
}

// ------------------------------------------------------------ the zone: the digit's moat
// Every pixel within ~3 px of the full tube, as a bit-free byte map of ZW x ZH
// at offset -ZO: what the hour's giant passes behind.
export const ZO = 4, ZW = GW + 2 * ZO, ZH = GH + 2 * ZO;
for (const G of GLYPHS) {
  const z = new Uint8Array(ZW * ZH);
  for (let i = 0; i < G.N; i++)
    for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
      if (ox * ox + oy * oy > 10) continue;
      const x = G.tx[i] + ox + ZO, y = G.ty[i] + oy + ZO;
      if (x >= 0 && y >= 0 && x < ZW && y < ZH) z[y * ZW + x] = 1;
    }
  // as a span list per row (start, end pairs), what the device would store
  const spans = [];
  for (let y = 0; y < ZH; y++) {
    let x = 0;
    while (x < ZW) {
      while (x < ZW && !z[y * ZW + x]) x++;
      if (x >= ZW) break;
      const a = x;
      while (x < ZW && z[y * ZW + x]) x++;
      spans.push(y, a, x);
    }
  }
  G.zone = Int16Array.from(spans);
}
