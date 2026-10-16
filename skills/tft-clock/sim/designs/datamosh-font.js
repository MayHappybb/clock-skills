// datamosh: the numerals, drawn on the codec's own grid. Every glyph is
// 6 x 11 macroblocks of 4 x 4 px (24 x 44 px), so each stroke is a run of
// whole blocks: the unit the encoder predicts, moves and loses. Strokes are
// two blocks (8 px) thick, corners cut by one block.

export const MB = 4;                 // macroblock size, px
export const BW = 40, BH = 20;       // the screen in macroblocks
export const GW = 6, GH = 11;        // a glyph in macroblocks

const PICS = {
  0: ['.####.', '######', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '######', '.####.'],
  1: ['..##..', '.###..', '####..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '######', '######'],
  2: ['.####.', '######', '##..##', '....##', '...###', '..###.', '.###..', '###...', '##....', '######', '######'],
  3: ['#####.', '######', '....##', '....##', '.####.', '.####.', '....##', '....##', '....##', '######', '#####.'],
  4: ['##..##', '##..##', '##..##', '##..##', '######', '######', '....##', '....##', '....##', '....##', '....##'],
  5: ['######', '######', '##....', '##....', '#####.', '######', '....##', '....##', '##..##', '######', '.####.'],
  6: ['.####.', '######', '##....', '##....', '#####.', '######', '##..##', '##..##', '##..##', '######', '.####.'],
  7: ['######', '######', '....##', '....##', '...##.', '...##.', '..##..', '..##..', '..##..', '..##..', '..##..'],
  8: ['.####.', '######', '##..##', '##..##', '.####.', '.####.', '##..##', '##..##', '##..##', '######', '.####.'],
  9: ['.####.', '######', '##..##', '##..##', '##..##', '######', '.#####', '....##', '....##', '######', '.####.'],
};

/** GLYPH[d][j * GW + i]: 1 stroke, 2 enclosed counter, 0 open. */
export const GLYPH = Array.from({ length: 10 }, (_, d) => {
  const a = new Uint8Array(GW * GH);
  PICS[d].forEach((row, j) => { for (let i = 0; i < GW; i++) if (row[i] === '#') a[j * GW + i] = 1; });
  // Counters: open cells not reachable from the glyph box's border.
  const seen = new Uint8Array(GW * GH), st = [];
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++)
    if ((i === 0 || j === 0 || i === GW - 1 || j === GH - 1) && !a[j * GW + i]) { seen[j * GW + i] = 1; st.push(j * GW + i); }
  while (st.length) {
    const k = st.pop(), i = k % GW, j = (k / GW) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) continue;
      const q = jj * GW + ii;
      if (!a[q] && !seen[q]) { seen[q] = 1; st.push(q); }
    }
  }
  for (let k = 0; k < GW * GH; k++) if (!a[k] && !seen[k]) a[k] = 2;
  return a;
});

/** Glyph boxes' top-left, in macroblocks: HH : MM. */
export const SLOT_X = [5, 12, 22, 29];
export const SLOT_Y = 4;
/** The colon: two 2 x 2-block dots. */
export const COLON = [[19, 6], [19, 11]];
