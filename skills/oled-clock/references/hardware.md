# Hardware facts, and where each comes from

Everything the simulator assumes is listed here with its source. "Inferred"
or "model" marks what is not stated in a datasheet.

## Sources

| Key | Document |
|---|---|
| S11 | Solomon Systech SSD1306 datasheet Rev 1.1 (Apr 2008), app note Rev 0.4 appended: https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf |
| S15 | SSD1306 Rev 1.5 (Aug 2010): https://image.lceda.cn/attachments/2021/7/b9egL9wDu1EG6txBvHBQXsqA1pkkxjY3Y0iFH26l.pdf |
| SH23 | Sino Wealth SH1106 V2.3: https://www.pololu.com/file/0J1813/SH1106.pdf |
| SH25 | SH1106 V2.5: https://docs.rs-online.com/f079/A700000012854925.pdf |
| S09 | SSD1309 Rev 1.1: https://cdn.shopify.com/s/files/1/0331/9994/7908/files/SSD1309_DATASHEET.pdf |
| UG64 | Univision UG-2864HSWEG01 Rev B, 0.96" 128x64 panel: https://cdn-shop.adafruit.com/datasheets/UG-2864HSWEG01.pdf |
| UG32 | Univision UG-2832HSWEG02 Rev B, 0.91" 128x32 panel: https://cdn-shop.adafruit.com/datasheets/UG-2832HSWEG02.pdf |
| QG | Allvision QG-2864KSWLG01, 1.3" SH1106 panel: https://cdn.sparkfun.com/assets/2/6/8/9/7/1.3inch-SH1106-OLED_Datasheet.pdf |
| WIN | Winstar WEA012864D, 0.96" 4-pin module: http://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/5485/WEA012864DBPP3N00003.pdf |
| ENR | Enrich LM096 0.96" module (clone, dual colour): https://www.micros.com.pl/mediaserver/OLED12864-0.96-W-2_0001.pdf |
| POL | Pololu 3760, 1.3" module drawing: https://www.pololu.com/file/0J1814/graphical-oled-display-128x64-1.3-white-spi-dimensions.pdf |
| VD | Vishay OLED-128O064D: http://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/2250/OLED-128O064D-LPP3N00000_Spec.pdf |

Printed page numbers are used; UG64/UG32 printed p1 is PDF p6.

## Display RAM and addressing (`ssd1306.js`)

- 128x64 bits (SSD1306) or 132x64 (SH1106) in 8 pages of 8 rows. Each byte
  is one column of a page, **D0 the top row**. S11 §8.7 p25; SH23 p14-16.
- 0x20 addressing mode: 00 horizontal, 01 vertical, 10 page (reset), 11
  invalid. S11 p30. Wrap rules S11 §10.1.3 p34-35:
  - page: column +1; at the end it returns to the start; the page does not
    change. Whether "start" is 0 or the 0x21 start in page mode is not
    stated: 0 is assumed.
  - horizontal: column first, then page; both wrap to their window start.
  - vertical: page first, then column.
- SH1106: **page addressing only**, no 0x20/0x21/0x22 (SH23 p31). The column
  counter runs to 131; what happens after is not specified (wrap to 0 assumed).
- **0xA0/0xA1 segment remap affects only data written afterwards**
  (S11 §10.1.8 p36). The emulator stores RAM in SEG order, so changing it
  does not flip what is already shown. 0xC0/0xC8 takes effect at once (S11 p37).
- Start line (0x40-0x7F), offset (0xD3), MUX (0xA8): COM c shows row
  L = (c + offset) mod 64 (C0) or (MUX-1-c + offset) mod 64 (C8), blank if
  L >= MUX; that row shows RAM row (L + start line) mod 64. Derived from S11
  Tables 10-1 and 10-2 p38-39. The C8 + offset case is the same formula
  applied to the reversed scan; the tables were spot-checked, not exhaustively.
- 0xDA COM pins: A4 = 1 alternative (interleaved: even rows from one bank of
  32, odd from the other), A5 = 1 left/right remap. S11 Table 10-3 p40-42.
  SH1106 has A4 only (SH23 p26).
- Panel wiring (UG64 p1-2): the 0.96" glass is wired so that A1 + C8 + DA 12
  shows RAM (0,0) at the top-left with the flex at the bottom. UG32: A8 1F,
  DA 02, A1, C8. The simulator derives each panel's wiring from that init, so
  any other configuration is shown the way that glass would show it (inferred).
