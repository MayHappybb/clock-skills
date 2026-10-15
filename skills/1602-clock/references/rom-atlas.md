# The factory ROM, and what is worth using in it

Codes 0x10-0xFF display from the character ROM in `sim/js/cgrom-a00.js` and
cost **no CGRAM**. A design can use all 32 cells of ROM characters for free,
so the right question is never "can I afford this" but "does the ROM already
have it".

**Codes 0x00-0x0F are not ROM.** All sixteen display CGRAM: bit 3 is ignored,
so 0x08-0x0F are aliases of slots 0-7 (datasheet Table 1). 0x10-0x1F and
0x80-0x9F are blank in this ROM, and so are 0x20 (space) and 0xA0.

The ROM was extracted from Table 2 of the module's datasheet
(`tools/extract-rom.mjs`) and re-checked against it: every code from 0x10 up
matches the table dot for dot. It is the A00 set, so the digits in `classic`
are exactly what a real 1602 shows.

ROM glyphs use rows 0-6 only. Row 7, the cursor line, is lit by `0xff` and a
handful of descender characters, never by text. A CGRAM glyph can use it.

## Worth reaching for

```
0xa5   0x2d   0x2e   0x3a   0x5f   0xb0   0xdb   0xdf   0xff
.....  .....  .....  .....  .....  .....  .....  ###..  #####
.....  .....  .....  .##..  .....  .....  #####  #.#..  #####
.....  .....  .....  .##..  .....  .....  #...#  ###..  #####
.##..  #####  .....  .....  .....  #####  #...#  .....  #####
.##..  .....  .....  .##..  .....  .....  #...#  .....  #####
.....  .....  .##..  .##..  .....  .....  #...#  .....  #####
.....  .....  .##..  .....  #####  .....  #####  .....  #####
.....  .....  .....  .....  .....  .....  .....  .....  #####
```

| Code | Use |
|---|---|
| `0xa5` | katakana middle dot, a 2x2 block on rows 3-4. The best small mark in the ROM: progress rows, bullets, a quiet colon. |
| `0x2d` | dash on row 3. Separators. |
| `0x2e` | period, low. A row of them reads as a dotted baseline. |
| `0x3a` | colon, two 2x2 beads. In both rows it reads as one tall colon, because the row gap is under half a dot. |
| `0x5f` | underscore, on row 6. One row above the bottom, so a row of them is a rule that floats slightly. |
| `0xb0` | katakana long-vowel mark, a full-width bar on row 3. A heavier dash that joins across cells (with the one-dot cell gap). |
| `0xdb` | hollow box. A frame or an empty-state marker. |
| `0xdf` | degree sign, a 3x3 ring in the top-left. |
| `0xff` | solid block, all 40 dots. The building block of a kit-of-parts face. Five in a row read as one slab, with seams. |

## Traps in the ASCII range

The A00 set is not ASCII everywhere:

| Code | ASCII | Shows |
|---|---|---|
| `0x5c` | `\` | `¥` |
| `0x7e` | `~` | `→` |
| `0x7f` | DEL | `←` |

There is no backslash or tilde. `0x7e`/`0x7f` make good arrows for free.

## The upper range

Codes 0xA1-0xDF are half-width katakana and Japanese punctuation, and
0xE0-0xFF are Greek and maths symbols: α ä β ε μ σ ρ √ ¢ ñ ö θ ∞ Ω ü Σ π ÷
and the solid block. They cost nothing. Dump a code before using it in a
label, because these shapes are small and some are 5x10 glyphs with rows that
a 5x8 display does not show.

## Dumping any range

Print a code rather than guessing:

```console
node --input-type=module -e "
import { CGROM_A00 as R, CGROM_ROWS as N } from './sim/js/cgrom-a00.js';
for (const c of [0xa5, 0xdb]) {
  console.log('0x' + c.toString(16).padStart(2, '0'));
  for (let r = 0; r < 8; r++) {
    const b = R[c * N + r];
    let l = ''; for (let i = 0; i < 5; i++) l += (b >> (4 - i)) & 1 ? '#' : '.';
    console.log('   ' + l);
  }
}"
```

Or sweep the ROM for a shape, for example every glyph of six or fewer dots
(start at 0x10; below that is CGRAM):

```console
node --input-type=module -e "
import { CGROM_A00 as R, CGROM_ROWS as N } from './sim/js/cgrom-a00.js';
for (let c = 0x10; c < 256; c++) {
  let n = 0;
  for (let r = 0; r < 8; r++) for (let i = 0; i < 5; i++) n += (R[c*N+r] >> i) & 1;
  if (n > 0 && n <= 6) console.log('0x' + c.toString(16).padStart(2, '0'), n);
}"
```
