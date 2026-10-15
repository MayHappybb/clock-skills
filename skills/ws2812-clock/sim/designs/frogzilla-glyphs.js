// Frogzilla's skyline digits: ten Art Deco towers, 12 x 22 LEDs each, drawn
// for the 2 mm HUB75 grid. Curves are setbacks (stepped corners), diagonals
// are ziggurat stairs, every wall is 3 LEDs thick so a window line runs up
// its core. Each tower also wears a floodlit gold crown (Chrysler arches,
// Empire setbacks, a needle) above its roof, which never touches the digit.
//
// Exported per digit: { cells: [{x, y, core, roof, crown}], mast, height, ink }
// with y 0 at the roof and 21 at street level; crown cells have y < 0.

const G = {
  0: ['..########..', '.##########.', '############', '####....####',
    ...Array(14).fill('###......###'),
    '####....####', '############', '############', '############'],
  1: ['.....###....', '....####....', '..######....', '.###.###....', '.##..###....',
    ...Array(14).fill('.....###....'),
    '..#########.', '..#########.', '..#########.'],
  2: ['..########..', '.##########.', '####....####', '###......###', '###......###',
    '.........###', '.........###', '........####', '.......####.', '......####..',
    '.....####...', '....####....', '...####.....', '..####......', '.####.......',
    '####........', '###.........', '###.........', '###.........',
    '############', '############', '############'],
  3: ['..########..', '.##########.', '####....####', '###......###',
    '.........###', '.........###', '.........###', '.........###', '........####',
    '....#######.', '....######..', '....#######.', '........####',
    '.........###', '.........###', '.........###', '.........###',
    '###......###', '###......###', '####....####', '.##########.', '..########..'],
  4: ['........###.', '.......####.', '.......####.', '......#####.', '......#####.',
    '.....######.', '....###.###.', '....###.###.', '...###..###.', '..###...###.',
    '..###...###.', '.###....###.', '.###....###.',
    '############', '############', '############',
    ...Array(6).fill('........###.')],
  5: ['###########.', '###########.', '###########.',
    ...Array(5).fill('###.........'),
    '##########..', '###########.', '############', '........####',
    ...Array(5).fill('.........###'),
    '###......###', '####....####', '############', '.##########.', '..########..'],
  6: ['..########..', '.##########.', '####....####', '###......###',
    ...Array(5).fill('###.........'),
    '##########..', '###########.', '############', '####....####',
    ...Array(6).fill('###......###'),
    '####....####', '.##########.', '..########..'],
  7: ['############', '############', '############', '.........###', '........####',
    '........###.', '.......####.', '.......###..', '......####..', '......###...',
    '.....####...', '.....###....', '....####....',
    ...Array(9).fill('....###.....')],
  8: ['..########..', '.##########.', '####....####',
    ...Array(4).fill('###......###'),
    '####....####', '.##########.', '..########..', '.##########.', '####....####',
    ...Array(7).fill('###......###'),
    '####....####', '.##########.', '..########..'],
};
G[9] = G[6].slice().reverse().map((r) => [...r].reverse().join(''));

// crowns, drawn top row first: g gold setback, w lit crown window, m mast
// (the frog grips the top of the mast; its aviation light sits above it)
const CHRYSLER = ['.....m......', '.....mm.....', '....gwwg....', '...gwggwg...', '..gwgwwgwg..'];
const EMPIRE = ['.....m......', '.....m......', '....gggg....', '....gwwg....', '..gggggggg..'];
const DECO = ['......m.....', '.....gg.....', '....gwwg....', '...gggggg...', '..gwgwwgwg..'];
const NEEDLE = ['......m.....', '......m.....', '......m.....', '.....ggg....', '.....gwg....'];
const shift = (rows, n) => rows.map((r) => (n > 0 ? '.'.repeat(n) + r.slice(0, -n) : r));
const CROWN = { 0: CHRYSLER, 1: NEEDLE, 2: EMPIRE, 3: DECO, 4: shift(NEEDLE, 3), 5: EMPIRE, 6: DECO, 7: EMPIRE, 8: CHRYSLER, 9: DECO };

export const GW = 12, GH = 22;

function build(d) {
  const rows = G[d];
  if (rows.length !== GH || rows.some((r) => r.length !== GW)) throw new Error(`glyph ${d} is not ${GW}x${GH}`);
  const ink = (x, y) => y >= 0 && y < GH && x >= 0 && x < GW && rows[y][x] === '#';
  const cells = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (!ink(x, y)) continue;
    const core = ink(x - 1, y) && ink(x + 1, y) && ink(x, y - 1) && ink(x, y + 1);
    const roof = !ink(x, y - 1);
    cells.push({ x, y, core, roof, crown: 0 });
  }
  const cr = CROWN[d], ch = cr.length;
  let mast = null;
  cr.forEach((row, j) => {
    const y = j - ch;                          // -ch .. -1
    for (let x = 0; x < GW; x++) {
      const t = row[x];
      if (t === '.') continue;
      cells.push({ x, y, core: t === 'w', roof: false, crown: t === 'm' ? 2 : 1 });
      if (t === 'm' && !mast) mast = [x, y - 1];
    }
  });
  return { cells, mast, height: GH + ch, ink };
}

export const GLYPHS = Array.from({ length: 10 }, (_, d) => build(d));
