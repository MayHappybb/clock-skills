---
name: oled-clock
description: Design and animate clock faces for small monochrome OLED modules, 128x64 ("12864", 0.96" SSD1306 or 1.3" SH1106) and 128x32 ("12832", 0.91" SSD1306). Use when asked to design, redesign or animate a clock or watch face, animation or pixel-art scene for an SSD1306 / SH1106 OLED, to make such a display look unlike the usual library-font clock, or to check whether a face will actually run on the hardware (bus speed, burn-in, init sequence). Provides a controller emulator that runs real command bytes, a renderer at the panel's true pixel geometry, a tearing model, and a checker that proves a face fits the bus and estimates burn-in over a whole day.
---

# Designing clock faces for a 128x64 / 128x32 OLED

You are designing what appears on a small monochrome OLED: 128 pixels
across, 64 (or 32) down, each pixel on or off. There is no grey, no colour
per pixel and no font in the chip. Everything on the glass is pixels the
firmware drew into a buffer and sent over the bus.

The facts below come from the controller and panel datasheets; each is
listed with its source in `references/hardware.md`. Where something is a
model or an assumption rather than a datasheet figure, it says so.

Everything needed is built and working, in the directory containing this file.
Your job is to design faces, not to build tooling.

```
sim/js/ssd1306.js       controller emulator: command bytes, GDDRAM, scan-out, bus cost
sim/js/driver.js        the init sequence and the frame transfer, as the Adafruit/U8g2 drivers do it
sim/js/modules.js       the modules: pixel pitch, active area, glass, PCB, colours
sim/js/panel.js         draws the glass (and the board) at true geometry
sim/js/gfx.js           the 1-bit canvas a design draws on: lines, discs, arcs, polygons, dither, sprites
sim/js/fonts.js         type: 3x5, 5x7, scalable vector digits, seven-segment, LED-dot text
sim/js/kit.js           everything above re-exported, plus easings, noise, clock fields, burn-in orbit
sim/designs/            worked examples: read some before writing your own
tools/frame.mjs         a frame as text, instantly, no browser
tools/render.mjs        a design as PNG, GIF or contact sheet you can look at
tools/check.mjs         proves a design runs all day; writes a burn-in map
tools/serve.mjs         live view in a browser, on the real clock
tools/emulator-test.mjs regression tests for the emulator
```

Run everything from that directory. Needs Node 18+. `render.mjs` needs
Chrome, Chromium or Edge (`CHROME=/path` if it is not found); `--gif` needs
ffmpeg or ImageMagick. `frame.mjs` and `check.mjs` need only Node.

## The loop

Design by looking, not by reasoning. Settle every question about how a face
reads by rendering it and looking at the image.

```console
node tools/frame.mjs mydesign --half                         # fast text frame, no browser
node tools/frame.mjs mydesign --crop 0,0,40,30               # zoom into part of it, pixel exact
node tools/render.mjs mydesign                               # out/mydesign.png
node tools/render.mjs mydesign --clock 10:09:57 --frames 8 --duration 3.2 --sheet --px 4
node tools/render.mjs mydesign --frames 40 --duration 4 --gif --px 4
node tools/check.mjs --design mydesign                       # before calling it done
```

`--t` is animation time in seconds and `--clock HH:MM:SS` sets the wall clock
at `t=0`, so any instant renders on its own. `--sheet` tiles the frames into
`out/<design>-sheet.png`: put the clock a few seconds before a minute turns
and review the whole transition in one image. All the frames of one run are
drawn in a single browser launch, so 40-frame GIFs are cheap.

`--px` is screen pixels per OLED pixel (default 6). `--crop view` (default)
is the pixels; `--crop body` the whole module on its PCB, the hero shot.
`--style clean` drops the glass and bloom. `--colour` picks the emission
colour the module offers (`node tools/render.mjs --modules`).

Live: `node tools/serve.mjs`, open `http://localhost:8173/sim/?design=<key>`.
It runs on the real clock at the design's fps, with buttons to jump to the
next minute or hour turn.

## The canvas is tiny, and that is the first constraint

A 0.96" panel's pixels are on a 0.17 mm pitch: the whole 128x64 picture is
21.7 x 10.9 mm. The 0.91" 128x32 is 22.4 x 5.6 mm. A 5x7 letter is under a
millimetre wide. So:

- **Look at it at true size.** A monitor shows about 4 screen pixels per mm;
  render with `--scale 4` (px/mm) and look at that before trusting a zoomed
  render. Detail finer than ~2 pixels disappears at arm's length.
- Strokes of 1 pixel read as hairlines. Digits that must be read across a
  room want strokes of 3-5 pixels.
- Pixels are square and almost touch (fill factor ~90%), so a solid area
  reads as solid, and a one-pixel dark gap between two lit shapes is visible
  but faint.

## Dark is free, light is wear

An OLED pixel makes its own light; an unlit pixel is black glass. There is no
backlight and no visible unlit grid. Two consequences:

- **Black is the canvas.** Large lit areas are glaring at night and draw
  current: a mostly black face with lit shapes is the native look. Inverse
  (`oled.invert()`) is a one-byte effect, best kept for a flash.
- **Pixels age with use.** The 0.96" panel is rated at 10,000 hours to half
  brightness. A pixel lit 20 hours a day gets there in about a year and a
  half, while its unlit neighbours do not: that is burn-in. `check.mjs`
  reports the hottest pixel, an estimate of when it reaches 50%, and writes a
  heat map (`out/<design>-wear.png`). Move the static parts: `kit.orbit(date)`
  walks a block round a small square every few minutes. Dim at night: life
  rises steeply as brightness falls (one 1.3" panel: 10k h at 120 cd/m²,
  50k h at 60).

## Grey is dither, and brightness is global

One bit per pixel. Shading is an ordered dither (`g.shade`, or return a
number from `g.fillWhere`): at 0.17 mm pitch a 50% pattern reads as grey from
any distance. Bayer dithering keeps ramps stable when they move.

`oled.contrast(v)` (0..255) changes the segment current for the whole panel
in two bytes: a fade, a breathing glow, a dimmer night mode. It cannot dim
one part of the screen. Current is linear in the setting (datasheet); that
light follows current is the simulator's assumption.

**Night dimming** uses `ctx.night`, never the clock directly: 0 by day, 1 at
night (23:00-07:00, `kit.NIGHT`), fading over the first and last minute.
Dim with `oled.contrast(DAY + (NIGHT_LEVEL - DAY) * ctx.night)`. The player
computes it, so the viewer can preview night or switch it off (live view
menu, `--night off|on` on render.mjs and frame.mjs). Without that, a
viewer who jumps to an hour turn late in the evening just sees the panel go
dark and thinks it broke.

**Registers are per frame, like pixels.** Anything `frame()` does not
request this frame (contrast, invert, start line, offset, display on)
reverts to the module's init value. So request it every frame you want it,
and a one-frame flash is just a one-frame request.

## The bus decides the frame rate

The glass is fast (10 µs rise and fall), so motion is never smeared by the
panel the way an LCD's is. What limits motion is getting the bytes there. A full
128x64 frame is 1024 bytes:

| Bus | full 128x64 frame | so at most |
|---|---|---|
| I2C 100 kHz | ~100 ms | ~10 fps |
| I2C 400 kHz (datasheet max) | ~25 ms | ~40 fps |
| I2C 1 MHz (out of spec, often works) | ~10 ms | ~100 fps |
| SPI 10 MHz (SSD1306 max; SH1106 is 4 MHz) | ~1 ms | far more than needed |

A 128x32 frame is half that. `frame.mjs` and the live view print the exact
cost; `check.mjs` fails a design if any frame of the day overruns. Software
overhead on the MCU is not counted, so leave margin: on I2C 400 kHz, 20-25
fps for a full-screen animation is honest.

**Defaults:** this project's owner runs the 128x64 modules on SPI, so
128x64 designs use `bus: 'spi10', fps: 60`. On SPI the bus is no longer the
limit (a full frame is 0.82 ms); the panel refreshes at ~88 Hz, so frame
rates above that are not seen. The 0.91" 128x32 boards are I2C-only, so
designs for them use `bus: 'i2c400'` at up to about 50 fps (a full frame
there is ~13 ms). On an SPI bus the module is drawn with its 7-pin board.

At 60 fps, motion moves about a pixel a frame: derive every position from
time (seconds), never from a frame count, and round late, so things glide
instead of stepping. Keep `frame()` to a few milliseconds; the live view
reports the rate the browser actually achieves ("this browser is showing N fps").

Any design can be tried at another rate: `--fps 30` on `render.mjs`,
`frame.mjs` and `check.mjs`, and the fps menu in the live view. GIFs cannot
play faster than 50 fps (their delays are whole centiseconds, and browsers
slow anything under 2 to 10), so make preview GIFs with 50 frames per second
of animation: `--frames 300 --duration 6`.

`driver: 'dirty'` sends only the changed span of each page instead of the
whole buffer. A clock that changes a few digits a second then costs a few
dozen bytes a frame; a full-screen animation costs slightly more than
`'full'` (each page gets its own address window).

## Tearing

The panel refreshes on its own oscillator, about 88 Hz on a 128x64 with the
standard init (175 Hz on a 128x32; 79-96 Hz over the oscillator's
tolerance), whatever the bus is doing, and the 4-pin modules have no sync
pin. On SPI 10 MHz a frame arrives in 0.82 ms, a small part of one
refresh, so tearing is rarely visible there. A full frame
over I2C 400 kHz takes about 25 ms, two or three refreshes, so for a while
the glass shows the new frame above the write front and the old one below,
in 8-row page bands. Fast horizontal motion of tall shapes shows a step at
page boundaries. `--tear` renders one refresh as scanned mid-transfer, and
the live view has a checkbox. Things that avoid it: slower motion,
`driver: 'dirty'` with small changes, SPI, or the hardware tricks below,
which change what is shown without moving pixel data at all.

## Hardware tricks that cost almost nothing

The controller can move the whole picture itself. Each is a register,
requested from `ctx.oled` in `frame()`; the player sends it only when it
changes.

- `oled.startLine(n)`: which RAM row is shown at the top. Rolls the picture
  vertically, wrapping, for one byte. On a **128x32 the controller still has
  64 rows of RAM**: set `ramPages: 8`, draw the next screen into rows 32-63
  out of sight, then roll to it (`reel` does).
- `oled.contrast(v)`: global fade.
- `oled.invert(on)`: swaps lit and unlit, all of it.
- `oled.scroll({ dir, startPage, endPage, interval, since })`: the chip
  rotates a band of pages sideways by itself, one pixel every 2-256 panel
  frames. A ticker for free. While it runs no RAM may be written, so the
  design must keep drawing the same picture. SSD1306 only.
- `oled.display(on)`, `oled.allOn(on)`.

**Segment remap (0xA0/0xA1) only affects data written after it**; it is not
a free mirror of what is on screen. COM scan direction (0xC0/0xC8) is
immediate. The emulator behaves the same way.

## Writing a design

Add a file under `sim/designs/` and register it in `sim/designs/index.js`.

```js
import { strokeText, font3x5, orbit } from '../js/kit.js';

export default {
  name: 'MyFace',
  blurb: 'One line, shown in the gallery.',
  module: '096-128x64',   // 096-128x64 | 091-128x32 | 130-128x64  (render.mjs --modules)
  colour: 'white',        // one the module offers: white | blue | yellow | yellow-blue
  bus: 'spi10',            // spi10 for 128x64; i2c400 for the 0.91" 128x32
  fps: 60,                // frames sent per second (50 max-ish on 0.91" I2C)
  driver: 'full',         // or 'dirty'
  // ramPages: 8,         // draw more RAM than is visible (128x32 hidden half)

  frame(g, ctx) {
    // ctx: { t, date, fields, kit, fps, night, W, H, module, oled }
    const f = ctx.fields;                 // h m s sec hh mm ss h12 pm dow month day dd year minuteKey
    const [ox, oy] = orbit(ctx.date);     // burn-in walk
    strokeText(g, `${f.hh}:${f.mm}`, 10 + ox, 10 + oy, { w: 20, h: 32, weight: 4 });
    g.text(f.dow, 0, 0, { font: font3x5 });
  },
};
```

`frame` is called **once per frame and must fully define the frame**: the
canvas starts black every time. A still is made by calling it at whatever
time was asked for, so it cannot rely on anything left from a previous call.
Derive every animation from the clock (`fields.sec`, `fields.minuteKey`,
`date`): "where is the ball at 10:09:42.3" must have an answer without
simulating from boot. If a motion is easiest as a simulation, simulate from
the start of the current minute inside `frame` (it is cheap at this size).

### The canvas, `g`

`gfx.js` documents every call. In short: `pixel`, `line`, `thickLine`,
`stroke` (polyline), `rect`/`fillRect`, `roundRect`/`fillRoundRect`, `circle`
(crisp midpoint), `fillCircle`, `fillEllipse`, `ring`, `arc` (clock angles:
0 = 12 o'clock, clockwise, radians), `fillPolygon`, `shade` (dither),
`fillWhere(test)` (any shape as an inequality; return a number for a dither
level), `blit(sprite(...))`, `text`, `invert`, `shift`, `clip`/`unclip`.
Colour is 1 (light), 0 (clear) or 2 (XOR). Shape coordinates are continuous
(pixel centres at +0.5); `pixel`/`line`/`rect` take integer pixels.

Sprites are pictures: `sprite(\`\n  .##.\n  #..#\n\`)` with `#` lit and `.`
unlit. At sizes under ~12 pixels a drawn sprite beats any formula: eyes,
lips, feet, letters.

### Type

The chip has no font; pick type on purpose. `fonts.js`:

- `font5x7` the classic HD44780-shape 5x7, full ASCII. `font3x5` for labels.
  `g.text(str, x, y, { font, scale })`, `font.measure(str, scale)`.
- `strokeDigit` / `strokeText`: rounded geometric digits drawn as thick
  strokes, at any size and weight. `morph` blends one digit's centre-line
  into another's.
- `segDigit`: seven-segment with bevelled ends; `ghost` shows unlit segments
  as dither.
- `dotText`: a bitmap font drawn as round dots, the LED-matrix look.

Run `node tools/render.mjs specimen` to see them. Nothing stops you drawing
your own digits as sprites or shapes, and the best faces often do.

## What to aim for

Most OLED clocks look the same: the library's default font at size 2,
centred, with the date under it (`classic`). The levers, in order of impact:

1. **Draw the face.** Big, deliberate digits; a scene; an analog dial with
   real hands. 8192 pixels is room for a character with a personality.
2. **Give it hierarchy.** One big thing, one or two small ones.
3. **Make the minute an event.** Something happens when it turns: a catch,
   a roll, a flip, a collapse. Render the turn as a sheet and make it read.
4. **Use the black.** Light only what matters.
5. **Respect the bus and the burn.** Run `check.mjs`.

The shipped designs are examples of the constraints being met, not a style
to stay inside. A new design should have its own idea.

## Checklist

- Did you render it and look at the image? At true size (`--scale 4`) too?
- Does it read mid-transition? Render a `--sheet` across a minute turn and an hour turn.
- Does `node tools/check.mjs --design <key>` pass (bus budget, warnings,
  errors), and is the hottest pixel's wear sensible? (`--design all` after
  touching anything in `sim/js/`, plus `node tools/emulator-test.mjs`.)
- Does it render correctly when `frame` is called once, at an arbitrary time?
- On a yellow-blue panel, does the layout respect the colour split at row 16?
  There is a real gap of two pixel pitches between the bands.
- Copying a reference (a photo, a logo, a character)? Crop and enlarge it,
  measure it, and compare your render side by side before calling it done.

See `references/` for the hardware facts with sources, the traps, and a
walkthrough of how each shipped design solves its problem.
