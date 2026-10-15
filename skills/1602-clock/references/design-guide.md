# Designing clock faces for the 1602

This is the brief for anyone — human or agent — writing a design for the
simulator. Read the "Eight tiles" section before you plan a layout; it decides
what is and is not possible, and it is the thing most first attempts get wrong.

## The hardware you are designing for

A 16x2 HD44780 module. The whole display is **80 dots wide and 16 dots tall**:
sixteen character cells across, two down, each cell 5x8 dots. There is no
grayscale, no colour, no partial brightness. A dot is on or off.

The panel presets (`green`, `blue`, `gray`, `amber`) only change how those dots
are lit and photographed. They do not change the design.

## Eight tiles, and they are shared

The controller holds exactly **eight user-defined glyphs** (CGRAM slots 0-7),
each 5x8 dots. Character codes 0-7 display those glyphs; everything else comes
from the factory ROM.

The trap: **the display resolves a cell's code on every refresh**. Writing code
3 into a cell does not copy the glyph into the cell — it makes the cell *refer*
to slot 3 forever. So if you draw a glyph, then overwrite its slot with a
different glyph and draw again, the first cell changes too.

A frame can therefore never contain more than **eight distinct 5x8 tiles**, and
every tile a frame needs must be resident in CGRAM at the same time. Pages do
not help. This is the single hardest constraint here, and it is why the layouts
below are shaped the way they are.

Codes 0x08-0x0F display the same eight slots again (bit 3 is ignored), so
they are never ROM characters.

What that allows depends on how a face is built. With **one bitmap per digit**:

| Layout | Tiles needed | Fits? |
|---|---|---|
| Eight 5x8 glyphs across one row | 8 | yes |
| Four digits, each 5 wide x 16 tall (two rows) | 8 | yes |
| Two digits, each 10 wide x 16 tall (four tiles each) | 8 | yes, exactly 8 |
| Six digits + two colons, 5x8 | 7 | yes, one spare for a transition |
| Six digits, each 5 wide x 16 tall | 12 | **no** |
| Four digits, each 10 wide x 16 tall | up to 16 | **no** |
| Any 16-cell animated strip | 16 | **no**: use 8 cells, or reuse ROM |

With a **kit of parts** (bars and blocks on the cell grid, shared by every
digit, the solid block from ROM `0xff`), four full-height digits cost at most
seven tiles at every time of day. See `sim/js/blockface.js`. Count distinct tiles on screen,
not cells or digits, and prove it with `node tools/tile-budget.mjs --design <key>`.

The ROM is free. A design can use all 32 cells of stock characters at no CGRAM
cost, so the usual shape of an animated design is: **stock ROM for the parts
that hold still, CGRAM for the part that moves.**

## Writing a design

A design is a default-exported object in `sim/designs/`, registered in
`sim/designs/index.js`.

```js
import { TileAllocator, DIGITS_TALL, split16 } from '../js/kit.js';

export default {
  name: 'Example',
  blurb: 'One line describing what it looks like.', // shown in the gallery
  bus: 'i2c100',   // which interface the frame budget is judged against
  panel: 'blue',   // default panel preset
  fps: 10,         // how often the hardware is updated; the glass needs ~150 ms per change

  setup(lcd, api) {},            // optional, runs once

  frame(lcd, api, ctx) {
    // ctx: { t, date, fields, kit }
  },
};
```

`frame` is called once per rendered frame and **must fully define the frame**.
It cannot assume anything survived from the previous one — a still image is
built by calling `frame` exactly once, at whatever `t` was asked for. Anything
you want on screen, write on every frame.

`ctx.fields` is the wall clock: `h m s ms hh mm ss dow month day year dd`.
`ctx.t` is animation time in seconds.

### Drawing

```js
lcd.textAt(col, row, 'HELLO');   // stock ROM, free
lcd.setCursor(col, row); lcd.data(code);
lcd.defineChar(slot, rows);      // rows: 8 entries, each 5 chars of '#'/'.'
```

