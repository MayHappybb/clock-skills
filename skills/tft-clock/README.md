# TFT clock studio

A simulator for small colour LCD modules, starting with the Luat Air101-LCD
(0.96" IPS, 160x80, ST7735S on SPI). It's built so clock faces can be
designed, rendered and reviewed by a person or by an agent that can only
look at pictures.

`sim/js/st7735.js` executes the bytes firmware sends:

- the 132x162 frame memory and the CASET/RASET window, with its wrap
- MADCTL rotation, mirroring and BGR order
- 12/16/18-bit pixel formats, inversion, idle mode and gamma select
- the frame-rate registers
- the time every byte takes on the wire

The renderer draws the glass at its real pixel pitch: sub-pixel stripes, the
LCD's dark-grey black, the backlight, the liquid crystal's lag, and a tear
when a refresh crosses a frame still on the wire. `references/hardware.md`
lists every fact used and where it comes from.

Faces are JavaScript against an RGB565 canvas whose calls map one to one
onto C functions. Nothing assumes a particular MCU: each frame's workload is
reported, with a rough C estimate for a few host profiles.

## Quick start

```console
node tools/render.mjs --list                    # the designs
node tools/render.mjs harbour                   # out/harbour.png
node tools/render.mjs harbour --crop body       # on the board
node tools/render.mjs harbour --clock 10:09:45 --frames 12 --duration 30 --sheet --px 3 --cols 3
node tools/frame.mjs koi --crop 60,20,24,16     # exact pixels, as text
node tools/check.mjs --design all               # all-day proof
node tools/serve.mjs                            # live: http://localhost:8174/sim/?design=koi
node tools/test.mjs                             # regression tests
```

Node 18+. `--gif` needs ffmpeg. The live view needs a browser; nothing else does.

## The designs

| Key | What it is |
|---|---|
| `harbour` | A quay crane swaps numbered crates on a barge each minute. Trucks bring and take them, and the sky follows the real day. Hard pixels. |
| `koi` | Two koi circle over stone digits under moving water. A falling petal dissolves each digit that changes. Anti-aliased. |
| `mischief` | A ginger cat paws glazed ceramic numerals off a shelf before each minute. They tumble away and the new ones drop in and bounce. The sky outside the window follows the day. |
| `chameleon` | The digits are a mosaic of a chameleon's scales. It changes colour in a wave each minute, catches a bug with its tongue in between, and sleeps pale at night. |
| `classic` | The library default, as the baseline. |
| `specimen` | The kit's type and edges, hard against anti-aliased. |
| `testcard` | Bring-up on real glass: offset, inversion, colour order, mirroring. |

Start with `SKILL.md`.
