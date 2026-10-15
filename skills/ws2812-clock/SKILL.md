---
name: ws2812-clock
description: Design and animate clock faces and light pieces for RGB LED boards - shaped WS2812 boards (hexagon 331, triangle 120, octagon 196, arc triangle 210, 32x8 strip, 20x20 square, 61-degree parallelogram 16x8), the 64x64 P2 HUB75 RGB matrix panel, and the ESP32-S3-Matrix 8x8 - used alone or assembled from many boards in any arrangement. Use when asked to design, redesign or animate a clock face, animation or pixel-art scene for WS2812 / NeoPixel / addressable-LED matrices, HUB75 RGB matrix panels or these shaped panels, to plan a multi-board assembly, or to check that a face fits the wire or the HUB75 refresh, the power supply and the heat budget all day. Provides true-geometry board models with chain order, an assembly builder, a renderer of bare/frosted/diffused LEDs, lattice-native and vector type, and an all-day checker.
---

# Designing for shaped WS2812 boards

Most of these are bare WS2812 boards with no controller. Each LED takes 24
bits (G, R, B) from the data line, passes the rest on, and shows them after
a latch gap. There is no font and no frame memory. You decide every LED's
colour, every frame, and the whole chain is re-sent each time.

Two boards are different hardware with the same job:
- **hub64**, a HUB75 RGB matrix: 64×64 on 2 mm (128 mm square), GOB-coated
  black 1515 LEDs, 1/32 scan. The controller scans it continuously from a
  frame buffer; you only update the buffer. See "HUB75 panels" below.
- **s3m64**, the Waveshare ESP32-S3-Matrix: an 8×8 WS2812 on a 25 mm board
  with its own ESP32-S3. It can also drive a HUB75 panel (`hub-s3m`).

The boards come in shapes, and the shapes are the point: a hexagon of 10
concentric rings, triangles, an octagon dial, strips and squares that tile,
and a 61° parallelogram. Faces can run on one board or on an assembly of
any number of them.

Everything here is built and works. Run it all from this directory
(Node 18+; `--gif` also needs ffmpeg). Your job is to design faces, not
tooling.

```
sim/js/panels.js     the boards as data: LED positions (mm), chain order, outline, package, current
sim/js/layout.js     assemblies: boards placed, turned, chained on lanes; presets in LAYOUTS
sim/js/ws2812.js     wire time per lane, HUB75 refresh + RAM, controllers, supply current, 8-bit quantising + dither
sim/js/render.js     true-geometry picture: packages, dies, halo; bare | smoke | opal diffuser (CPU, for files)
sim/js/glrender.js   the same light model on the GPU (WebGL2), for the live view
sim/js/kit.js        colour (linear), noise, easing, splat, strokes, COMB text, raster (grid, blitGrid, bitmap), night
sim/js/fonts.js      STROKE vector digits (any layout), COMB (triangular lattice), 3x5 (square)
sim/designs/         the faces: read hive.js and neon.js before writing your own
tools/render.mjs     PNG, contact sheet, GIF (pure Node)
tools/check.mjs      all-day proof: wire fps, RAM, supply current, heat, dim-end levels
tools/info.mjs       boards, layouts, seams, wire and power cost
tools/export.mjs     the layout as a C header (positions in data order) for firmware
tools/test.mjs       geometry regression tests
tools/serve.mjs      live view: http://localhost:8173/sim/?design=<key>&layout=<key>[&clock=10:59:58&pause=1]
tools/livecheck.mjs  the live view's real frame rate and load time, measured in headless Chrome
tools/gallery.mjs    stills of several designs tiled into out/<name>.png
```

Board facts and how each was derived are in `references/panels.md`.
Protocol, power and controller facts, with sources, are in
`references/hardware.md`.

## The loop

Design by looking. Render, open the image, fix, repeat.

```console
node tools/info.mjs                                   # every layout: LEDs, size, lanes, fps, full-white amps
node tools/render.mjs mydesign                        # out/mydesign.png, on the design's first layout
node tools/render.mjs mydesign --layout hex-trio      # on another assembly
node tools/render.mjs mydesign --clock 10:59:58 --frames 9 --duration 6 --sheet --scale 4
node tools/render.mjs mydesign --clock 10:59:58 --frames 175 --duration 7 --gif --scale 6
node tools/render.mjs mydesign --look opal --gap 10   # behind a diffuser
node tools/render.mjs mydesign --clocks 00:00:30,11:11:30,22:22:30 --out out/mydesign-digits.png   # one frame per wall clock
node tools/check.mjs --design mydesign [--layout ...] # before calling it done
```

- `--clock` sets the wall clock at t=0 and `--t` the animation time.
- Use a contact sheet across a minute turn, and another across an hour
  turn, to review a whole transition in one image.
- `--room lit` shows the boards under room light. The default is a dark
  room.
