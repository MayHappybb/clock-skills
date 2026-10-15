# OLED clock studio

A simulator for the small monochrome OLED modules (128x64 SSD1306 0.96",
128x64 SH1106 1.3", 128x32 SSD1306 0.91"), built so clock faces can be
designed, rendered to images and reviewed, by a person or by an agent that
can only look at pictures.

It is not a mock-up. `sim/js/ssd1306.js` executes the command bytes firmware
sends: GDDRAM in pages, the addressing modes and their wrap rules, start
line, offset, multiplex ratio, segment and COM remap, COM pin configuration,
contrast, inverse, hardware scroll, and the cost of every byte on I2C or SPI.
The renderer draws the panel at its real pixel pitch, active area and glass,
and can show tearing: what one panel refresh looks like while a frame is still
on the bus. A design that will not run says so. `references/hardware.md` lists
every fact used and where it comes from.

## Quick start

```console
node tools/serve.mjs                       # live simulator with a design picker
node tools/render.mjs --list               # the designs
node tools/render.mjs frog                 # out/frog.png
node tools/render.mjs frog --fps 30        # any design at another frame rate
node tools/render.mjs frog --crop body     # on the module
node tools/frame.mjs frog --half           # the same frame as text, no browser
node tools/check.mjs --design all          # bus budget + burn-in, all day
node tools/emulator-test.mjs               # emulator regression tests
```

Node 18+. Renders need Chrome, Chromium or Edge (`CHROME=/path`); `--gif`
needs ffmpeg or ImageMagick. `frame.mjs` and `check.mjs` need only Node.

## Layout

```
sim/js/ssd1306.js   controller emulator
sim/js/driver.js    init sequences, full and dirty-rectangle frame transfer
sim/js/modules.js   module geometry: pitch, active area, glass, PCB, colours
sim/js/panel.js     draws the glass and the board
sim/js/player.js    "design at time t" -> controller state -> pixels; tearing model
sim/js/gfx.js       the 1-bit canvas designs draw on
sim/js/fonts.js     3x5, 5x7, vector digits, seven-segment, dot text
sim/js/kit.js       re-exports, easings, noise, clock fields, burn-in orbit
sim/designs/        the clock faces
tools/              render, frame, check, serve, tests
references/         hardware facts with sources, traps, design walkthroughs
```

## The designs

| Key | Module | What it is |
|---|---|---|
| `neon` | 0.96" | Bent-glass neon digits and a script day name; tubes sputter out and strike on the minute. |
| `numberfolk` | 0.96" | The digits are little characters who blink, wave goodbye and arrive by parachute or manhole. |
| `truchet` | 0.96" | A tile typeface in a Truchet field; at the minute the tiles lift, spin and re-form. |
| `mercury` | 0.96" | Liquid chrome metaball digits that melt into a pool and climb out as the new minute. |
| `brush` | 0.96" | Ink-brush calligraphy written live each minute, with a Chinese date inscription and seal. |
| `stringart` | 0.96" | Digits of thread on nails; a shuttle strings each new minute. |
| `opart` | 0.96" | Riley lines: the digits are where the waves go calm; a ripple develops each new minute. |
| `extrude` | 0.96" | Ray-cast chrome 3D title type over a synthwave grid; digits spin at the minute. |
| `frog` | 0.96" | The rainbow frog in glasses watches a fly all minute and catches it at :58. |
| `kitcat` | 0.96" | The Kit-Cat Klock: eyes and tail tick once a second; a wink each minute, a yawn each hour. |
| `invaders` | 0.96" yellow-blue | The formation spells the time; the cannon shoots the old minute apart and a ship drops the new one. |
| `dino` | 0.96" | The Chrome T-Rex runs and jumps; a pterodactyl delivers each new digit. |
| `tetris` | 0.96" | Digits built from real tetrominoes: line-clear, then piece-by-piece rebuild. |
| `flip` | 0.96" | Split-flap cards falling in perspective; the board riffles on the hour. |
| `watch` | 0.96" | Analog dial with baton hands, sweep seconds, day-date and the real moon phase. |
| `aquarium` | 0.96" blue | The time is rocks on the sand; a school of fish redraws it each minute. |
| `reel` | 0.91" | The next minute waits in the hidden half of RAM; the face rolls up to it. |
| `tape` | 0.91" | A ruler of the whole day slides under a hairline dropped from the colon. |
| `classic` | 0.96" | The library default, as the baseline. |
| `specimen` | 0.96" | The kit's type. |

Start with `SKILL.md`.