- MUX range 16-64 on the SSD1306 (S11 p31), 1-64 on the SH1106 (SH23 p22).
- RAM cannot be read over I2C or SPI on the SSD1306 (S11 §9.1); the SH1106
  can read over I2C (SH23 p11). Drivers therefore keep a frame buffer on the
  MCU, which is what the designs' canvas is.

## Commands (S11 Table 9-1 p28-32, unless noted)

| Cmd | Bytes | Meaning | Reset |
|---|---|---|---|
| 81 | 2 | contrast | 7F (SH1106: 80, SH23) |
| A4/A5 | 1 | follow RAM / all on | A4 |
| A6/A7 | 1 | normal / inverse | A6 |
| AE/AF | 1 | off (sleep) / on | AE |
| 20, 21, 22 | 2, 3, 3 | addressing mode, column window, page window | page; 0-127; 0-7 |
| B0-B7, 00-0F, 10-1F | 1 | page, column low/high (page mode) | |
| 40-7F | 1 | start line | 0 |
| A0/A1, C0/C8 | 1 | segment remap, COM scan direction | A0, C0 |
| A8 | 2 | multiplex ratio N+1 | 3F |
| D3 | 2 | display offset | 0 |
| DA | 2 | COM pins (02, 12, 22, 32) | 12 |
| D5 | 2 | A[3:0] divide D-1, A[7:4] oscillator | 80 (SH1106: 50) |
| D9 | 2 | pre-charge phases 1 and 2, 1-15 each | 22 |
| DB | 2 | VCOMH deselect level | 20 (SH1106: 35) |
| 8D | 2 | charge pump, 14 on / 10 off; before AF. App note, S11 pdf p62 | 10 |
| AD | 2 | SH1106 DC-DC, 8B on / 8A off (SH23 p22) | 8B |
| 26/27 | 7 | right/left scroll setup | |
| 29/2A, A3 | 6, 3 | vertical scroll: parsed, **not simulated** | |
| 2E/2F | 1 | stop / start scroll | |
| 23, D6 | 2 | fade/blink, zoom: **Rev 1.2 and later only** (S15), parsed, not simulated | |

The Univision init sequences use DB 40, a value not in Solomon's table.

## Refresh rate (`OLED.frameRate`)

- Ffrm = Fosc / (D x K x MUX), K = phase1 + phase2 + 50 (S11 §8.3 p22, §8.6 p24).
- SSD1306 Fosc 333 / 370 / 407 kHz min/typ/max at the default setting
  (S11 Table 13-1 p49). Per setting, read off S15 Fig 10-7 p43 (about
  +-5 kHz reading error):

  | D5 A[7:4] | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | A | B | C | D | E | F |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | kHz | 270 | 280 | 290 | 300 | 316 | 326 | 338 | 352 | 370 | 390 | 408 | 430 | 450 | 477 | 505 | 535 |

