# Traps, and what they look like when you hit them

Ordered roughly by how likely they are to bite.

## 1. `frame()` must be a function of the clock alone

`frame(g, ctx)` is called once for a still, at whatever time was asked for,
on a canvas that starts black. Nothing survives from the previous call. A
design that counts frames, accumulates positions or caches "the last
minute" renders wrongly in stills, sheets and `check.mjs`, and differently
in the live view.

**Symptom:** a sheet across a minute turn shows the animation restarting or
jumping; `--t 3` looks different from the 4th frame of a `--frames` run.

**Fix:** derive everything from `ctx.fields` / `ctx.date`. For physics,
simulate from the start of the current minute (or the last event) inside
`frame()`, with a fixed step; at 128x64 this is cheap. `previousMinute(date)`
gives what was showing before the turn.

## 2. The wrong COM pin configuration interleaves the picture

0xDA sets how the controller's 64 COM outputs map to its pins. A 128x64
panel is wired for the *alternative* configuration (0xDA 0x12), a 128x32 for
*sequential* (0xDA 0x02). Swap them and every other row comes from the wrong
half of RAM: text looks doubled, stretched or striped. The emulator wires
each panel for its own init sequence and simulates any other through the
same wiring, so `oled.commands(0xda, 0x02)` on a 128x64 shows the bench
symptom. (`emulator-test.mjs` checks both.)

## 3. An SH1106 is not an SSD1306

The 1.3" modules are usually SH1106: 132 columns of RAM, of which the panel
shows 128 starting at column 2, and **only page addressing**. A driver
written for the SSD1306 sends 0x20/0x21/0x22, which the SH1106 does not
have, then streams 1024 bytes expecting the pointer to move to the next page
by itself. It does not: every page's worth lands on the same page, wrapping.
**Symptom on the bench:** one band of garbage, the rest blank, or the image
shifted two pixels with a stripe of noise at the edge. The emulator warns
about every unknown command and wraps the pointer as the chip does. Designs
targeting `130-128x64` get the right driver automatically.

## 4. The bus, not the glass, limits motion

An OLED pixel switches in microseconds; there is no LCD smear to hide
behind or to design around. But a full 128x64 frame is 1024 bytes and on
I2C 400 kHz that is ~25 ms, before any MCU overhead. A design at 30 fps on
that bus is already at the limit; at 100 kHz (the Arduino `Wire` default, if
the library does not raise it) only ~10 fps. `check.mjs` fails a design if
any frame overruns its fps. Use `driver: 'dirty'` when little changes.

## 5. Tearing at page boundaries

The panel refreshes at ~88 Hz (128x64) from its own oscillator, with no
sync available on the 4-pin module. A frame takes longer than a refresh to
arrive, and arrives page by page, so for a refresh or two the top of the
glass shows the new frame and the bottom the old. A tall shape moving
sideways shows a step every 8 rows. See it with `--tear`. Hardware
scrolling, start line and contrast changes move nothing over the bus and do
not tear.

## 6. The yellow band is glass, not RAM

On a yellow-blue module, rows 0-15 emit yellow and 16-63 blue, and there is
a visible gap between them. The colour belongs to the physical row: rolling
the picture with `startLine` moves content across the boundary and it
changes colour. Lay out with the split in mind, and do not put a glyph
across it.

## 7. Hairlines vanish at true size

A 0.96" pixel is 0.17 mm. A one-pixel stroke reads at 6x zoom and
disappears at arm's length. Render with `--scale 4` (roughly a monitor's
true size) before trusting a detail. Clock digits want 3-5 px strokes.

## 8. Burn-in is cumulative and invisible until it is not

A static face burns in. Digits that change still share pixels (the top bar
of 0, 2, 3, 5, 7, 8, 9...), and anything never moving (dial indices, a
frame line, a logo) is lit all day. `check.mjs` reports the hottest pixel's
lit time and writes a heat map. Orbit static parts (`kit.orbit`), keep
outlines thin, dim at night with `oled.contrast()`.

## 9. Writing RAM during a hardware scroll

The datasheet says to stop a scroll (0x2E) before writing RAM; RAM written
mid-scroll may be corrupted. The player never sends RAM while a requested
scroll keeps running, so a design that changes its picture during a scroll
will not see the change until the scroll stops. The emulator warns if
anything writes RAM while a scroll is active.

## 10. Contrast is global

The whole panel's brightness moves together: there is no per-pixel level.
For grey, dither. To blank the panel use `oled.display(false)`, not
`contrast(0)`: the datasheet's current formula gives zero at 00h, but how
dark a real panel goes there is not stated (the simulator keeps it faintly lit).

## 11. Dither is fixed to the glass, not to the shape

`dither(x, y, level)` thresholds against screen coordinates, so a dithered
shape that moves (for burn-in, or as animation) keeps lighting the same
glass pixels where it overlaps itself, and its texture "swims" against its
outline. If the texture should travel with the shape, offset the pattern by
the shape's position: `dither(x - ox, y - oy, level)` (`watch` does this for
its moon).

## 12. A design that fails to load is skipped, not reported as failing

`sim/designs/index.js` loads each design separately and skips one that fails
to import (a syntax error, a module body that throws, no default export),
with a one-line message on stderr. Its key then simply is not there:
`render.mjs` says "unknown design". A design whose `frame()` throws shows up
as an ERROR in `check.mjs` and a red error in the browser.
Run `node tools/check.mjs --design <key> --quick` after every big edit.

## 13. Night dimming looks like a bug when you jump the clock

Most designs dim the panel from 23:00 to 07:00. Jump to an hour turn after
22:00 and the panel goes dark a few seconds later, and stays dark: it is
night now. Read `ctx.night` rather than testing `fields.h` yourself, so the
viewer's "night dimming: off" setting works for your design, and the live
view's note ("night dimming, 23:00-07:00") explains what happened.