- The live view renders on the GPU and should hold 60 fps. If a design
  makes it stutter, its `frame()` is too slow: the status line shows
  design ms and fps, and `node tools/livecheck.mjs --design <key>`
  measures it. Change the light model only in `LIGHT` (render.js); both
  renderers read it.

## A design

```js
import * as kit from '../js/kit.js';
export default {
  name: 'Mine', blurb: 'one line',
  layouts: ['hex'],          // what it is drawn for; '*' = any layout (first entry is the default)
  look: 'bare',              // or 'smoke', or { look: 'opal', gap: 10 }
  fps: 60, brightness: 0.5,  // brightness scales everything you draw
  dither: false,             // temporal dithering of the 8-bit values
  warmup: 0,                 // seconds of history a stateful simulation needs (it is replayed)
  frame(ctx) { /* write linear RGB 0..1 into ctx.out (3 per LED) */ },
};
```

- Add the key to `sim/designs/index.js`.
- `ctx.leds[i]` gives x, y in mm (world), the board, and lattice
  coordinates: `col`/`hr` on triangular boards, `col`/`row` on square
  ones. On the hexagon you also get `ring`, `ringPos` and `ringLen`. When
  the whole layout shares one lattice you get `gx`/`gy`; on one square
  lattice also `kit.grid(ctx)`: the layout as a w × h pixel raster
  (`idx[y * w + x]` → LED or −1), with `gridX`/`gridY` on each LED.
- `ctx.layout.index.near(x, y, r)` and `.at(x, y)` find LEDs by position.
- `ctx.date` is the wall clock and `ctx.night` runs 0..1. Derive motion
  from time, not frame counts.
- Make stateful simulations deterministic with `warmup`: the player
  replays them from t − warmup.

## The board shapes are the design

- **Triangular lattice** (hexagon, triangle). Columns are vertical and each
  neighbouring column is offset half a pitch. Vertical lines and 30° lines
  are straight; **there is no straight horizontal line**, only a zigzag.
  Draw letterforms for that.
  - `COMB` is a 5×13 half-row font of pointed arches, every stroke a chain
    of nearest neighbours (`kit.combText`).
  - On the hexagon, ring k has 6k LEDs. Ring 2 has 12 (hours) and ring 10
    has 60 (minutes), so a dial is native to this board.
- **Square lattice** (strip, square, octagon). These are ordinary pixels.
  The octagon is a round-ish 16×16 dial; strips and squares tile on one
  3 mm lattice.
- **Rhombic** (parallelogram, 61°). Rows are straight and columns lean.
  Everything comes out italic whether you want it or not.
- **A real pixel canvas** (HUB75, 64×64 per panel; assembled: hub-x2
  128×64, hub-tall 64×128, hub-2x2 128×128, hub-x3 192×64, hub-x4 256×64,
  hub-tall3 64×192, hub-2x3 128×192, hub-3x3 192×192, and non-rectangular
  ones, hub-cross (a plus of 5), hub-stair (an L of 3), hub-ring (8 round
  an empty centre) and hub-steps (3 corner to corner on a diagonal), whose
  raster is the bounding box with -1 in the missing cells). Panels butt with no seam: the 2 mm pitch continues,
  so an assembly is one bigger raster. 4096 pixels is enough for pixel art,
  scenes, small characters with faces, real typography and 3D. Draw into a
  raster with `kit.grid` / `kit.blitGrid`; keep frame() fast (typed
  arrays, no per-pixel allocation): 16 k pixels at 60 fps.
- **A tiny tile** (ESP32-S3-Matrix, 8×8, 2.65 × 2.75 mm). Four digits don't
  fit; tiles in a row (`s3m-x4`) give one 8×8 cell per digit, each tile on
  its own MCU, butted with 6.45 mm between LEDs across the seam.
- **Bipolar arcs** (arc triangle). LEDs sit where two families of
  concentric circles cross, centred on the two base corners: `u` is the ring
  round the left corner, `v` the ring round the right one, and `w` the row
  up from the base (1–20). It is Gothic tracery geometry: arcs struck from
  two centres, as in a pointed arch.
- **Seams.** Most butt joints leave more than a pitch between LEDs:
  - hexagons 5.2 mm on a 3.46 mm column step
  - parallelograms 3.6 mm on 2.55 mm
  - six triangles leave a hole in the middle and sawtooth gaps

  Lattices that DO continue across seams (`info.mjs` says "one ... lattice"):
  triangles turned 0/180 interlock exactly (`tri-diamond`, `tri-pair`,
  `tri-big`, `tri-mountain`, `tri-ribbon`); strips and squares on 3 mm
  (`strip-x2`, `sq-x2`, `sq-strip`, `sq-2x2`); octagons side by side
  (`oct-trio`). `info.mjs --layout <key>` prints every seam. Either design with the gap (each board a cell, a
  window, a facet) or draw in millimetres with `kit.strokes` or fields,
  which cross seams without caring. `neon` runs on every layout this way.

## Colour, the dim end, and night