- With the standard init (D5 80, D9 F1) a 128x64 refreshes at **87.6 Hz**
  typ (78.8-96.4 over Fosc's range); 128x32 at 175.2 Hz. With D9 22: 107 / 214 Hz.
- SH1106: Fosc 315 / 360 / 420 kHz, about 104 Hz at reset (SH23 p36); A[7:4]
  steps 5% from -25% to +50% (SH23 p25).
- There is no frame sync on the 4-pin modules, so writes are never aligned
  with the scan. The tearing model assumes rows are scanned in row-counter
  order, evenly spread over the frame (model).

## Brightness

- Segment current ISEG = contrast/256 x IREF x 8, about 100 µA at FF with
  IREF 12.5 µA; measured 25 / 69 / 100 µA at 3F / AF / FF (S11 §8.8 p26,
  Table 12-1 p48). Linear.
- That luminance is proportional to current is an assumption. The simulator
  never goes fully dark at 00h; that is unverified.
- SH1106: ISEG x16, IREF 12.5 µA (SH23) or 18.75 µA (SH25): versions differ.
- Pixel rise/fall 10 µs typ (WIN p13, VD p8). One row time is ~146 µs. So
  the glass switches effectively instantly: no lag model is needed.

## Buses

- I2C: 400 kHz max (S11 Table 13-6 p54; SH23 p43). Address 0x3C or 0x3D
  (SA0 on D/C#). Control byte Co D/C# 000000: 0x00 commands, 0x40 data
  (S11 p20). Cost model: 9 clocks a byte, START+STOP as 2 clocks, 31 data
  bytes per transaction (Adafruit_SSD1306 on AVR). MCU overhead is not counted.
- SPI 4-wire: SSD1306 10 MHz (S11 Table 13-4 p52); SH1106 4 MHz at 2.4-3.5 V
  (SH23 p41).
- 1 MHz I2C is out of specification; it is offered because it often works.

## Scrolling

- Interval codes 000-111 = 5, 64, 128, 256, 3, 4, 25, 2 frames (S11 p28-29).
  The SSD1309's differ (S09 p28).
- Right scroll moves column 127 to 0, one column per step, wrapping (S11
  Fig 10-7/10-8 p44). Direction on the glass assumes the standard init.
- After 2F, RAM writes and scroll parameter changes are prohibited; send 2E
  first or RAM may be corrupted (S11 §10.2.4 p46, p44-45). After 2E "the
  RAM data needs to be rewritten" (S11 p29): what the RAM holds then is not
  stated. The player rewrites it in full.

## Modules (`modules.js`)

| | Glass W x H | Active area | Pitch / dot | Active area position | Source |
|---|---|---|---|---|---|
| 0.96" 128x64 | 26.70 x 19.26 | 21.744 x 10.864 | 0.17 / 0.154 | 2.478 from each side, 2.1 from the top edge | UG64 p1-2 |
| 0.91" 128x32 | 30.0 x 11.50 | 22.384 x 5.584 | 0.175 / 0.159 | 2.1 from the far end and from the top | UG32 p1-2 |
| 1.3" 128x64 SH1106 | 34.5 x 23.0 | 29.42 x 14.70 | 0.23 / 0.21 | 2.54 each side, 2.1 top | QG p2-3 |

- 0.96" dot size: 0.154 (Univision, Enrich) vs 0.148 (Raystar, Winstar,
  Vishay). 0.154 is used.
- 0.96" board (WIN p7): 27.3 x 27.3, 4 holes 2.5 dia at 3.3 from the sides
  and 2.05 from top and bottom, glass 0.3 from the left and 4.02 below the
  top, 4-pin header centred 1.65 from the top. **Pin order differs**: Winstar
  VCC GND SCL SDA; most clones GND VCC SCL SDA (ENR). Check your board.
- 0.91" board: no primary drawing found. The 38 x 12 board with the header at
  the left end is approximate.
- 1.3" SH1106: RAM columns **2-129** are visible (QG §1.3; also u8g2, Adafruit
  SH110X, luma.oled use offset 2). Board from POL (35.4 x 33.5, holes 3.05 at
  2.5 from the edges) is the SPI version; the 4-pin I2C board is unverified.
- 2.42" modules use the SSD1309 (Raystar REX012864H): not modelled.
- SPI boards: the 0.96" and 1.3" modules also come as 7-pin SPI boards
  (GND VCC D0 D1 RES DC CS: D0 is the clock, D1 the data). The simulator
  draws one whenever a design runs on an SPI bus. Its header position is
  taken from typical photos, not from a drawing. The 0.91" 128x32 boards are
  I2C only.

### Dual colour 0.96"

The top 16 rows are yellow, the lower 48 blue, with **two pixel pitches of
glass left out** between them: yellow 2.704 mm, gap 0.356, blue 8.144 (ENR
p5; Raystar REX012864M/AB and Midas agree). All 64 COMs are driven, so RAM
rows 0-15 are the yellow band under the standard init (inferred from the
wiring). Rolling the picture with the start line moves content between colours.

### Colours (CIE 1931 x, y)

White (0.32, 0.33) UG64; blue (0.16, 0.26) ENR; yellow (0.47, 0.50) VD;
green (0.29, 0.66). No datasheet gives a peak wavelength. The renderer's
colours are chosen by eye to resemble photos.

## Lifetime and burn-in

| Part | Brightness cd/m² | Life to 50% brightness | Source |
|---|---|---|---|
| UG-2864HSWEG01 | 70-90 (internal charge pump) | >= 10,000 h at 100 cd/m² | UG64 p8, p16 |
| UG-2832HSWEG02 | 120-150 | 10,000 h at 120 | UG32 p6-7 |
| QG 1.3" | | 10k h at 120, 30k h at 80, 50k h at 60 | QG p6-7 |
| Winstar 0.96" blue | 50-70 | 20,000 h | WIN p13-14 |

- A fixed pattern "may remain as an after image or slight contrast
  deviation" (UG64 §8.5 p25, UG32 p21). Screen savers are recommended (VD p22).
- QG's figures show life rising steeply as brightness falls: dimming at
  night with 0x81 is the cheapest burn-in protection there is.
- `check.mjs` converts the hottest pixel's daily lit time into years to 50%
  using the 10,000 h figure. That is an order-of-magnitude estimate: the
  rating is for a checkerboard at a stated brightness, not for one pixel.
