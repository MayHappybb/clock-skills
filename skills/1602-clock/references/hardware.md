# The hardware, as the datasheet states it

Source: SunFounder LCD-1602A datasheet, distributed by Digi-Key as
"CN0295D other related document"
(https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/5773/CN0295D%20other%20related%20document.pdf).
Section names below are the datasheet's. Anything not from that document is
marked *(not in the datasheet)*.

## Glass

| Item | Value | Section |
|---|---|---|
| Characters | 16 x 2 | General Specification |
| LCD type | STN, positive, transflective, grey | General Specification |
| Dot size / pitch | 0.55 x 0.65 mm / 0.60 x 0.70 mm | General Specification, DOT SIZE drawing |
| Character size / pitch | 2.95 x 5.55 mm / 3.55 x 5.95 mm | same |
| Gap between cells | 0.60 mm across, 0.40 mm down | DOT SIZE drawing |
| Viewing area | 64.5 x 14.5 mm | General Specification |
| Drive | 1/16 duty, 1/5 bias | General Specification |
| **Response time** | **rise 150 ms typ / 200 ms max, fall the same** | Optical Characteristics |
| Viewing angle | 6 o'clock; V 10..105 deg, H -30..30 deg at CR >= 2 | Optical Characteristics |

The "Active Area" figure (55.65 x 9.40 mm) does not agree with 16 x 3.55 mm of
character pitch. The simulator follows the dot-level drawing, which is
self-consistent.

The datasheet module is a positive grey STN. The `blue` and `amber` panel
presets are negative-mode variants of the same glass, with the same geometry
and controller. Their response times will be similar but are not stated here.

What the response time means for design: a first-order lag with a
10-90% time of 150 ms has a time constant of about 68 ms. A dot shown for one
frame reaches 1 - e^(-dt/68ms) of full contrast: 70% at 12 fps, 39% at 30 fps.
`sim/js/player.js` (`opticalLevels`) applies exactly this to every render
unless `--response off` is passed.

## Controller

| Item | Value | Section |
|---|---|---|
| DDRAM | 80 bytes; line 1 at 0x00-0x27, line 2 at 0x40-0x67; 0x00-0x0F and 0x40-0x4F visible | DDRAM |
| CGRAM | 8 patterns at 5x8, or 4 at 5x10 | CGRAM |
| Codes for CGRAM | `0000 *000` .. `0000 *111`: bit 3 ignored, so 0x08-0x0F alias 0x00-0x07 | Table 1 |
| CGRAM row 8 | the cursor-pattern row; shown like any other row when the cursor is off | Table 1 |
| ROM | the A00 set (Japanese katakana + symbols) | Table 2 |
| Clear display, return home | 1.53 ms | Table of Commands |
| Other instructions | 39 µs | Table of Commands |
| Write / read data | 43 µs | Table of Commands |
| E cycle time | 500 ns min | Write Operation |
| Initialisation | 3x function set with 4.1 ms and 100 µs waits, then N/F, display off, clear, entry mode | Initializing of LCM |

The Table of Commands says Clear Display writes "00H" to DDRAM. On the
HD44780 it writes 20H, a space *(not in the datasheet; Hitachi HD44780U
datasheet)*. If it really wrote 00H, every cell would show CGRAM slot 0 after
a clear.

In two-line mode the address counter runs from 0x27 to 0x40 and from 0x67 back
to 0x00 *(not in the datasheet; HD44780 behaviour)*. Display shift moves the
16-cell window along the 40-address line, so shifting brings 0x10-0x27 into
view. One shift instruction scrolls both lines for 39 µs, which costs almost
nothing as a marquee. Return Home and Clear Display also undo the shift
*(HD44780U datasheet)*; `carousel` relies on this.

## Bus

The datasheet documents only the parallel bus (8-bit or 4-bit, E strobe). The
usual I2C backpack is a PCF8574 driving the LCD in 4-bit mode *(not in the
datasheet)*:

- One LCD byte = two nibbles, each written with E high then E low: four
  expander bytes, 36 bit-times. That is ~360 µs at 100 kHz and ~90 µs at
  400 kHz. The emulator uses 400 / 100 µs to leave room for framing.
- The PCF8574 is specified for 100 kHz. 400 kHz is out of spec, though often
  works.
- Arduino's `LiquidCrystal_I2C` sends each E edge as its own transaction with
  delays, roughly 3x slower than a streaming driver.

## Time-division multiplexing, and what the simulator does not model

**More than eight glyphs by alternating frames.** A design can alternate two
(or more) CGRAM pages, a different set of eight glyphs in each phase, and let
the slow glass average them. That does not give 16 sharp characters. A dot
lit in k of N phases settles at about k/N of full contrast and ripples at the
phase rate. With the first-order model (tau = 68 ms):

| phases/s | 2-phase ripple, peak to peak | what it looks like |
|---|---|---|
| 25 (I2C 100 kHz, full redraw) | ~28% at 12.5 Hz | visible flicker |
| 60 (parallel or I2C 400 kHz) | ~12% at 30 Hz | a shimmer |
| 120 (parallel) | ~6% at 60 Hz | steady grey |

So TDM buys more pictures by spending contrast. Content that must read is put
in every phase (full contrast, a slot in each); the rest gets the remaining
slots of each phase at 1/N contrast. Splitting a half-tone area into two
complementary dot patterns, one per phase, keeps its average brightness
constant, so its flicker cancels at a distance (`phantom` uses the 1-in-3
version for a third tone).

**What the simulator does not model.** It is exact for the controller (RAM,
aliasing, shift, trap #1) and the bus, and close for dot geometry and the
150-200 ms lag. It is approximate or silent on:

- *Greys.* Liquid crystal responds to the RMS drive voltage through a steep,
  threshold-like curve, set by the contrast pot (V0). The simulator averages
  linearly, so a dot on half the time draws at 50%; on glass it may look
  nearly off or nearly on. Any design that relies on a grey needs checking on
  the bench, and probably a contrast tweak.
- *Rise is not fall.* The datasheet gives 150 ms typical for both; real
  panels often switch on faster than off. Cold glass is slower.
- *The controller's own refresh.* The HD44780 multiplexes the glass at 1/16
  duty, about 60-85 Hz depending on its RC oscillator, with AC frame
  inversion. Writes are not synchronised to it, so a page change mid-scan
  shows the new glyph in some dot rows for one LCD frame (a tear), and a
  phase rate near the frame rate can beat into slow rolling bands. The
  simulator applies every frame to the whole glass at once.
- *Host timing.* Frames on a microcontroller jitter, and the common
  LiquidCrystal_I2C library is about three times slower than the bus figures.
- *STN crosstalk, viewing angle, backlight.* Rows or columns with many lit
  dots can shade their neighbours slightly; the image changes with angle.

A proposal (MisterHW/44780HD on GitHub, not a demonstrated result) goes
further: rewrite DDRAM in sync with the controller's row scan so each dot row
of a cell comes from a different character. It needs a parallel bus, a way to
lock to the internal row counter, and probably a hardware tap on the column
data line. Nothing in this skill attempts it.

`calibrate` is a test card for measuring a real module against the model.