For anything with more than a couple of moving parts, use `TileAllocator`:

```js
const alloc = new TileAllocator(lcd, 0);
const codes = cells.map((cell) => alloc.add(cell.tileRows)); // dedupes, caps at 8
alloc.flush();                                               // writes CGRAM
cells.forEach((cell, i) => {
  lcd.setCursor(cell.col, cell.row);
  lcd.data(codes[i] ?? 0x20);
});
```

`alloc.overflow` is set if you asked for more than eight distinct tiles. Build
the tiles that must be right *first*, then optional ones, and fall back when a
slot runs out — see `flipclock.js`, which drops a transition rather than
corrupting the time.

### Kit

`sim/js/kit.js` provides `art()` for writing glyphs as pictures, `split16()`
for two-cell-tall glyphs, `DIGITS_TALL` (5x16), `DIGITS_COMPACT` (5x8),
`PUNCTUATION`, easings, deterministic noise, and `clockFields`.

### Useful stock ROM codes

| Code | Shape |
|---|---|
| `0xa5` | 2x2 dot on rows 3-4, the best small mark in the ROM (not `0x0e`: that is a CGRAM alias) |
| `0x2e` | `.` low dot |
| `0x2d` | `-` dash |
| `0x3a` | `:` colon |
| `0x5f` | `_` underscore on row 6 |
| `0xa5` | small 2x2 block |
| `0xff` | solid 5x8 block |

## Frame budget

`report()` in the emulator prices every operation at the longer of its wire
time and the controller's execution time (39 µs per instruction, 43 µs per
data write, 1.53 ms for clear), since the controller runs while the next byte
is on the wire. The emulator prints this for you:

```console
$ node tools/frame.mjs slab
frame: 35.20 ms on I2C 100 kHz (PCF8574) -> bus allows 28.4 fps, design runs at 4: fits
```

One LCD byte costs, in microseconds:

| Bus | per byte | 64-byte CGRAM page |
|---|---|---|
| 8-bit parallel | 43 (execution-bound) | 2.8 ms |
| I2C 100 kHz | 400 | 25.6 ms |
| I2C 400 kHz | 100 | 6.4 ms |

Declare `i2c100` unless you know the hardware runs faster: the PCF8574 on the
usual backpack is specified for 100 kHz. A full CGRAM redraw plus all 32 cells
is ~45 ms there, about 22 fps. That is enough, because the liquid crystal
takes 150-200 ms to switch (see `hardware.md`), so changes faster than about
10 fps do not show.

## Working

```console
node tools/tile-budget.mjs --cellW 2 --cellH 1                 # will this face fit?
node tools/frame.mjs <design> [--t 0.08] [--clock 10:09:30]   # ASCII, no browser
node tools/render.mjs <design> --scale 14 --crop view --style clean
node tools/render.mjs <design> --frames 8 --duration 1.6 --sheet  # a transition, one image
node tools/render.mjs <design> --frames 24 --duration 2 --gif  # animation
node tools/tile-budget.mjs --design <design>                    # fits at every minute?
node tools/serve.mjs                                            # live, in a browser
```

Iterate with `frame.mjs` first: it is instant and shows exactly what the
controller holds. Reach for the browser when you want to judge how it looks.

`--t` lets you stop the clock mid-animation, which is how you check a
transition. `flipclock --t 0.08` catches a digit halfway through its wipe.

## Checklist

- Does the frame need more than eight distinct tiles? Count them.
- Are all tiles written *before* the cells that use them? (`flush()` does this.)
- Does the design render correctly when `frame` is called only once?
- Is it legible at 1:1 on a real panel, not just zoomed in?
- Does it still read if a digit is mid-transition?
- What does it cost on the `bus` you declared?
- Is every visible step of the motion at least ~150 ms? Renders show the LC lag.