- `ctx.out` is **linear light**: the fraction of full PWM. Add and mix
  there. `kit.hex('#ff8800')` and `kit.hsv()` convert from the sRGB numbers
  people pick colours in. The LED has no gamma, so 50% duty looks about
  73% bright.
- **8 bits is coarse at the dark end, and these LEDs are bright.** A
  background at 3/255 is a deliberate, visible level, and its hue is three
  integers.
  - Below about 8/255 colours step and shift hue.
  - WS2812B-V5 parts stay dark at 1–2 (see hardware.md).
  - `dither: true` carries the rounding error frame to frame, which buys
    smooth dim fades at 60 fps.
  - `check.mjs` reports how much of a face lives below 8.
- **Night:** dim with `ctx.night`, never the clock directly (the live view
  and `--night` can force it).

## Power and heat are the hard limits

- Full white: one hexagon is about 12 A, one 20×20 about 6 A, against
  3 A from USB-C.
- A face must budget its light. Dark backgrounds, lit strokes and
  saturated colours (one channel costs a third of white) all help.
- `check.mjs` sweeps the whole day and fails a face whose peak exceeds the
  layout's `supply`. It also warns on heat per cm².
- For big assemblies, feed power at several boards.

## HUB75 panels

- The panel has no memory. The MCU (ESP32-HUB75-MatrixPanel-DMA) shifts
  out two rows at a time, 32 row pairs, with binary-coded modulation, over
  and over. Refresh drops with chain length: one panel 100 Hz, two 85 Hz,
  four 65 Hz, five 71 Hz (transition bit 5) at 8 MHz and 8 bits. To hold 60 Hz the library shows the
  low bit planes for equal times, so on long chains the dim end crushes:
  `check.mjs` reports the transition bit and below which level that bites.
- Brightness is the OE pulse, not the values: a HUB75 board keeps all 8
  bits at any `brightness` (the player quantises it at full scale).
- Power is panel level: 3 A per panel at full white (5 V 3 A in the spec),
  scaled by the mean duty. Heat is never the limit here; glare is. The
  panels are very bright indoors: `brightness` 0.25–0.5 is typical.
- RAM: 32 KB a panel at 8 bits (x2 double-buffered). Four panels need
  PSRAM. Firmware must define NO_CIE1931, since design values are linear.
- `look: 'smoke'` (smoked acrylic) is the classic finish for these
  panels; `bare` is the GOB face, black and matte.

## The ESP32-S3-Matrix

- Its own MCU drives its 8×8, colour order R, G, B. Several tiles each run
  their own copy of the face, kept in step over Wi-Fi.
- **Heat is the limit.** 64 LEDs and an ESP32-S3 share 6.25 cm²; Waveshare
  warns that high brightness damages the board. `check.mjs` counts the
  MCU's 0.4 W in the board's heat: budget about 1 W of LED light.

## The wire sets the frame rate

- A lane of n LEDs takes n × 30 µs + 300 µs: the hexagon gets 98 fps on
  one lane, a 20×20 gets 81.
- Large layouts put boards on separate lanes, which are sent in parallel
  (ESP32-S3: 16). See `lane` in the layout.
- `check.mjs` fails a design whose fps the wire can't carry on the chosen
  `--controller`.

## Looks

- `bare` shows the boards as they are.
  - Clear 2020 packages show three separate dies, so mixed colours fringe
    up close.
  - Frosted 3227 packages glow across the whole face.
  - GOB 1515 (HUB75): small, sharp dots, black between them.
- `smoke` is tinted acrylic: the board vanishes and only dots remain.
- `opal` is a milky diffuser sheet `gap` mm above the LEDs, modelled
  physically (references/hardware.md). The gap is real millimetres:
  - 0.5–1.5 mm: soft, separate dots.
  - About 2 mm on a 3–4 mm pitch: dots that just touch.
  - From about 0.7 × pitch: lit areas look even.
  - 4+ mm: a soft glow with little detail left.

  Choose the look as part of the design, and say why.

## What makes a face good here

From the owner's verdicts on ~90 OLED and 1602 faces:

- Creativity first. A competent but conventional face reads as boring.
- No default of four big digits with decoration round them.
- Letterforms drawn for the theme and the lattice.
- Constant motion, and smooth physical transitions that are the
  centrepiece.
- Characters and little stories are well liked.
- Use the shape. A hexagon that could have been a rectangle is a missed
  idea.
- **The time is never wrong mid-transition.** Empty or partly drawn
  digits are fine. A different, wrong number is not.

## Before calling it done

1. Render a still, a sheet across a minute turn and one across an hour
   turn, and look at them.
2. Run `node tools/check.mjs --design <key>` on every layout it claims, and
   fix any FAIL.
3. On real hardware, run the `chain` design first. A white head must run
   down each board in data order. If it jumps, the board's map in
   `panels.js` is wrong (the triangle's column 2 direction is
   unverified).
4. `node tools/export.mjs --layout <key>` writes the LED positions for
   firmware.
