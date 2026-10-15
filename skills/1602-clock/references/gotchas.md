# Traps, and what they look like when you hit them

Each of these cost real time to find. They are ordered by how likely they are to
bite.

## 1. CGRAM is shared, and resolves at refresh time

A character cell holds a **slot number**, not a picture. The display reads that
slot on every refresh. So:

```js
lcd.defineChar(0, topHalfOfDigit);
lcd.setCursor(0, 0); lcd.data(0);   // row 0 now shows topHalfOfDigit

lcd.defineChar(0, bottomHalfOfDigit);
lcd.setCursor(0, 1); lcd.data(0);   // row 1 shows bottomHalfOfDigit
// ...but row 0 NOW SHOWS bottomHalfOfDigit TOO.
```

**Symptom:** both character rows are identical, or a glyph you drew earlier has
silently changed. `node tools/frame.mjs <design>` shows it immediately, and the
emulator now detects it: `tools/tile-budget.mjs --design <key>` fails on any
frame that rewrites a slot after a cell showing it was drawn, and the browser
view prints a red warning.

**Fix:** every tile a frame needs must be resident at the same time. A glyph
whose top half goes in slot 0 and bottom half in slot 1 needs *both* slots held
for the whole frame. A frame can never exceed **eight distinct tiles**.

There is no paging workaround. Redefining slots midway and redrawing changes the
cells you drew first — the controller has no notion of "already painted".

## 2. Multi-cell glyphs eat slots -- if each digit is its own picture

A digit two cells wide and two rows tall occupies **four cells**. Drawn as one
bitmap per digit, that is four tiles, and four such digits are up to sixteen:

| Digit box | Tiles per digit, one bitmap each | Four digits |
|---|---|---|
| 5x8 (one cell) | 1 | 4 |
| 5x16 (one cell, both rows) | 2 | 8 |
| 10x8 (two cells, one row) | 2 | 8 |
| 10x16 (two cells, both rows) | 4 | **up to 16** |

Measured with a scaled seven-segment face across all 1440 times of day:

```
$ node tools/tile-budget.mjs --cellW 2 --cellH 2
tiles needed, worst time      : 16  (at 02:45)
times exceeding the 8 limit   : 1251 of 1440
```

**That verdict is about that face, not about the digit size.** An earlier
version of this skill concluded that four 10x16 digits cannot be done. They
can. Build the digits from a small kit of parts that line up with the cell
grid (solid block, bars, a narrow stroke) and every digit reuses the same
tiles. The solid block is ROM `0xff` and the blank a space, so the reference
photo's face (`sim/js/blockface.js`) needs at most seven parts at any time of
day, and usually four or five:

```
face parts needed, over all 1440 minutes: 1:1  2:10  3:70  4:395  5:682  6:269  7:13
```

What a kit of parts gives up is curves: corners are square, and the seams
between cells show. That is also exactly what the big-digit clocks in
photographs look like.

A first attempt at reproducing that photo (an earlier `slab`) guessed the
parts instead of reading them, and got the right stroke, the middle bar and
the colon wrong. Crop and enlarge the photo and count the dots before drawing
a single tile.

Always check the *worst* time with `--design`, never only the one you happen
to be looking at.

## 3. A frame must be derivable from the clock alone

`frame(lcd, api, ctx)` is called **once** for a still render, at whatever `t` was
asked for. It cannot assume a previous frame ran, and it cannot keep a running
counter or an animation started by an event.

Deriving transitions from the wall clock instead works, and makes any instant
renderable — which is what lets a single PNG show an animation mid-flight:

```js
function sinceChange(index, fields) {   // index counts from the right
  const sub = fields.ms / 1000;
  return index === 0 ? fields.s + sub : (fields.m % 10) * 60 + fields.s + sub;
}
```

**Indexed from the right.** Seconds-of-minutes is index 0. Getting this backwards
makes every digit animate on the wrong beat — and it looks *plausible*, because
digits do still animate, just at the wrong rate. `flipclock.js` shipped with this
bug until `--t 0.08` caught it.

## 4. Transitions on a full tile budget

Adding a transition tile on top of a face that already uses eight slots needs
more slots. It can still be done when the turning glyph's tiles are **private to
it** — no other visible cell holds that code — because then its own slots can be
rewritten in place for the transition, costing nothing.

```js
const usage = new Map();                       // count each tile across the frame
for (const q of faces) for (const t of q) {
  const k = t.join('/'); usage.set(k, (usage.get(k) ?? 0) + 1);
}
const exclusive = faces[k].every((t) => usage.get(t.join('/')) === 1);
```

