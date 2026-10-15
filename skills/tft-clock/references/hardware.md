# Hardware facts the simulator uses

Every number the simulator relies on, where it comes from, and how sure it
is. The full research, with every source URL and page number, is in
`hardware-notes.md` (tags like [DS11 p151] resolve there).

Marks: **V** read in a datasheet, schematic or driver source; **I**
inferred from those; **A** the simulator's own assumption, no source.
Nothing here has been measured on hardware yet.

## The module: Luat Air101-LCD

| Fact | Value | Used in | Mark |
|---|---|---|---|
| Glass | 0.96" IPS, normally black, 160 x 80 | modules.js | V |
| Pixel pitch | 0.135 x 0.1356 mm (simulated as 0.1356 square) | modules.js | V |
| Active area | 21.7 x 10.8 mm | modules.js | V |
| Glass outline | 27.95 x 13.5 mm; active area 1.35 mm from the long edges, 1.7 mm from one short end, ~4.55 mm from the FPC end | modules.js `glass` | V/I |
| Board | 51 x 21 mm, purple, with a 5-way key; where the glass sits on it | modules.js `pcb` | V size / A position |
| Sub-pixels | RGB vertical stripe along the 160 axis: in landscape each pixel is three bands stacked vertically | panel.js | V/I |
| Brightness | 300-400 cd/m² (comparable modules) | not modelled; "white" is full exposure | V for those modules |
| Contrast | 800:1 minimum | modules.js `contrast` | V for those modules |
| Response | Tr + Tf = 30 ms typical, 40 ms max | first-order lag, 7.5 / 6 ms time constants | V / A (the lag model) |
| IPS corner glow, backlight falloff | modules.js `glow`, `falloff` | panel.js | A |
| Gamma | 2.2 for GAMSET 01h; the other curves 1.8, 2.5, 1.0 | modules.js `gammaCurves` | A |
| Backlight | one white LED, 15-20 mA, switched by a transistor on BL (active high); brightness by PWM | `ctx.lcd.backlight()` | V |
| TE (tearing sync) pin | not brought out | tearing is modelled, can't be avoided by sync | V |
| Keys | 5-way, active low, no pull-ups on the board; direction names disagree between sources | not modelled | V |

**Two panel batches.** The 160 x 80 window sits at one of two places in
the controller's memory, and the glass needs inversion or not:

- (x 1, y 26) in landscape, inversion on: LuatOS st7735s, Grrtzm, Waveshare. The simulator's default.
- (x 0, y 24), inversion off: LuatOS st7735v, the Air32 demo.

Designs look the same on either. Only firmware cares, and the `testcard`
design tells them apart on real glass (see SKILL.md, "On real hardware").

**Colour order is BGR** (MADCTL bit 3 set) in every Luat driver [V]. The
landscape MADCTL is 0x78 (MX, MV, ML, BGR) [V].

## The controller: Sitronix ST7735S

From the V1.1 datasheet (V1.4 agrees wherever checked).

- **Memory** 132 x 162, 18 bits a pixel. 396 source lines (132 x RGB) and 162 gate lines [V].
- **Refresh** = 850 kHz / ((RTNA x 2 + 40) x (LINE + FPA + BPA + 2)) [V]. LINE isn't defined in the datasheet. 162 puts every reset default at about 60 Hz [I]. The Luat init (05/3C/3C) gives 59.9 Hz; the reset default (05/3A/3A) gives 60.7 Hz [I].
- **Scan order** gate lines one after another along the 162 axis. In landscape the line being refreshed is a vertical column sweeping across the 160 width; ML sets the direction [V/I]. This is what `--tear` draws.
- **Serial write clock** 66 ns minimum cycle, so 15 MHz rated [V]. Luat and community code runs it at 20-40 MHz and reports it working [V]; designs default to 40 MHz (`spi40`).
- **RGB565** goes high byte first [V]. Inside, 5-bit red and blue become 6 bits through a lookup table (RGBSET) with undocumented power-on contents [V]. The simulator repeats the top bit [A].
- **MADCTL** MY/MX/MV change only how writes land in memory; ML/MH set the refresh order [V].
- **Reset timing** 120 ms after SWRESET and after SLPOUT [V].

## Frame cost

A full frame is 25,600 pixel bytes plus the window commands. At 40 MHz that
is 5.1 ms on the wire against a 16.7 ms refresh, so the bus is never the
limit at this size. Each SPI transaction is charged a fixed 8 µs (queue,
chip select, DMA set-up) [A].

## A host that has driven it: LuatOS ESP32C3-CORE

The design side does not assume an MCU. This is the board the owner has; it
matters for firmware bring-up, not for faces.

- Pins: SCL 2, SDA 3, RES 10, DC 6, CS 7, BL 11 [V]. Keys on GPIO 4 (centre), 5, 8, 9, 13 [V]; 8 and 9 are strapping pins, 13 also drives an LED.
- **GPIO11 is the flash supply pin by default.** Using it for BL needs a one-time, irreversible eFuse burn (`VDD_SPI_AS_GPIO`). The Luat wiki says this is safe on this board [V]. Check whether it is already burned before assuming the backlight pin works.
- SPI through the GPIO matrix: 40 MHz is the highest documented clock [V]. One DMA transaction carries up to 32 KB, so a whole frame fits in one [V].
- RV32IMC at 160 MHz, no FPU: a float add is about 100 cycles, cosf about 2,400 [V]. This is why `cost.js` keeps a soft-float profile.

## The cost model (cost.js)

All of it is [A]: rough cycle prices per pixel written, blended, anti-aliased,
per call of your own per-pixel code, and per Math call, for C ported the
efficient way. Host profiles (esp32c3, esp32s3, rp2350) scale those by clock
and by whether there is an FPU. Calibrate on hardware before trusting
anything closer than a factor of two.
