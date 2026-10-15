# WS2812 hardware facts, with sources

Each fact gives its source. The things the simulator assumes rather than
measures are listed under "Model assumptions" at the end.

## The protocol

| | WS2812B-V5/W | Original WS2812B | WS2812C-2020 |
|---|---|---|---|
| Data rate | 800 kbit/s | 800 kbit/s (1.25 µs ±600 ns per bit) | 800 kbit/s |
| T0H / T1H | 220–380 ns / 580–1000 ns | 0.4 / 0.8 µs ±150 ns | same as V5 |
| Reset (latch) | > 280 µs | > 50 µs | > 280 µs |
| Byte order | G, R, B, MSB first | G, R, B, MSB first | G, R, B, MSB first |
| PWM ("scan") frequency | 2 kHz | ≥ 400 Hz | 2 kHz |
| Current per channel | tested at 12 mA | — | 5 mA |
| Quiescent current | 0.6 mA typ. | — | < 0.5 mA |
| VDD | 3.7–5.3 V | 3.5–5.3 V | 3.7–5.3 V |

Sources:
- WS2812B-V5/W datasheet V6.1, 2022-09-08: https://world-semi.com/web/userfiles/productfile/WS2812B_V5WDatasheet_V6.1_EN.pdf
- Original WS2812B, 2013 (Adafruit mirror): https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf
- WS2812C-2020 V1.0, 2019-03-01 (SparkFun mirror): https://cdn.sparkfun.com/assets/4/c/8/a/9/WS2812C-2020_Datasheet.pdf

One frame on one data line therefore takes (LEDs × 24 × 1.25 µs) +
reset. That is 30 µs per LED, so a 331-LED hexagon takes 10.2 ms and tops
out at 98 fps. Every frame is sent in full, because the LEDs have no frame
memory.

**No datasheet was found for a 3227-package WS2812.** The seller of the
hexagon, triangle, octagon and arc boards states "3227, 12 mA, frosted"
(3227 雾状 12mA). Timing is assumed to be V5-like. Which die the 2020 boards
use is also unknown.

## Brightness is not exactly linear in the value

cpldcpu measured that the WS2812B (V1 and V5) runs an 11-bit internal PWM
and maps the 8-bit value onto it non-linearly. Duty comes out below
value/255, most of all at small values. This is not a gamma 2.2 curve.
The V5 stays dark at values 1–2 and reaches full current only above 7.
SK6812 and TX1812 are strictly linear.
http://cpldcpu.com/2022/08/15/does-the-ws2812-have-integrated-gamma-correction/

The published curve exists only as images, so the simulator renders
duty = value/255 (linear). Two consequences for designs:

- Do not trust levels below about 8/255. `check.mjs` reports the share of
  lit channels down there. A colour built from low values (e.g. 3, 1, 0)
  shifts hue or vanishes on a V5-type part.
- Temporal dithering (`dither: true`) gives in-between levels on average.
  At 60 fps or more a 1-level toggle is not seen as flicker.

Measured PWM frequencies vary by part: original WS2812B 432 Hz,
WS2812B-V5 2074 Hz, SK6812 1155 Hz. Reset times measured as low as 10 µs
on the original. https://github.com/cpldcpu/WS2812Tester/blob/master/docs/findings.md

## Controllers

| Controller | Parallel lanes | Source |
|---|---|---|
| ESP32-S3 | LCD_CAM I80 bus, 8 or 16 bit (16 lanes); 4 RMT TX | ESP-IDF v5.4 soc_caps.h; https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/peripherals/lcd/i80_lcd.html |
| ESP32 | I2S parallel (FastLED: 24 via I2S); 8 RMT | ESP-IDF soc_caps.h; https://github.com/FastLED |
| ESP32-C3 | 2 RMT TX | ESP-IDF soc_caps.h |
| RP2040 | 2 PIO × 4 state machines = 8 | https://datasheets.raspberrypi.com/rp2040/rp2040-datasheet.pdf p.312 |

Libraries:
- FastLED (ESP32-S3: "16 via LCD/I2S").
- hpwit's I2SClocklessLedDriver, up to 16 strips in parallel: https://github.com/hpwit/I2SClocklessLedDriver
- ESP-IDF `led_strip`, one strip per RMT channel.

Lanes are sent at the same time, so the frame time is that of the longest
lane. `CONTROLLERS` in `sim/js/ws2812.js` uses 16 lanes for both the
ESP32-S3 and the ESP32.

## Power

Each channel draws constant current switched by PWM, so the average current
is full-scale current × value/255. Full white is therefore
LEDs × 3 × channel current:

- one hexagon: 331 × 36 mA ≈ 12 A
- one 20x20: 400 × 15 mA ≈ 6 A

USB-C at 5 V gives 3 A (5 A with an e-marked cable and a PD source). A face
must stay within the supply all day, and `check.mjs` proves that. Spread
the power feed across large layouts: each board has VCC/GND on both its
input and output headers.

Not found: whether the PWM cycles of all the LEDs start together after a
latch. If they do, instantaneous current is lumpier than the average, so
keep the boards' bulk capacitors and add one at the feed.

## Model assumptions (the simulator's, not datasheets')

