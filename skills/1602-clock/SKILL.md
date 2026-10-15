---
name: 1602-clock
description: Design and restyle clock faces for a 16x2 HD44780 character LCD (a "1602"), and animate them. Use when asked to design, redesign or animate a 1602 / HD44780 / character-LCD clock face, to draw custom CGRAM characters for one, to make such a display look unlike the usual templated LCD clock, or to check whether a face will actually run on the hardware. Provides an instruction-accurate emulator, a renderer that shows the glass's real switching lag, and tools that prove whether a design fits in CGRAM at every time of day.
---

# Designing clock faces for a 1602

You are designing what appears on a 16x2 HD44780 character LCD: sixteen
character cells across, two down, each cell 5x8 dots. A dot is on or off: no
greyscale, no colour, no partial brightness.

The facts below were checked against the module's datasheet (SunFounder
LCD-1602A, Digi-Key document CN0295D; summarised in `references/hardware.md`).
Where something comes from general HD44780 or PCF8574 knowledge rather than
that datasheet, it says so.

Everything needed is built and working, in the directory containing this file.
Your job is to design faces, not to build tooling.

```
sim/js/hd44780.js       controller emulator, with bus costing and a trap-#1 detector
sim/js/panel.js         draws it at the datasheet's dot geometry, with LC lag
sim/js/kit.js           glyph sets, the CGRAM tile allocator, Stage (sprites over ROM), easings, clock fields
sim/js/blockface.js     the reference photo's block face, as reusable parts
sim/designs/            55 worked examples: read some before writing your own
tools/frame.mjs         a design's frame as ASCII, instantly, no browser
tools/render.mjs        a design as a PNG, GIF or contact sheet you can look at
tools/tile-budget.mjs   proves a design fits, over every minute of the day
tools/serve.mjs         live view in a browser, on the real clock
tools/emulator-test.mjs regression tests for the emulator
```

Run everything from that directory. Needs Node 18 or newer. `render.mjs`
needs Chrome, Chromium or Edge (set `CHROME=/path` if it is not found), and
`--gif` and `--sheet` need ffmpeg or ImageMagick.
`frame.mjs` and `tile-budget.mjs` need nothing but Node, so if there is no
browser, design from the ASCII frames.

## The loop

Design by looking, not by reasoning. Settle every claim about how a face reads
by rendering it and looking at the image.

```console
node tools/frame.mjs mydesign --t 0.4                      # fast ASCII, no browser
node tools/render.mjs mydesign --scale 14 --crop view --style clean
node tools/render.mjs mydesign --clock 10:09:59 --frames 8 --duration 1.6 --sheet
node tools/tile-budget.mjs --design mydesign               # before calling it done
```

To watch a design run in real time, `node tools/serve.mjs` and open
`http://localhost:8173/sim/?design=<key>`. It runs on the real clock, sends a
frame at the design's `fps` as firmware would, and shows the glass's lag
between frames. "⏭ minute turn" jumps to five seconds before the next minute.

`--t` is animation time in seconds and `--clock HH:MM:SS` sets the wall clock
at `t=0`, so **any instant of an animation can be rendered on its own**.
`--sheet` tiles the frames into one image (`out/<design>-sheet.png`), which is
how to review a transition: put the clock a second before a minute turns and
look at the whole turn at once. `--gif` makes an animation instead.

Panels are `green`, `blue`, `gray`, `amber`. `--style clean --crop view` is
just the glass, which is what to judge a design on; `--style photo --crop body`
is the hero shot.

## The glass is slow

The liquid crystal takes **150 ms typical, 200 ms max** to switch (10-90%,
datasheet "Optical Characteristics"). The controller changes a dot instantly;
the glass over it follows a few frames later. This decides how to animate:

- A state that lasts under ~150 ms never fully appears. A dot lit for one
  frame at 12 fps reaches about 70% contrast; at 30 fps, about 40%.
- A wipe or shutter shorter than ~0.4 s reads as a smear, not a motion. Give
  each visible step of a transition 150 ms or more.
- Fast, fine patterns (one-dot ripples, checkerboard flicker) blur to grey.
  That can be used on purpose, as a half-tone.
- More than about 10-12 fps buys nothing visible.

The renderer models this by default (`--response typ`). Use `--response max`
for the worst case and `--response off` only to see the logical frame. A still
at `--t` shows the frame sent at or before `t` as it looks just before the
next frame replaces it. `frame.mjs` prints the logical frame, with no lag.
Colder glass is slower still; the datasheet gives no figure for that.

## The dot field is not a continuous 80x16 canvas

Dots sit on a 0.60 x 0.70 mm pitch (taller than wide, 1.17:1). Between cells
the glass skips 0.60 mm horizontally, which is one whole missing dot column,
but only 0.40 mm vertically, under half a dot. So:

- A shape spanning both rows reads as one piece. A shape spanning two cells
  side by side always shows a vertical seam.
- A "circle" drawn as 5x5 dots looks taller than wide.
- Stock ROM glyphs never light the bottom (8th) dot row, which is the cursor
  line. Only `0xff` and CGRAM glyphs reach it.