When the glyph is not exclusive (two identical digits on screen), skip the
transition for it. Never redraw a shared slot — it smears across every cell
using that code.

## 5. The bus, not the CPU, is the limit

Redrawing one CGRAM page is 64 bytes. At 100 kHz I2C through a PCF8574 backpack
that is **25.6 ms**, 39 fps before any DDRAM is written. At 400 kHz (out of
the PCF8574's spec) it is 6.4 ms. On a parallel bus the controller's own 43 µs
per write is the limit: 2.8 ms.

`report()` is computed for you; `node tools/frame.mjs <design>` prints it. If a
design genuinely needs the bandwidth, set `bus` in the design and say so.

## 6. Judging a render

Downscaling a render to fit a preview creates **moiré over the dot lattice** that
is not in the image — a faint checkerboard that looks like a rendering bug. If a
pattern looks wrong, check the actual pixels before changing code:

```console
ffmpeg -loglevel error -i out/face.png -vf "crop=40:30:800:220" -f rawvideo -pix_fmt gray - | xxd | head -3
```

Two near-identical values means the "pattern" is an artefact of the preview.
Render at `--scale 12`–`16` and look at the image at full size.

## 7. `--crop view` vs `--crop body`

`body` includes PCB, bezel and pin header (a hero shot). `view` is just the glass
(what to judge a design on). `--style clean` drops the bloom and polariser sheen,
so you are looking at the dots rather than the photography. Use
`--crop view --style clean` while designing, `--crop body --style photo` to show
someone.

## 8. Codes 0x08-0x0F are not ROM characters

The controller ignores bit 3 of codes below 0x10, so `0x08`-`0x0F` display
CGRAM slots 0-7 again (datasheet Table 1, `0000 *000`). The datasheet's ROM
table shows "CG RAM (1)".."(8)" twice in its first column for this reason.

An earlier version of this skill read those printed labels as dots and
recommended `0x0e` as "a single centred dot". On a real module `0x0e` shows
whatever is in slot 6. The `monolith` seconds bar shipped with ten copies of a
digit's bottom half because of it. The emulator now aliases these codes
correctly, so the mistake shows up in renders. For a small dot use `0xa5`.

## 9. The glass takes 150 ms to switch

Rise and fall are 150 ms typical, 200 ms max (datasheet Optical
Characteristics). The emulator writes are instant; the picture is not. A
0.24 s wipe at 30 fps, which looked crisp in a simulator that ignored this,
on the real glass is a brief smudge with the new digit fading in under it.

Renders now include the lag by default. When a transition looks muddy in a
`--sheet`, it will look muddy on the bench. Slow it down until each step
holds for at least ~150 ms, or design it to be a fade on purpose.

## 10. The default bus was optimistic

Every shipped design used to declare `i2c400` and label it PCF8574. The
PCF8574 is specified for 100 kHz. Designs now declare `i2c100`, and frames
cost about four times what they used to say. That is still fast enough: a full
CGRAM redraw plus all 32 cells is ~45 ms on 100 kHz I2C, and the glass cannot
show changes much faster than that anyway.

## 11. The 80x16 dot field has seams

There is a 0.60 mm gap between cells horizontally (a whole missing dot
column) and 0.40 mm between the two rows (under half a dot). Dots are 0.60 x
0.70 mm pitch, taller than wide. Shapes that cross the row boundary stay
continuous. Shapes that cross a column boundary always break. The renderer
uses these dimensions, so judge continuity from a render, not from the ASCII
frame, which has no gaps.

## 12. The previous digit is not "this digit minus one"

Three shipped transitions computed the digit they were turning *from* as
`(d + 9) % 10`. That is right for the ones of seconds and wrong almost
everywhere else: tens of seconds go 5 -> 0, not 9 -> 0; tens of hours go
2 -> 0 at midnight. Every minute, those designs animated from a digit that had
never been on screen.

Read it off the clock instead: build `clockFields` for the moment before the
change (`date - 60000` for minute digits, `date - ms - 1` for anything that
changes on the second) and take the digit at the same position.

## 13. Alternating CGRAM pages does not double the budget

Two pages of eight glyphs shown alternately look like sixteen glyphs at half
contrast, with flicker at the phase rate: about 28% peak-to-peak at 12.5 Hz on
100 kHz I2C, which is all that bus can manage with a full redraw per phase.
Keep what must be read in every phase, and treat the extra slots as a dim
layer. The simulator's grey is a linear average; on glass it depends on the
contrast pot (see `hardware.md`, "Time-division multiplexing").