- **Heat:** `check.mjs` warns above 0.25 W/cm² of board, peak. This is a
  rule of thumb for a bare 1.2 mm FR4 board in still air, not a datasheet
  figure.
- **Light (bare, smoke):** the look of the packages, dies, halo and tone
  curve is tuned by eye against the photos in `screen_description/`. It is
  not measured.
- **Opal diffuser:** a physical model with assumed constants.
  - Each LED is treated as Lambertian (WS2812 parts are specified at about
    120° viewing angle). Its light on a sheet `gap` mm above falls off as
    1/(1 + r²/a²)², with a² = gap² + 1² (the sheet's own scatter) + 1² (the
    emitter's size).
  - The sheet passes 60% of the light. Opal acrylic is typically 50–70%;
    ASSUMED.
  - Spots are cut off smoothly at 3a.
  - The diffused light is metered: a full-white area of the brightest board
    shows near white, as an eye adapting to the sheet would see it. The room
    is not metered.
  - What it gives: peak/valley brightness over a fully lit field.

    | gap | 4 mm hex boards | 3 mm square boards |
    |---|---|---|
    | 1 mm | 2.4 | 1.7 |
    | 2 mm | 1.34 | 1.15 |
    | 3 mm | 1.07 | 1.03 |

    So fields look even (within ~10%) from gap ≈ 0.75 × pitch.
- **Unstated current:** the 32x8 strip and the parallelogram (2020 parts)
  are assumed to be 5 mA per channel, like the 20x20 that states it.

## HUB75 panels

The panel (hub64) holds no image. The controller re-sends it continuously:
for each of 32 row pairs it shifts 64 × (panels in the chain) pixels of
6 bits (R1 G1 B1 R2 G2 B2), latches, and lights the pair while shifting the
next. Colour depth comes from binary-coded modulation: each bit plane is
shown for a time proportional to its weight.

What `hub75Budget()` takes from ESP32-HUB75-MatrixPanel-DMA (src/ESP32-HUB75-MatrixPanel-I2S-DMA.cpp and .h, master, read 2026-10-06):
- `PIXEL_COLOR_DEPTH_BITS_DEFAULT 8`, max 12; DMA words are uint16_t.
- A row buffer is `width × colour_depth × sizeof(uint16_t)` bytes per row
  pair, `ROWS_PER_FRAME = height / 2` of them, ×2 if `double_buff`.
  One 64 × 64 panel: 32 KB, 64 KB double-buffered.
- Defaults: `HZ_8M` clock (`HZ_10M` is also 8 MHz; `HZ_16M`, `HZ_20M`
  exist), `min_refresh_rate = 60`, `double_buff = false`, latch blanking 2.
- Refresh: `nsPerRow = depth × nsPerLatch + Σ_{i>t} 2^(i−t−1) × nsPerLatch`,
  with `nsPerLatch` one row's shift time; the library raises the
  "lsbMsbTransitionBit" t until the refresh reaches `min_refresh_rate`.
  Bit planes up to t are each shown once for a full row time, so their
  weights are no longer in proportion: the dim end is distorted below
  2^(t+1)/255.
- CIE1931 lightness correction is applied to every value unless
  `NO_CIE1931` is defined. Designs here write linear light, so define it.
- On an ESP32-S3 with PSRAM the buffer can live in SPIRAM
  (`SPIRAM_DMA_BUFFER`); the library then forces 8 MHz.
- Brightness (`setBrightness8`) shortens the OE pulse; values keep their
  bits.

ASSUMED by the simulator: 0.35 µs to write one pixel into the bit planes
on a 240 MHz ESP32-S3; about 160 KB of internal DMA-capable SRAM free with
Wi-Fi running; 0.1 A idle per panel. Power is modelled at panel level: the
spec's 3 A at full white, times the mean duty. While one row pair is lit
the drivers sink a constant current per column, so the supply sees pulses
at the row rate (about 3–6 kHz); the panel's own capacitors smooth them.

Waveshare's wiki (RGB-Matrix-P2-64x64): 5 V only, 5 V 4 A recommended,
hzeller flags `--led-cols=64 --led-rows=64`, ESP32 via
ESP32-HUB75-MatrixPanel-I2S-DMA. https://www.waveshare.com/wiki/RGB-Matrix-P2-64x64

## ESP32-S3-Matrix

- Waveshare wiki: 8×8 RGB (WS2812B per its FAQ), USB-C, needs ≥ 4.9 V at
  the port; "should not be set too high, it will cause a rapid temperature
  increase, which can result in damage to the board".
  https://www.waveshare.com/wiki/ESP32-S3-Matrix
- Zephyr board DTS: GPIO14, `worldsemi,ws2812-spi` with WS2812C timing,
  `color-mapping` R, G, B, 64 LEDs, 2 MB PSRAM.
  https://github.com/zephyrproject-rtos/zephyr/tree/main/boards/waveshare/esp32s3_matrix
- ESPHome device page: GPIO14, NeoPixelBus type RGB, colour correction
  capped at 40%. https://devices.esphome.io/devices/waveshare-esp32s3-matrix/
- Heat: `check.mjs` adds an ASSUMED 0.4 W for the ESP32-S3 to the board's
  LED power, against the same 0.25 W/cm² rule: about 1.2 W of LEDs.