## The constraint that decides every layout

The controller holds exactly **eight** user-defined glyphs, in CGRAM slots 0-7,
each 5x8 dots. Everything else comes from the factory ROM.

- Codes `0x00-0x07` display the slots. **So do `0x08-0x0F`**: bit 3 of the
  code is ignored (datasheet Table 1, `0000 *000`). Nothing in that range is a
  ROM character. Writing `0x0e` shows slot 6.
- **A cell stores a slot number, not a picture, and the display re-reads CGRAM
  on every refresh.** Overwrite slot 3 and every cell showing code 3 changes
  with it. A frame can never contain more than **eight distinct 5x8 tiles,
  all resident at once**. Redefining CGRAM in "pages" does not work.

The size of a digit does not decide whether a face fits. What decides it is
how many *distinct tiles* the face needs on screen at once. There are two ways
to build a face:

**One bitmap per digit.** Each digit is its own picture, cut into tiles.

| Layout | Tiles | Fits? |
|---|---|---|
| Four digits at 5x16 or 10x8 | 8 | yes, exactly |
| Two digits at 10x16 | 8 | yes, exactly (`focus`) |
| Four digits at 10x16 | up to 16 | no, most times of day |

**A kit of parts.** Every digit is assembled from the same few tiles that line
up with cell boundaries: a solid block, bars, a narrow stroke. The solid block
is ROM `0xff` and the blank is a space, both free. The cost depends on which
*parts* the time needs, not on how big the digits are:

| Layout | Tiles | Fits? |
|---|---|---|
| The reference photo's face: 4 digits at 13x16 (`sim/js/blockface.js`) | 1-7 | yes, at every time (`slab`, `stack`) |
| A simpler face, full-width strokes only | 3 | yes (`hourglass`) |
| ...with the parts redrawn per frame as an effect | 6-8 | yes (`tide`) |

This is how the large-digit clocks in photos work. The look is blockier than a
drawn typeface, and the seams between cells are part of it. `blockface.js`
holds the photo's face, read off the photo dot by dot. Reuse it rather than
redrawing it.

Prove a face fits before calling it done:

```console
node tools/tile-budget.mjs --design mydesign
```

That runs the design across all 1440 minutes, at eleven instants per minute
including the first second where transitions live. It reports the worst slot
count and the worst frame cost, and it fails if any frame rewrites a slot after
a cell showing it was drawn (trap #1). `--cellW 2 --cellH 2 [--show 02:45]`
still answers the narrower question for a one-bitmap-per-digit seven-segment
face.

Stock ROM is free. A design can fill all 32 cells with factory characters at
no CGRAM cost, so an animated design usually takes the shape of **ROM for the
parts that hold still, CGRAM for the part that moves**.

## Writing a design

Add a file under `sim/designs/` and register it in `sim/designs/index.js`.

```js
import { TileAllocator, art } from '../js/kit.js';

export default {
  name: 'MyFace',
  blurb: 'One line, shown in the gallery.',
  bus: 'i2c100',      // interface the frame budget is judged against
  panel: 'amber',     // green | blue | gray | amber
  fps: 10,            // how often the hardware is updated; also drives the LC lag model

  frame(lcd, api, ctx) {
    // ctx: { t, date, fields, kit }
    lcd.textAt(0, 0, ctx.fields.hh);          // stock ROM, free
    lcd.setCursor(4, 0); lcd.data(0xa5);      // a ROM dot
  },
};
```

`ctx.fields` is the wall clock: `h m s ms hh mm ss dow month day year dd`.
`ctx.t` is animation time in seconds.

`frame` is called **once per rendered frame and must fully define the frame**.
A still image is made by calling it at whatever `t` was asked for, so it cannot
rely on anything surviving from a previous frame. Derive transitions from the
clock (`sinceChange` in `ember.js` shows how) rather than from state.

For anything with more than a couple of moving parts, use `TileAllocator`. It
deduplicates identical tiles, caps at eight, and sets `.overflow` when a frame
asked for more than the hardware has.

```js
const alloc = new TileAllocator(lcd, 0);
const codes = cells.map((cell) => alloc.add(cell.tileRows));
alloc.flush();                                  // writes CGRAM, once, before drawing
```

Build the tiles that must be right *first*, then optional ones, and fall back
when a slot runs out.

For sprites that move dot by dot over the face, use `Stage`: put ROM codes or
tiles in cells, ink dots at glass coordinates (six columns per cell, the
sixth being the gap), and `draw()` makes private tiles only for inked cells.
`pong` and `chomp` use it.

## Kit

`sim/js/kit.js` has `art()` for writing glyphs as pictures, `split16()` for
two-row glyphs, `DIGITS_TALL` (5x16) and `DIGITS_COMPACT` (5x8) as starting
points, `PUNCTUATION`, easings, deterministic noise, `clockFields`, and
`TileAllocator`. Most shipped designs define their own faces inline; copy one.
`sim/js/blockface.js` is the reference photo's block face, shared by `slab`
and `stack`.

Useful stock ROM characters (A00 set), so you do not spend a CGRAM slot on them:

| Code | Shape |
|---|---|
| `0xa5` | 2x2 dot on rows 3-4: the best small mark in the ROM |
| `0x2d` / `0x2e` | dash (row 3), period (rows 5-6) |
| `0x3a` | colon, two 2x2 beads |
| `0x5f` | underscore on row 6, not the bottom row |
| `0xb0` | long dash, full width |
| `0xdb` | hollow box |
| `0xdf` | degree sign, small ring top-left |
| `0xff` | solid 5x8 block, all eight rows |

`0x5c` is `¥` and `0x7e`/`0x7f` are arrows in this ROM, so there is no
backslash or tilde. `references/rom-atlas.md` has more.

## Portrait, and faces with no ROM at all

**Portrait.** Set `rotate: 90` and the module is shown turned a quarter turn
clockwise: 16 dots across, 80 down. `render.mjs`, the live view and
`frame.mjs` all show it upright. In that frame a cell is 8 dots wide and 5
tall, two across and sixteen down; the gap between the two columns is under
half a dot, the gap between rows a whole dot. `kit.js` has `PortraitStage`
(`pdot`, `pput`, `ptext`), `portraitTile` (draw a tile as it is seen),
`portraitMM` (dot centres in mm, for round shapes) and `portraitToModule`.
ROM text runs down the glass on its side, like a book spine. A 3x5 digit fits
a portrait cell twice, so a two-digit number is one tile.

**ROM-free.** Set `romFree: true` and `tile-budget` fails any frame that
shows a factory character, the space included. A blank cell then costs a
slot. The hardware cursor is not ROM.

**More than eight glyphs by alternating pages** works only as a dim layer:
a glyph shown in one page of two settles near half contrast and flickers at
the page rate. See `references/hardware.md`, "Time-division multiplexing",
before using it, and `calibrate` to check greys on a real module: the
simulator's grey is a linear average, and real glass is not.

## Frame budget

The emulator prices every write and prints the verdict. An operation costs the
longer of its wire time and the controller's execution time (39 µs per
instruction, 43 µs per data write, 1.53 ms for clear and home; datasheet
"Table of Commands"), because the controller runs while the next byte is
already on the wire.

