# 1602 clock studio

A simulator for the HD44780 16x2 character LCD, built so clock faces can be
designed, rendered to images, and reviewed — by a person or by an agent that can
only look at pictures.

It is not a mock-up. `sim/js/hd44780.js` is a controller emulator: real
instruction encodings taken from the datasheet's command table, real execution
times (clear 1.53 ms, write data 43 µs), CGRAM aliasing at 0x08-0x0F, and a
model of what each byte costs on the wire. The renderer draws the datasheet's
dot geometry and the liquid crystal's 150 ms switching lag. The point is that
a design which looks good here also looks that way on the actual module, and
one that will not run says so. `references/hardware.md` lists every fact used
and where in the datasheet it comes from.

## Quick start

```console
node tools/serve.mjs                      # live simulator, with a design picker
node tools/render.mjs --list              # what designs exist
node tools/render.mjs monolith --scale 14 # render one to out/monolith.png
node tools/frame.mjs monolith             # same frame as ASCII, no browser
```

## What is here

```
sim/js/hd44780.js     controller emulator: DDRAM, CGRAM, CGROM, timing, bus cost
sim/js/cgrom-a00.js   the factory font ROM, 256 glyphs, extracted from the datasheet
sim/js/panel.js       draws the emulator so it reads as a photograph of a real module
sim/js/kit.js         glyph sets, CGRAM tile allocator, easings, clock fields
sim/js/blockface.js   the reference photo's block face, as reusable parts
sim/js/player.js      deterministic "design at time t" -> emulator + canvas
sim/designs/          the clock faces
tools/                render, inspect, serve, the ROM extractor, and the tile-budget checker
references/           hardware facts, traps, a walkthrough of every design
```

Requirements: Node 18+. Renders need Chrome, Chromium or Edge (`CHROME=/path`
to point at one); `--gif` and `--sheet` need ffmpeg or ImageMagick.
`frame.mjs` and `tile-budget.mjs` need only Node.

The ROM in `sim/js/cgrom-a00.js` is not a lookalike font. It was extracted from
the character generator table printed in the module's own datasheet
(linked in `references/hardware.md`), by locating the table's dot lattice and reading back which dots
are inked — see `tools/extract-rom.mjs`. The shapes match the canonical
HD44780 set glyph for glyph, and the extractor is checked in so the asset can be
rebuilt and re-verified.

## The thing worth knowing

The controller stores only **eight** user-defined glyphs, and a character cell
refers to a glyph *slot* rather than copying it. The display re-reads CGRAM on
every refresh, so overwriting a slot changes every cell already showing it —
you cannot draw a glyph, reuse its slot for something else, and expect the first
one to stay put.

So a frame holds at most eight distinct 5x8 tiles, all resident at once, and
that single fact decides which layouts are possible:

- eight 5x8 glyphs across a row — yes
- four digits at 5x16, or at 10x8 — yes
- six digits at 5x16 — no
- four digits at 10x16, each drawn as its own bitmap: **no.** A seven-segment
  face at that size needs up to 16 tiles (`tools/tile-budget.mjs --cellW 2 --cellH 2`).
- four digits at 13x16 built from a shared kit of parts: **yes**, with at
  most seven tiles, at every time of day (`slab`). Count distinct tiles, not digits.
- **two** drawn digits at 10x16: yes, and exactly: four tiles each, all eight spent.
- a sixteen-cell animated strip — no; use eight cells, or stock ROM

The stock ROM is free, so the workable shape for anything animated is stock
characters for the static parts and CGRAM for the part that moves. The emulator
reproduces this constraint faithfully, which means a design that overruns its
tiles fails here rather than on the bench. `references/design-guide.md` works through the
consequences and has the checklist.

## The designs

| Key | What it is |
|---|---|
| `classic` | The baseline: stock ROM, centred `HH:MM:SS`. What everyone builds. |
| `monolith` | A thin 5x16 typeface spanning both rows; digits roll like a mechanical counter. |
| `aurora` | Stock-ROM time over a heart-monitor sweep that beats once a second. |
| `flipclock` | Bold 5x7 digits that flip like split-flap cards, top half first. |
| `ember` | A bold 10x8 geometric face on amber, shuttering a digit over as it turns. |
| `clone` | A heavy 10x8 face with the date beneath: an early half-height take on the reference photo. |
| `focus` | The minutes as two huge drawn digits, the rest spelled out: MIN PAST 10. |
| `slab` | The reference photo, dot for dot: block digits from shared parts, squared seconds. |
| `stack` | The same face, cleared and rebuilt by falling pieces whenever a digit turns. |
| `dial` | An analog dial drawn at the real dot positions, with the date in ROM. |
| `cipher` | Bold digits that decode through ROM katakana; a date that decrypts once a minute. |
| `tide` | Kit-of-parts digits that fill with rippling water each minute. |
| `hourglass` | Kit-of-parts digits beside a 10x16 sand glass that drains and flips. |

```console
node tools/render.mjs <key> --preset blue --scale 14 --crop body   # with the bezel
node tools/render.mjs <key> --frames 24 --duration 2 --gif         # animation
node tools/render.mjs <key> --frames 8 --duration 1.6 --sheet      # transition, one image
node tools/tile-budget.mjs --design <key>                          # fits every minute?
node tools/tile-budget.mjs --design all                            # ...for every design
node tools/emulator-test.mjs                                       # emulator regression tests
```

## Adding a design

Drop a file in `sim/designs/`, register it in `sim/designs/index.js`, then read
`SKILL.md` and `references/design-guide.md`. The shortest path is to copy `flipclock.js`: it shows tile
allocation, a fallback when CGRAM runs out, and a transition computed from the
clock rather than from previous frames.