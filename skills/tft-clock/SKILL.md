---
name: tft-clock
description: Design and animate clock faces, animations and pixel-art scenes for small colour TFT/LCD modules, starting with the Luat Air101-LCD (0.96" IPS, 160x80, ST7735S, SPI). Use when asked to design, redesign or animate a clock face or scene for an ST7735 / 160x80 colour LCD, to make one look unlike the usual library-font clock, or to check that a face will run on the hardware (SPI time, refresh and tearing, per-frame workload on a small MCU). Provides an ST7735S emulator that runs real command bytes, an RGB565 canvas with hard and anti-aliased drawing and dithered gradients, a renderer of the glass at true geometry (sub-pixel stripes, backlight, black level, liquid-crystal lag, tearing), and an all-day checker. Faces are JS, written against an API that maps onto C one call to one function, and assume no particular MCU.
---

# Designing clock faces for a 160 x 80 colour LCD

You are designing what appears on a 0.96" IPS LCD: 160 pixels across, 80
down, each pixel any of 65,536 colours (RGB565). The controller has no font
and no shapes. Everything on the glass is pixels the firmware drew into a
frame buffer and sent over SPI.

Facts come from the controller and panel datasheets; each is listed with
its source and a confidence mark in `references/hardware.md`. Where
something is a model or an assumption, it says so.

Everything needed is built and working, in the directory containing this
file. Your job is to design faces, not tooling.

```
sim/js/st7735.js    controller emulator: commands, 132x162 memory, MADCTL, window wrap, refresh rate, bus time
sim/js/driver.js    the boot sequence and the frame transfer (full or dirty window)
sim/js/modules.js   the module as data: pitch, glass, board, init, optics, LC response
sim/js/player.js    "design at time t" -> controller -> what the glass transmits; LC lag; tearing
sim/js/panel.js     draws the glass at true geometry: stripes, black level, backlight, board
sim/js/gfx.js       the RGB565 canvas a design draws on (every call documented there)
sim/js/color.js     colour: 0xRRGGBB, RGB565 rounding, ordered dither, mix, hsv, palettes
sim/js/fonts.js     type: 3x5, 5x7, scalable vector digits, seven-segment, LED-dot text
sim/js/cost.js      per-frame workload, and a rough C estimate for host profiles
sim/js/kit.js       everything above re-exported, plus table sin/cos, integer noise, clock fields, night
sim/designs/        worked examples: read harbour.js and koi.js before writing your own
tools/frame.mjs     one frame as numbers (and as a character map), instantly
tools/render.mjs    a design as PNG, GIF or contact sheet you can look at
tools/check.mjs     proves a design runs all day
tools/gallery.mjs   stills of several designs in one image
tools/serve.mjs     live view in a browser, on the real clock
tools/test.mjs      regression tests for the emulator and canvas
```

Run everything from that directory. Node 18+ only; `--gif` also needs
ffmpeg. No browser is needed except for the live view.

## The loop

Design by looking, not by reasoning. Settle every question about how a face
reads by rendering it and looking at the image.

```console
node tools/frame.mjs mydesign                                 # cost, colours, workload, instantly
node tools/frame.mjs mydesign --crop 40,10,30,20              # exact pixel map of a box, with a colour legend
node tools/render.mjs mydesign                                # out/mydesign.png
node tools/render.mjs mydesign --clock 10:09:55 --frames 12 --duration 12 --sheet --px 3 --cols 3
node tools/render.mjs mydesign --clocks 06:20:00,12:00:00,18:05:00,03:10:00 --px 3   # one frame per time of day
node tools/render.mjs mydesign --frames 150 --duration 3 --gif --px 4
node tools/render.mjs mydesign --scale 4                      # about true size on a monitor
node tools/check.mjs --design mydesign                        # before calling it done
```

- `--t` is animation time in seconds; `--clock HH:MM:SS` (fractions allowed) sets the wall clock at t = 0.
- `--sheet` tiles the frames into `out/<design>-sheet.png`. Put the clock a few seconds before a minute turns and review the whole transition in one image.
- `--px` is screen pixels per glass pixel (default 6). `--crop body` shows the whole board, the hero shot.
- `--style clean` draws flat pixels in exactly the colours sent: use it to judge pixel art. The default `photo` adds the sub-pixel stripes, the black level and the backlight.
- `--room lit` adds room light reflected off the glass. `--night on|off` forces night.
- `--tear` shows one panel refresh while a frame is still on the wire. `--no-smear` turns off the liquid crystal's lag.

Live: `node tools/serve.mjs`, then open `http://localhost:8174/sim/?design=<key>`.
It runs on the real clock, with buttons for the next minute and hour turn,
a speed control, and a true-size option. It listens on localhost only.

## The canvas is small, and that is the first constraint

The glass is 21.7 x 10.8 mm: the same size as a 0.96" OLED, at 0.136 mm a
pixel. A 5x7 letter is under a millimetre wide.

- **Look at it at true size** (`--scale 4`) before trusting a zoomed render. Detail finer than ~2 pixels vanishes at arm's length.
- Digits meant to be read across a room want strokes of 3 pixels or more and a height of 20 or more. The shipped faces use 20-52 px digits.
- **2:1 is a strip.** Panoramas, horizons, side views, a parade, a ticker. A composition that wants a square will feel cramped.

## Colour, and RGB565

Designs name colours as `0xRRGGBB` (`kit.hex('#e2a51f')` and `kit.mix`,
`kit.scale`, `kit.hsv` help). The buffer stores RGB565, so every colour
rounds: steps of 8 in red and blue, 4 in green.

- **Gradients band** in RGB565. `g.gradient`, `g.radial` and `g.coarse` dither by default (an ordered 4x4 pattern), which at this pitch reads as smooth. Pass `{ dither: true }` to any fill that needs it.
- **Dark colours step and shift hue**, because the low end has the fewest levels. `frame.mjs` and `check.mjs` report how much of the glass is near black.
- **Choose a palette on purpose.** 65k colours make the generic smartwatch face easy: gradient background, thin sans digits, a weather icon. Pick a small set (3-8 colours, a named palette in `kit.PALETTES`, or a palette per time of day) and say why in the design's header comment.

## Hard pixels or anti-aliased: choose per element

Every filling call takes `{ aa: true }`. Without it a pixel is in or out by
its centre: exactly the palette colours, crisp stair steps. With it, edge
pixels blend: curves and slants look smooth, and things move by fractions
of a pixel.

- Hard suits sprites, pixel art, small type, anything that holds still.
- AA suits big curved digits, thin slanted lines, and anything that glides.
- AA adds in-between colours (against a strict palette) and costs per edge pixel.

`harbour` is all hard pixels; `koi` is all AA. Mixing is fine, with a reason.

## It is an LCD: the backlight sets the rules

The light comes from one white LED behind the glass; the liquid crystal only
blocks it.

- **Black is not black.** At 800:1 an unlit pixel is a dark grey that glows a little at the corners in a dark room. A mostly black face does not save power or look like an OLED. Full-colour backgrounds are native here.
- **No burn-in.** Static elements are fine.
- **Brightness is one global PWM** on the backlight: `ctx.lcd.backlight(0..1)`. It dims the whole glass. Night dimming goes through it.
- **The crystal is slow.** Each pixel takes ~15 ms to change (Tr + Tf = 30 ms). A pixel or two per frame looks smooth; fast high-contrast motion smears. Renders show the lag; `--no-smear` shows the frames as sent.
- **Tearing is real.** The panel refreshes at ~60 Hz on its own oscillator, as a vertical column sweeping left to right, and this module has no sync pin. A full frame takes 5.1 ms on the wire at 40 MHz, about a third of a refresh. When a refresh crosses the write front, fast horizontal motion of tall shapes shows a sloped step. `--tear` draws it; slower motion, smaller changes or `driver: 'dirty'` hide it.

**Night dimming** uses `ctx.night`, never the clock directly: 0 by day, 1
from 23:00 to 07:00, faded over the first and last minute. Typically
`ctx.lcd.backlight(1 - 0.7 * ctx.night)`, and some care that the face
still reads at the lower level. `check.mjs` warns if a face never dims.

**Requests are per frame.** Anything `frame()` does not ask of `ctx.lcd`
this frame (backlight, `invert()`, `idle()`, `display()`, `gamma()`) reverts
to its boot value.

## The workload decides where it runs

The bus is not the limit at this size: a full frame takes 5 ms of a 33 ms
budget at 30 fps. The CPU might be. The design side does not assume an MCU;
it reports the frame's workload instead:

- pixels written and blended
- anti-aliased edge pixels
- gradient pixels
- calls of your own per-pixel code (`fillWhere`, `paint`, `fillSDF`, `coarse`)
- Math calls your code made

From that, `frame.mjs` and `check.mjs` print a rough C estimate for three
host profiles (`esp32c3` with no FPU, `esp32s3`, `rp2350`). Treat it as good
to a factor of two. What makes a face cheap anywhere:

- Use the kit's shapes and gradients. They are priced as efficient C.
- **Per-pixel code is the expensive thing.** `g.paint(fn)` over the whole glass calls `fn` 12,800 times a frame. `g.coarse(fn, { cell: 4 })` calls it on a 4-pixel grid and blends: about 1/16 the cost, and enough for water, sky, fog or plasma.
- Use `kit.sin` / `kit.cos` (table lookups) rather than `Math.sin` in anything that runs per pixel.
- Use `kit.rand` / `kit.noise` / `kit.noise2` (integer hashes), never `Math.random()`.
- **The estimate prices each call of your per-pixel code as a few float operations.** A callback with a loop inside (say, the distance to 80 segments) costs that many times more, and the estimate cannot see it. Precompute instead: render a shape once onto a small canvas and look it up (`mischief` tumbles its numerals as cached sprites; `chameleon` samples its digit masks once).

## Writing a design

Add a file under `sim/designs/` and register it in `sim/designs/index.js`.

```js
import { strokeDigit, font3x5, hex, mix } from '../js/kit.js';

export default {
  name: 'MyFace',
  blurb: 'One line, shown in the gallery and live view.',
  fps: 30,               // frames sent per second
  // driver: 'dirty',    // send only the changed box (default 'full')
  // bus: 'spi40',       // spi15 (datasheet) | spi20 | spi27 | spi40 (default)

  frame(g, ctx) {
    // ctx: { t, date, fields, night, W, H, module, lcd, kit, fps }
    const f = ctx.fields;   // h m s ms sec hh mm ss h12 pm dow wday month mon day dd year minuteKey
    ctx.lcd.backlight(1 - 0.7 * ctx.night);
    g.gradient(0, 0, 160, 80, [hex('#10243a'), hex('#3a6a8a')]);
    strokeDigit(g, f.hh[0], 10, 14, 26, 52, { weight: 5, c: 0xf2ead8, aa: true });
    g.text(f.dow, 2, 2, { font: font3x5, c: mix(0xffffff, 0x3a6a8a, 0.4) });
  },
};
```

`frame` is called **once per frame and must fully define the frame**. The
canvas starts black every time, and a still is made by calling it once at
whatever time was asked for. So derive every animation from the clock
(`fields.sec`, `fields.minuteKey`, `date`): "where is the crane at
10:09:52.3" must have an answer without simulating from boot. If a motion
is easiest as a simulation, simulate from the start of the current minute
inside `frame`. `check.mjs` fails a frame that differs when rebuilt from cold.

Both shipped faces show the pattern for a minute turn. Work out this
minute's jobs from the previous, current and next minute's digits
(`kit.previousMinute`, `kit.clockFields(new Date(t + 60000))`), then look
up where each job is at `fields.sec`.

### The canvas, `g`

`gfx.js` documents every call. In short:

- **Pixels and boxes:** `pixel`, `get`, `clear`, `fillRect`, `rect`, `hline`, `vline`, `line` (1-pixel Bresenham), `clip` / `unclip`, `shift`.
- **Shapes:** `thickLine`, `stroke` (polyline), `fillCircle`, `fillEllipse`, `ring`, `arc` (clock angles: 0 = 12 o'clock, clockwise, radians), `fillRoundRect` / `roundRect`, `fillPolygon`, `circle` (crisp 1-pixel ring).
- **Shading:** `gradient` (linear, any angle, any stops), `radial`, `coarse` (a cheap per-pixel look), `paint` (a full per-pixel shader).
- **General fills:** `fillSDF` (a signed distance, so AA comes free) and `fillWhere` (any test; return a number for soft coverage).
- **Bitmaps:** `blit(sprite(...))`, `draw(otherCanvas)`, `text`.

Every fill takes `{ a, aa, dither }`: opacity, anti-aliasing, dithered rounding. Shape coordinates are continuous (pixel centres at +0.5); `pixel`, `line` and `rect` take integer pixels.

Sprites are pictures with a palette:

```js
const boat = sprite(`
  ..m..
  .wwww
  hhhhh`, { m: 0x8a8a8a, w: 0xf0f0f0, h: 0xa03020 });
g.blit(boat, x, y);              // or { c } to paint it one colour, { scale, flipX }
```

At sizes under ~12 pixels a drawn sprite beats any formula: eyes, feet,
letters, gulls.

### Type

The chip has no font; pick type on purpose. `node tools/render.mjs specimen`
shows the kit's: `font3x5` and `font5x7` (bitmap, `g.text`), `strokeDigit` /
`strokeText` (rounded vector digits at any size and weight, hard or AA,
`morph` between digits), `segDigit` (seven segments, with a `ghost` colour
for unlit ones), `dotText` (LED-matrix dots). Drawing your own digits as
sprites or shapes is often better.

## What makes a face good here

From the owner's verdicts on ~90 OLED and 1602 faces:

- **Creativity first.** A competent but conventional face reads as boring.
- **No default of four big digits with decoration round them.**
- **Letterforms drawn for the theme.**
- **Constant motion,** and smooth physical transitions as the centrepiece.
- **Characters and little stories** are well liked.
- **Use the canvas.** Colour, a 2:1 strip, the time of day: a face that could have been the OLED face in a new colour is a missed idea.
- **The time is never wrong mid-transition.** Empty or partly drawn digits are fine. A different, wrong number is not. Finish removing old digits before :00 and start placing new ones after it.

The shipped designs are examples of the constraints being met, not a style
to stay inside:

- `harbour`: a crane swaps numbered crates, with a real day's sky.
- `koi`: stone digits under moving water; a petal dissolves each changing digit.
- `mischief`: a cat paws glazed ceramic numerals off a shelf before each minute; the new ones drop in.
- `chameleon`: the digits are a mosaic of a chameleon's scales; it changes colour in a wave each minute, hunts in between and sleeps pale at night.
- `classic`: the baseline to beat.
- `specimen`: the kit's type.
- `testcard`: bring-up.

A new design should have its own idea.

## Checklist

- Did you render it and look at the image? At true size (`--scale 4`) too?
- Does it read mid-transition? Render a `--sheet` across a minute turn and an hour turn (`--clock 10:59:50`), and at night (`--clocks` with a few times of day).
- Is the palette deliberate, and is the choice of hard or AA per element deliberate?
- Does `node tools/check.mjs --design <key>` pass? Is the workload sensible (per-pixel calls in the hundreds, not tens of thousands)? After touching `sim/js/`, also run `--design all` and `node tools/test.mjs`.
- Does it render correctly when `frame` is called once, at an arbitrary time?
- Copying a reference (a photo, a logo, a character)? Crop and enlarge it, and compare your render side by side.

## On real hardware

Run `testcard` first. It shows:

- a 1-pixel white frame round the edge
- red, green and blue boxes left to right
- an arrow pointing up and right
- channel ramps

If the glass differs, the module's init is wrong, and the card says how:

- A missing edge, or a stripe of noise on the other side, means the window offset is wrong. This module comes in two batches: (1, 26) with inversion on, or (0, 24) with it off.
- A white background means inversion is wrong.
- Red and blue swapped means the BGR bit is wrong.
- A mirrored arrow means MX/MY are wrong.

Firmware notes, including the ESP32C3-CORE pins and its one-time eFuse
for the backlight pin, are in `references/hardware.md`.

Porting a face to C: the canvas is a `uint16_t[160*80]`, byte-swapped on
little-endian MCUs because the chip wants the high byte first. Each `g.*`
call is one C function with the same arguments. Colours are `0xRRGGBB`
until they are written.