| Bus | per LCD byte | a 64-byte CGRAM page |
|---|---|---|
| 8-bit parallel | 43 µs (execution-bound) | 2.8 ms |
| I2C 100 kHz | 400 µs | 25.6 ms |
| I2C 400 kHz | 100 µs | 6.4 ms |

```console
$ node tools/frame.mjs slab
frame: 35.20 ms on I2C 100 kHz (PCF8574) -> bus allows 28.4 fps, design runs at 4: fits
```

**Default to `i2c100`.** The PCF8574 on the usual backpack is specified for
100 kHz (from its own datasheet, not the LCD's). Many run at 400 kHz out of
spec. The figures assume a driver that streams each byte's four expander
writes in one transaction. The common Arduino `LiquidCrystal_I2C` library is
about three times slower than that. Because of the LC lag, a design that
redraws all of CGRAM at 10 fps on 100 kHz I2C is already near the limit of
what the glass can show.

## What to aim for

Most 1602 clocks look identical because they use the factory font, one layout,
and no motion. The levers, in order of impact:

1. **Draw the face.** The ROM digits are one dot thin, which is the main reason
   these clocks all look the same. At 10x8 or 10x16 a drawn face has real
   weight. With a kit of parts, digits can fill the glass.
2. **Give it hierarchy.** A huge time with a small seconds readout does more
   than any amount of decoration.
3. **Move something, slowly.** A transition on the digit that turns, a
   breathing colon, an ambient strip, something that happens on the minute.
   Design the motion for a 150 ms glass.

The shipped designs are examples of the constraints being met, not a style
to stay inside. A new design should have its own idea, not reskin one of
these. `references/worked-examples.md` ends with a list of territory nothing
has explored yet. The constraints are hard; everything else is open.

## Checklist

- Did you render it and actually look at the image, with the LC lag on?
- Does `tools/tile-budget.mjs --design <key>` pass? (`--design all` after
  touching anything in `sim/js/`.)
- Does it render correctly when `frame` is called once, at an arbitrary `t`?
- Is it legible at 1:1, not just zoomed in?
- Does it still read mid-transition? Render a `--sheet` across the minute turn.
- Is every visible step of the motion at least ~150 ms long?
- Did you avoid codes `0x08-0x0F` as if they were ROM characters?
- Copying a photo? Crop and enlarge it (`ffmpeg -i photo.png -vf
  "crop=W:H:X:Y,scale=iw*4:ih*4:flags=neighbor" zoom.png`), count the dots in
  every cell, then stack your render under the photo and compare. Guessing
  from the overall impression got `slab` wrong the first time.
- What does it cost on the `bus` you declared?

See `references/` for the hardware facts, the traps that cost real time, and a
walkthrough of how each shipped design solves its problem.
