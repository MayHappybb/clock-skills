# Hardware notes: Air101-LCD (ST7735S 160x80) on LuatOS ESP32C3-CORE

Compiled 2026-10-10. Confidence marks:

- **[V]** verified: read directly in the cited source (code, schematic/netlist, datasheet). Not tested on hardware.
- **[I]** inferred: derived/calculated from verified facts, reasoning stated.
- **[U]** unverified: not found or conflicting; treat as an assumption.

Source tags (e.g. `[DS11 p151]`) resolve to URLs in the **References** section at the end. ST7735S page numbers are the printed "Page N of 193" numbers of V1.1 (PDF page = printed + 8).

---

## Quick reference (for the simulator)

| Item | Value | Conf. |
|---|---|---|
| Visible resolution | 160 x 80, landscape | [V] |
| Controller RAM | 132 x 162 (GM=00) | [V] |
| Window offset, landscape | either (x=0, y=24) or (x=1, y=26) depending on panel batch | [I] |
| Window offset, portrait | either (x=24, y=0) or (x=26, y=1) | [I] |
| Colour order | BGR (MADCTL bit3 = 1) per all LuatOS drivers | [V] / see A2 |
| Inversion (INVON 0x21) | batch-dependent; sources split. Make it a toggle | [U] |
| Pixel format | RGB565, COLMOD 0x05/0x55, high byte first | [V] |
| SPI clock (datasheet) | write >= 66 ns cycle -> 15.15 MHz max | [V] |
| SPI clock (used in practice) | 20 MHz (LuatOS demo), 40 MHz (LuatOS turnkey, Grrtzm, cnblogs) | [V] |
| Frame rate | ~60 Hz with LuatOS tables / reset defaults; ~80 Hz with Adafruit 01/2C/2D | [I] |
| Dot pitch | 0.135 (H) x 0.1356 (V) mm, active area 10.8 x 21.7 mm | [V] |
| Sub-pixels | RGB vertical stripe, stripes run along the 160-pixel axis | [V]/[I] |
| Keys | 5-way: GPIO4 (centre), 5, 8, 9, 13; active-low, need internal pull-ups | [V] |
| TE pin | not brought out | [V] |
| CPU | RV32IMC 160 MHz, no FPU; float add ~100 cycles, cosf ~2400 cycles | [V] |

---

## A. Air101-LCD board

### A1. Header pinout, keys, mapping onto ESP32C3-CORE

The board is "含一个0.96寸屏幕和5向按键" (0.96" screen + 5-way key) and plugs pin-to-pin onto Luat CORE boards [W-LCD] [V]. Pinout below is from the official KiCad netlist [LCD-ZIP], cross-checked with the schematic image [LCD-SCH] [V]. The CORE-side pin number and GPIO come from the CORE pin table [W-CORE §三] [V]; the pad-to-pin overlay rule (left column J(n) sits on core pin 33-n, right column J(16+k) on core pin k) is [I], but it makes every power/GND pad land on a matching CORE pin, every CORE 5V pin land on an NC pad, and reproduces the Grrtzm display pins exactly.

| LCD pad | Net | CORE pin | ESP32-C3 | Conf. |
|---|---|---|---|---|
| J1 | GND | 32 | GND | [V] net / [I] overlay |
| J2 | NC | 31 | 5V | [V]/[I] |
| J3 | LKEY | 30 | GPIO9 (BOOT, strapping) | [V]/[I] |
| J4 | UPKEY | 29 | GPIO8 (strapping) | [V]/[I] |
| J5 | CENTER | 28 | GPIO4 | [V]/[I] |
| J6 | DWKEY | 27 | GPIO5 | [V]/[I] |
| J7, J8 | NC | 26, 25 | 3.3V, GND | [V]/[I] |
| J9 | LCD_BL | 24 | GPIO11 | [V] |
| J10 | LCD_CS | 23 | GPIO7 | [V] |
| J11 | LCD_DC | 22 | GPIO6 | [V] |
| J12 | LCD_RES | 21 | GPIO10 | [V] |
| J13 | LCD_SDA | 20 | GPIO3 | [V] |
| J14 | LCD_SCK | 19 | GPIO2 | [V] |
| J15 | +3.3VA | 18 | 3.3V | [V]/[I] |
| J16, J17, J23 | GND | 17, 1, 7 | GND | [V]/[I] |
| J26 | RKEY | 10 | GPIO13 (also CORE LED D5) | [V]/[I] |
| J18-22, J24-25, J27-32 | NC | - | - | [V] |

Display pins confirmed in Grrtzm `main/main.c` lines 17-22: MOSI 3, CLK 2, CS 7, DC 6, RST 10, BCKL 11 [GRR] [V]. Official LuatOS ESP32C3 board table: `spi = 2, spiCS = 7, spiSpeed = 40*1000*1000, lcdDC = 6, lcdRST = 10, lcdBL = 11, keyL = 13, keyR = 8, keyU = 5, keyD = 9, keyO = 4` [LUA-DEV lines 37-50] [V].

Keys:

- Five keys on GPIO {4, 5, 8, 9, 13}; GPIO4 is centre in every source [LUA-DEV] [LCD-ZIP] [JIU] [V].
- Key common (K1 pad 5) goes to GND; no pull-up resistors on the PCB, so use `GPIO_PULLUP_ONLY`. LuatOS reads "pressed" as level 0 [LCD-ZIP] [LUA-DEV key.lua lines 24-28] [V].
- Direction names conflict [U]. Netlist names: L=9, U=8, D=5, R=13. LuatOS names: L=13, R=8, U=5, D=9. jiujue `buttonKeys.py` lines 21-25: right=8, down=9, centre=4, up=5, left=18 (GPIO18 is an NC pad, so left=18 is very likely a bug) [JIU] [V]. LuatOS names are the most-used set; confirm on hardware.
- GPIO8 and GPIO9 are strapping pins ("GPIO2, GPIO8 and GPIO9 are strapping pins") [IDF-GPIO] [V]. Holding those keys during reset can enter download mode [I].
- GPIO13 also drives CORE LED D5 (active-high, 1 k to GND) [W-CORE] [V]. The LED loads the internal pull-up; a pressed/released read should still work but has not been tested [I].

TE: the 13-pin FPC footprint `ST7735S-0.96TFT-13P` (J33) is wired pad 1, 2, 9 = no net; 3 SDA, 4 SCK, 5 DC, 6 RES, 7 CS; 8, 13 GND; 10, 12 +3.3VA; 11 to Q1 collector [LCD-ZIP] [V]. **No TE pin is brought out.** Typical 0.96" panel FPCs have pads 1/2 = TP0/TP1 or NC and 9 = NC, so the panel itself does not expose TE either [P-WV p6] [P-LH p5] [V for those panels, I for this one].

Backlight: low-side MMBT5551 NPN on FPC pad 11 (LED-K), 10 ohm emitter resistor (R1), base via 1 k (R3) from LCD_BL, 10 k pull-up to 3.3 V (R2), 100 nF (C1) [LCD-ZIP] [V]. So BL is active-high and the backlight is on when the pin floats [I]. PWM dimming via LEDC works through the transistor [I].

**GPIO11 caveat**: "GPIO11默认为SPI flash的VDD引脚，需要配置后才能作为GPIO使用" (GPIO11 is the flash VDD pin by default; it must be configured before use as GPIO) [W-CORE] [V]. Fix: `espefuse.py burn_efuse VDD_SPI_AS_GPIO 1`, which is one-time and irreversible [ESPEFUSE] [V]. The wiki says this is safe on this board because flash is powered from 3.3 V directly [W-CORE] [V]. Without the burn, BL floats and the pull-up keeps the backlight on [I].

PCB: KiCad Edge.Cuts gives 21 x 51 mm with 0.5 mm corner radius, same as the CORE board's "21mm*51mm"; four M2 (2.2 mm) holes; "Air101-LCD"/"LuatOS" on the B.Mask layer [LCD-ZIP] [W-CORE] [V]. Two 16-pad columns at 2.54 mm pitch, 17.78 mm apart [LCD-ZIP] [V]. Solder mask colour purple, judged from the wiki photo `peripherals/lcd_air10x/lcd_air101_image.png` [W-LCD] [I].

### A2. Init parameters

#### LuatOS driver framework [LUA-LCD] [V]

- Table encoding (`luat_lcd.c` lines 16-64): `0x02xx` = command, `0x03xx` = data byte, `0x01xx` = delay in ms.
- Sequence (`luat_lcd.c` lines 160-216): RST low, wait 100 ms, RST high, wait 120 ms; SLPOUT 0x11, wait 120 ms; driver init table; MADCTL 0x36 with the direction value; 0x11 again, wait 100 ms; clear to black; DISPON 0x29.
- xoffset/yoffset are added directly into CASET/RASET (`luat_lcd.c` lines 351-355). They are not swapped per direction, so you pass the right pair for the direction you chose.
- Direction index mapping in code: 0 -> `direction0`, 1 -> `direction90`, 2 -> `direction180`, 3 -> `direction270` (`luat_lcd.c` lines 366-372). The `lcd.init` doc instead says "direction 0:0° 1:180° 2:270° 3:90°" (`luat_lib_lcd.c` line 107), so the doc and code disagree.

`st7735s` table (`luat_lcd_st7735s.c` lines 7-22) [V]:

```
B1 05 3C 3C            ; FRMCTR1 normal: RTNA=5, FPA=60, BPA=60
B2 05 3C 3C            ; FRMCTR2 idle
B3 05 3C 3C 05 3C 3C   ; FRMCTR3 partial
B4 03                  ; INVCTR
C0 AB 0B 04            ; PWCTR1
C1 C5                  ; PWCTR2
C2 0D 00               ; PWCTR3
C3 8D 6A               ; PWCTR4
C4 8D EE               ; PWCTR5
C5 0F                  ; VMCTR1
E0 07 0E 08 07 10 07 02 07 09 0F 25 36 00 08 04 10   ; GMCTRP1
E1 0A 0D 08 07 0F 07 02 07 09 0F 25 35 00 09 04 10   ; GMCTRN1
FC 80
3A 05                  ; COLMOD 16-bit
direction0=0x08  direction90=0xC8  direction180=0x78  direction270=0xA8
```

`st7735v` table (`luat_lcd_st7735v.c`) [V]: same structure, with these differences:

```
B1/B2 05 3A 3A, B3 05 3A 3A 05 3A 3A   ; RTNA=5, FPA=BPA=58 (= ST7735S reset default)
B4 03
C0 62 02 04 | C1 C0 | C2 0D 00 | C3 8D 6A | C4 8D EE | C5 0E
E0 10 0E 02 03 0E 07 02 07 0A 12 27 37 00 0D 0E 10
E1 10 0E 03 03 0F 06 02 08 0A 13 26 36 00 0D 0E 10
3A 05                                  ; no FC
direction0=0xC8  direction90=0x78  direction180=0x08  direction270=0xA8
```

MADCTL decode [I, from DS11 p134 bit definitions]:

- 0x08 = BGR, portrait
- 0xC8 = MY|MX|BGR, portrait rotated 180°
- 0x78 = MX|MV|ML|BGR, landscape
- 0xA8 = MY|MV|BGR, landscape rotated 180°

Every st7735s/st7735v value has bit 3 set, so **LuatOS treats this panel as BGR** [V]. (The 1.8" `st7735` driver uses 0xC0/0x70/0x00/0xA0 with `rb_swap = 1`, a different panel [V].)

INVON history: before refactor commit `25ac363a` (2023-11-13), both drivers sent 0x21 right after SLPOUT (`luat_lcd_st7735v.c` line 39, st7735s line 116 "0x21 //Display inversion" at commit 8fa26820) [LUA-OLD] [V]. Current tables send no 0x21; call `lcd.invon()` if needed [V].

#### Official LuatOS `lcd.init` calls for ESP32C3

| Source | Driver | direction (MADCTL) | w x h | xoff, yoff | SPI | Inversion |
|---|---|---|---|---|---|---|
| `demo/lcd/main.lua` line 84 (2024) [LUA-DEMO] | st7735v | 1 (0x78) | 160x80 | 0, 24 | 20 MHz, mode 0 (line 74) | none sent [V] |
| same file line 94, "old boards" [LUA-DEMO] | st7735s | 2 (0x78) | 160x80 | 0, 0 | 20 MHz | none sent [V] |
| `lcd.init` doc example (`luat_lib_lcd.c` line 114) [LUA-LCD] | st7735s | 2 (0x78) | 160x80 | 1, 26 | - | - [V] |
| turnkey `lcd-0.96-lvgl/main.lua` lines 10-12 (2022) [LUA-DEV] | st7735v | 2 (0x08) | 80x160 | 24, 0 | 40 MHz | driver sent INVON, then `lcd.invoff()`, so net off [V]/[I] |

Exact strings [V]:

```lua
-- demo/lcd/main.lua (ESP32C3: spi_id, rst, dc, cs, bl = 2,10,6,7,11, line 58)
spi_lcd = spi.deviceSetup(spi_id,pin_cs,0,0,8,20*1000*1000,spi.MSB,1,0)
lcd.init("st7735v",{port=port,pin_dc=pin_dc,pin_pwr=bl,pin_rst=pin_reset,direction=1,w=160,h=80,xoffset=0,yoffset=24},spi_lcd)
-- turnkey
spi.deviceSetup(device.spi,device.spiCS,0,0,8,device.spiSpeed,spi.MSB,1,1)
lcd.init("st7735v",{port="device",...,direction=2,w=80,h=160,xoffset=24,yoffset=0},spi_lcd)
lcd.invoff()
```

`spi.deviceSetup` argument order: id, cs, CPHA, CPOL, data width, baud, bit order, master, mode (0 = half-duplex) (`luat_lib_spi.c` line 633) [V].

Air32F103 official C demo `SPI_Air10x_LCD` for the same board: `LCD_OFFSET_X 0`, `LCD_OFFSET_Y 24`, `0x20 //lcd_inv_off如果颜色错了就用0x21` ("inversion off; use 0x21 if the colours are wrong"), MADCTL 0x78 [AIR32 st7735v.h lines 16-21, st7735v.c lines 136, 222] [V].

#### Other (non-Luat) sources

- **Grrtzm (ESP-IDF)** [GRR lines 25, 30-31, 96-105] [V]: SPI2 at 40 MHz, mode 0. Uses ESP-IDF's built-in **ST7789** driver (`esp_lcd_new_panel_st7789`): RGB element order, `invert_color(true)`, `mirror(true,false)`, `swap_xy(true)`, `set_gap(1, 26)`, 160x80. Resulting MADCTL 0x60 (MX|MV, RGB) [I, from IDF-ST7789]. Comments on lines 96/141 say colours come out "RBG", consistent with an RGB/BGR mismatch and/or un-swapped RGB565 bytes [I]. README is partly stale (`set-target esp32`, ST7789V repo link) [V].
- **jiujue (MicroPython)** [JIU boot.py] [V]: `SoftSPI(baudrate=2400000, polarity=1, phase=0, sck=2, mosi=3, miso=10)`, comment "使用SoftSPI，SPI不行" (SoftSPI works, hardware SPI didn't). `initr()` with offset (0,0) on a 128x160 canvas, INVOFF, `rgb(True)` (bit3=0) with R/B swapped in software, so effectively BGR [I].
- **bododo `ST7735.py`** (used by the cnblogs post) [BODO] [V]: `REDTAB80x160` start col 24, row 0; `rotation(1)` gives landscape (0,24), MADCTL 0x60|0x08 = 0x68; INVOFF; BGR default (`_rgb = False`).
- **cnblogs Ansel09** [CNB] [V]: `SPI(1, baudrate=40000000, polarity=0, phase=0, sck=2, mosi=3)`. Reports `tft.fill(TFT.WHITE)` "实际显示为黑色" (actually shows black), and the image converter inverts RGB. So that unit needed inversion.
- **Waveshare 0.96" (same panel type, different board)** [WS-096] [V]: display starts "from the second pixel in the horizontal direction, and the 27th pixel in the vertical direction" in native orientation, i.e. (1, 26) landscape.
- **Adafruit `INITR_MINI160x80`** [ADA lines 241-254] [V]: colstart 24, rowstart 0, MADCTL RGB variant. `INITR_MINI160x80_PLUGIN`: colstart 26, rowstart 1, INVON, BGR.

#### Synthesis: offsets, inversion, colour order

- **Two offset families exist** [I]. Landscape is MV=1, where the X axis is RAM rows:
  - Family 1, "24/0": landscape x=0, y=24; portrait x=24, y=0. Used by LuatOS st7735v (current demo), Air32 demo, bododo REDTAB, Adafruit MINI160x80.
  - Family 2, "26/1": landscape x=1, y=26; portrait x=26, y=1. Used by the LuatOS st7735s doc example, Grrtzm, Waveshare, Adafruit PLUGIN.
  - Family 2 centres 80 of 132 columns ((132-80)/2 = 26) and 160 of 162 rows; Family 1 corresponds to the 128x160 window used in GM=11 builds of the glass [I].
  - MX/MY mirroring may need a different offset in principle. ST7735S MX maps column c to 131-c, so a 26-wide gap stays 26 (symmetric) while a 24-wide gap becomes 28 [I, from DS11 §9.11.3 p68]. LuatOS ignores this and uses fixed offsets per call [V], so treat 180° rotation offsets as **unverified on hardware** [U].
- **Inversion: batch-dependent** [U]. Off in LuatOS turnkey (net), Air32, jiujue, bododo. On in Grrtzm, the cnblogs unit, and pre-2023 LuatOS drivers. LuatOS's "old board -> st7735s" comment suggests panel revisions [I]. IPS 0.96" glass commonly needs INVON for correct colours [U]. Practical test: fill 0xFFFF; if it shows black, toggle 0x20/0x21.
- **Colour order: BGR** (MADCTL bit3=1) in every LuatOS driver, Air32, bododo and jiujue (effective) [V]. Grrtzm uses RGB and reports wrong colours [V].
- **Recommended starting config for ESP-IDF** [I]: MADCTL 0x78 (or 0x68 without ML), 160x80, CASET/RASET offset (0, 24) with (1, 26) as fallback, COLMOD 0x05, INVOFF/INVON as a runtime option, SPI mode 0. For the simulator, model offset family and inversion as switches.

### A3. Panel physical data (typical 0.96" 160x80 IPS ST7735S, 13-pin FPC)

The Luat docs do not name the panel part number [U]. The values below come from datasheets of 13-pin ST7735S 0.96" IPS modules with the same FPC pinout as the Air101-LCD J33 footprint (SDA/SCL/RS/RES/CS/GND/NC/VDD/LEDK/LEDA/GND) [P-WV p6] [P-LH p5] [V]. Applying them to the Air101-LCD panel is [I].

| Parameter | Wisevision N096-1608TBBIG11-H13 [P-WV] | LH096T-IG01 (Waveshare) [P-LH] | EastRising ER-TFT0.96-1 [P-ER] | DFRobot DFR0847 [P-DFR] |
|---|---|---|---|---|
| Resolution | 80(H)RGB x 160(V) | 80(H)RGB x 160(V) | 80 x RGB x 160 | 160x80 |
| Display mode | Normally black | Normally black | IPS | IPS |
| Dot pitch (mm) | 0.135(H) x 0.1356(V) | 0.135 x 0.1356 | 0.135 x 0.174 (table, likely a typo) | - |
| Active area (mm) | 10.8 x 21.7 | 10.8 x 21.7 | 10.80 x 21.70 (drawing; table says 27.95, a typo) | 10.8 x 21.7 |
| Visual area (mm) | - | - | 12.00 x 22.90 | - |
| Polarizer (mm) | 12.8 x 23.6 | - | 13.20 x 23.70 | - |
| Outline (mm) | 13.5 x 27.95 x 1.5 | 13.5 x 27.95 x 1.5 max | 13.5 x 27.95 x 1.5 | module 13.5 x 34 |
| Colour arrangement | RGB vertical stripe | RGB vertical stripe | "RGB" | - |
| Luminance (cd/m²) | 400 typ (350 min) | 300 typ (250 min) | 300 typ | 250 typ |
| Contrast ratio | 800 min | 800 min | 500 typ | - |
| Response time Tr+Tf | 30 typ / 40 max ms | 30 / 40 ms | 20 ms typ | - |
| Viewing angle | 80/80/80/80° | 80/80/80/80° | 85/85/85/85° | 60/60/60/60° |
| Backlight | 1 white LED, 15-20 mA, VbL 2.9-3.1 V | 1 white LED, 15-20 mA, 2.8-3.0 V | 1 chip, 18 mA typ, Vf 3.1-3.3 V (drawing: VF 3.2 V, IF 15 mA) | 15 mA module |
| CIE white (x, y) | 0.306, 0.327 | 0.306, 0.327 | - | - |
| CIE R / G / B (x, y) | 0.610,0.333 / 0.281,0.533 / 0.146,0.138 | same | - | - |
| Transmittance | 5.09 % | 5.09 % | - | - |
| Weight | 1.1 g | 1.1 g | - | - |

All values in the table are [V] for the named module (pages: P-WV p4, p7, p8; P-LH p3, p6, p7; P-ER p5-p6). Waveshare's wiki for its board gives pixel pitch 0.1356 x 0.135 mm, AA 21.7 x 10.8 mm [WS-096] [V].

Derived geometry for the simulator [I]:

- Pixel 0.135 x 0.1356 mm; sub-pixel about 0.045 x 0.1356 mm. R, G, B sit side by side along the 80-pixel axis, and the stripes run along the 160-pixel axis. In landscape (160 wide), each pixel is three horizontal bands stacked vertically. The controller agrees: source outputs S1..S396 run along the 132 (short) axis [B6].
- Black border between active and visual area: (12.0-10.8)/2 = 0.6 mm per side on the short axis, (22.9-21.7)/2 = 0.6 mm on the long axis [P-ER] [I].
- Active area within the outline: (13.5-10.8)/2 = 1.35 mm per side on the short axis. On the long axis, 27.95-21.7 = 6.25 mm total; the drawings mark 1.7 mm on one end, which leaves about 4.55 mm on the FPC end [P-WV p5] [P-ER p6] [I].
- Gaps: no gamma curve, white point under backlight, or PWM response data for this exact panel [U].

---

## B. ST7735S datasheet (Sitronix V1.1, 2011-11; checked against V1.4, 2014-10)

V1.4's revision history lists only ID1, command 0xFC, bump-height and chip-thickness changes, and the values below match V1.1 wherever checked [DS14] [V]. Note: displayfuture `ST7735S.pdf` actually serves the older ST7735 (no S) V1.9 datasheet, which has a different formula; don't use it [V].

### B4. Serial interface timing [DS11 §8.4 p28, Table 7 (4-line); §8.3 p27 (3-line)] [V]

| Symbol | Meaning | Value |
|---|---|---|
| TSCYCW | serial clock cycle, write | min 66 ns, so **max write SCL = 15.15 MHz** [I: 1/66 ns] |
| TSHW / TSLW | SCL high/low, write | min 15 / 15 ns |
| TSCYCR | serial clock cycle, read | min 150 ns, so **max read SCL = 6.67 MHz** [I] |
| TSHR / TSLR | SCL high/low, read | min 60 / 60 ns |
| TSDS / TSDH | data setup/hold | 10 / 10 ns |
| TACC / TOH | read access / output hold | 10-50 / 15-50 ns |
| TCSS / TCSH | CS setup/hold, write (4-line) | 45 / 45 ns (15/15 on 3-line) |
| TCHW | CS high width | min 40 ns |
| TDCS / TDCH | D/CX setup/hold | 10 / 10 ns |

Conditions: Tr/Tf <= 15 ns, VDDI 1.65-3.7 V, VDD 2.5-4.8 V [V]. Luat and community demos run at 20-40 MHz, which is 1.3-2.6x over the datasheet write spec, and they report it working [V for the demo settings, I that it's reliable].

### B5. Frame rate [DS11 §10.2.1-10.2.3 p151-153] [V]

- Normal mode (FRMCTR1 0xB1): `Frame rate = fosc / ((RTNA x 2 + 40) x (LINE + FPA + BPA + 2))`, **fosc = 850 kHz**, FPA > 0, BPA > 0 [V].
  - RTNA is 4 bits (parameter 1); FPA and BPA are 6 bits each (parameters 2, 3) [V].
  - FRMCTR2 (0xB2, idle) and FRMCTR3 (0xB3, partial; 6 params: dot-inversion set, then column-inversion set) use the same formula [V].
- Reset defaults, identical after power-on, SW and HW reset [V]:

  | GM | Resolution | RTNA / FPA / BPA |
  |---|---|---|
  | 00 | 132x162 | 05h / 3Ah / 3Ah |
  | 01 | 132x132 | 08h / 3Bh / 3Bh |
  | 11 | 128x160 | 05h / 3Ch / 3Ch |

- LINE is never defined in V1.1 or V1.4 [V absent]. Taking LINE as the gate-line count of the GM mode (162/132/160) makes every reset default land on about 60 Hz, which supports that reading [I].

Computed rates [I]:

| Setting | Clocks per line | Calculation | Frame rate |
|---|---|---|---|
| Reset default GM=00 (05/3A/3A) | 50 | 850000 / (50 x (162+58+58+2)) | **60.71 Hz** (61.15 at LINE=160) |
| LuatOS st7735v (05/3A/3A) | 50 | same as above | **60.71 Hz** |
| LuatOS st7735s (05/3C/3C) | 50 | 850000 / (50 x (162+60+60+2)) | **59.86 Hz** (60.28 at LINE=160) |
| Adafruit (01/2C/2D) | 42 | 850000 / (42 x (162+44+45+2)) | **79.99 Hz** (80.63 at LINE=160) |
| Grrtzm (ST7789 driver, never writes B1) | - | reset default | about 60.7 Hz |

The Adafruit values are the ST7735**R** reset default: R formula `fosc/((RTNA x 2 + 40) x (LINE + FPA + BPA))` with fosc = 625 kHz gives 59.76 Hz at LINE=160 [DSR §10.2.1 p126] [V formula, I result]. On an S part the same bytes give about 80 Hz [I].

Line time at RTNA=5: 50 / 850 kHz = 58.8 us; frame period about 16.5 ms [I]. fosc tolerance isn't given in the extracted text, so expect a few % spread [U].

### B6. Outputs, scan direction, stripe direction

- "396 source line and 162 gate line driving circuits"; source = 132 RGB channels, gate = 162 channels; RAM "132 (H) x RGB x 162 (V)" [DS11 §1-2 p2] [V]. Pins S1-S396 and G1-G162 [DS11 §6.4 p18] [V].
- GM modes [DS11 §6.3 p17] [V]:
  - GM=00: 132RGB x 162 (S1-S396, G1-G162)
  - GM=01: 132RGB x 132 (G1-G132)
  - GM=11: 128RGB x 160 (S7-S390, G2-G161)
- SRGB=0 gives source order S1/S2/S3 = R/G/B. The SMX/SMY pins reverse source/gate scan [DS11 p17] [V].
- Gate outputs map to row addresses RA 0-161; S1..S396 carry R0 G0 B0 R1 G1 B1 ... along each row [DS11 §9.9.5 p62; MADCTL figure p135] [V].
- So each gate line drives one 132-pixel row, gates step along the 162 axis, and the RGB sub-pixels sit side by side along the 132 axis. **The colour stripes run parallel to the 162 (long) axis** [I]. This matches the panel datasheets' "80(H)RGB x 160(V), RGB vertical stripe" [P-WV p4] [V].
- The refresh scans gate lines one by one along the long axis: in landscape, the "scanline" is a **vertical column** of 80 pixels sweeping horizontally across the 160-pixel width [I]. Direction is set by ML (and SMY) [B8].

### B7. RGB565 to 18-bit, and COLMOD

- 16-bit input is expanded through a programmable LUT, not a fixed bit copy [DS11 §9.18.1 p86-89; §10.1.23 RGBSET p125] [V].
  - RGBSET (2Dh) takes 128 bytes: 32 for R, 64 for G, 32 for B; each entry is the 6-bit frame-memory value for that input code.
  - "128-Bytes must be written to the LUT regardless of the color mode"; 4K and 65K inputs "are transferred 6(R)-6(G)-6(B) through RGB LUT table" [V].
  - LUT contents are "Random" at power-on/HW reset and unchanged by SW reset [DS11 p125, p83] [V].
- No default "copy MSB to LSB" mapping is documented [V absent]. Real chips render correctly without RGBSET in every demo above, so some sane default mapping evidently exists [I]; its exact form (MSB replication vs. 2x) is [U]. For the simulator, `r6 = (r5 << 1) | (r5 >> 4)` is a reasonable model [I].
- COLMOD (3Ah) IFPF[2:0] [DS11 §10.1.33 p142] [V]:
  - 011 = 12-bit/pixel (0x03)
  - 101 = 16-bit (0x05)
  - 110 = 18-bit (0x06)
  - 111 = not used
  - Default 0110 (18-bit) at power-on/HW reset, unchanged by SW reset.
  - Note: use 55h for 16-bit writes and 66h for reading pixel data.
- 16-bit wire format: "2-times transfer", first byte R4 R3 R2 R1 R0 G5 G4 G3, then G2 G1 G0 B4..B0, MSB first [DS11 §9.8.3 p45] [V]. So the RGB565 word goes **high byte first** (big-endian). ESP32 is little-endian, so swap bytes in the framebuffer or use LVGL's swap option [I].
- With BGR=1, the panel shows the first 5-bit field as blue: either keep BGR=1 and pack B in the high field, or swap in software [I].

### B8. MADCTL (36h) and TE [DS11 §10.1.29 p134-136; §10.1.28 p132; §9.12 p73-74] [V]

| Bit | Name | Effect |
|---|---|---|
| D7 | MY | row address order (MCU-to-memory) |
| D6 | MX | column address order (MCU-to-memory) |
| D5 | MV | row/column exchange (MCU-to-memory) |
| D4 | ML | LCD vertical refresh: 0 = top to bottom, 1 = bottom to top |
| D3 | RGB | 0 = RGB, 1 = BGR colour filter order |
| D2 | MH | LCD horizontal refresh: 0 = left to right, 1 = right to left |

- MY/MX/MV "controls MCU to memory write/read direction" only; e.g. MY=1 maps row r to 161-r [DS11 §9.11.3 p68] [V]. **The panel refresh order is set only by ML/MH** (and SMX/SMY pins), not by MY/MX/MV [V].
- After changing MX/MY/MV, "the data [must] be rewritten to the display RAM" [DS11 §9.10 p66] [V].
- Default 00h at power-on/HW reset, unchanged by SW reset [V].
- TEON (35h), 1 parameter bit TEM [V]:
  - TEM=0: V-blank only (Mode 1, default).
  - TEM=1: V-blank + H-blank (Mode 2: "one V-sync and 162 H-sync pulses per field").
  - Output "not affected by changing MADCTL bit ML"; active low during Sleep In.
  - The TESEL pin selects 162 or 160 lines.
  - TEOFF (34h) is the default.
- TE timing, Table 13 (60 Hz, 25 °C) [DS11 §9.12.2 p74] [V]: tvdl min 13 ms (V-active low), tvdh min 1000 us (V-blank high), thdl min 33 us, thdh 25-500 us. Rise/fall <= 15 ns.
- TE is unusable on this board anyway (no pin, see A1) [V].

### B9. Command summary and reset timing (all [V] from DS11 unless noted)

| Cmd | Name | Params / notes | Page |
|---|---|---|---|
| 01h | SWRESET | wait 120 ms before next command (in both Sleep In and Sleep Out); "Loads all default values to the registers during 120msec" | p100 |
| 10h | SLPIN | stops DC/DC, oscillator and scan; after it (from Sleep Out/Display On) wait 120 ms before the next command; default state is Sleep In | p111 |
| 11h | SLPOUT | wait **120 ms** before the next command, both from Sleep In (register download, self-diagnostic) and from Sleep Out; flowchart shows 2 blank frames | p112 |
| 20h / 21h | INVOFF / INVON | inversion off by default | p115-116 |
| 26h | GAMSET | GC[3:0] = 01/02/04/08h, default 01h; GS=0 gives curves 1.0/2.5/2.2/1.8, GS=1 gives 2.2/1.8/2.5/1.0 | p117, p17 |
| 28h / 29h | DISPOFF / DISPON | display off by default; frame memory untouched | p118-119 |
| 2Ah | CASET | XS[15:0], XE[15:0] (4 bytes); GM=00 default 0-0083h (131), XE 00A1h if MV=1 | p120-121 |
| 2Bh | RASET | YS, YE; GM=00 default 0-00A1h (161), 0083h if MV=1; GM=11 defaults CASET 0-7Fh, RASET 0-9Fh | p122-123 |
| 2Ch | RAMWR | any length; RAM is random at power-on and not cleared by either reset | p124 |
| 2Dh | RGBSET | 128-byte LUT (B7) | p125 |
| 34h / 35h | TEOFF / TEON | TEM bit (B8) | p131-132 |
| 36h | MADCTL | B8 | p134-136 |
| 3Ah | COLMOD | B7 | p142 |
| B0h-D9h, DAh-... | factory | "B0 to D9 and DA to F are for factory use" in the command-list header (PDF p106). This is how the V1.1 list labels its panel-function group, but B1-C5 and E0/E1 are documented panel commands (FRMCTRx, PWCTRx, VMCTR1, GMCTRP1/N1, §10.2), so the "factory" note is best read as "manufacturer command set" [I]. B0h itself (ST7789 RAMCTRL) has no ST7735S definition [V absent]. | PDF p106 |

Hardware reset [DS11 §9.17 p85; DS14 p93] [V]:

- tRESW (RESX low pulse) min 10 us. Pulses < 5 us are rejected as spikes; > 9 us resets.
- tREST (reset cancel) is listed as 5 ms / 120 ms max. The note markers were lost in text extraction; most likely 5 ms when reset during Sleep In and 120 ms during Sleep Out [I].
- Note 7: "wait 5msec after releasing RESX before sending commands. Also Sleep Out command cannot be sent for 120msec." [V]
- Post-reset state (GM=00) [DS11 §9.15.3 p83] [V]: Sleep In, display off, TE off (Mode 1), COLMOD 06h (18-bit), MADCTL 00h, RDDPM 08h.

Minimal working init [I, combining B9 with A2]:

```
HW reset (RES low >=10 us, high, wait 120 ms)
11h, wait 120 ms
[optional B1..C5, E0/E1 from LuatOS st7735s/st7735v table]
3Ah 05
36h 78        ; or 68; BGR
21h or 20h    ; per panel batch
2Ah 00 xs 00 xe ; 2Bh 00 ys 00 ye  (with offset)
29h
```

---

## C. ESP32-C3 and ESP32C3-CORE

### C10. GP-SPI2 clock, IO MUX vs GPIO matrix, DMA

- SPI2 master: "2-line full-duplex ... up to 80 MHz", "1-, 2-, 4-line half-duplex ... up to 80 MHz"; slave up to 60 MHz [C3-DS §4.2.1.2 p47] [V]. TRM: "Master: up to 80 MHz / Slave: up to 60 MHz" [C3-TRM §27.3 p610] [V].
- fSPI_CLK = fclk_spi_mst / ((SPI_CLKCNT_N+1)(SPI_CLKDIV_PRE+1)) [C3-TRM §27.7 p640] [V]. The default clock source is APB (`SPI_CLK_SRC_DEFAULT = SOC_MOD_CLK_APB`) [IDF-CLK] [V], so the available clocks are 80/n MHz: 80, 40, 26.67, 20 ... [I].
- IDF docs: "If at least one signal is routed through the GPIO matrix, then all signals will be routed through it." and "When an SPI Host is set to 40 MHz or lower frequencies, routing SPI pins via the GPIO matrix will behave the same compared to routing them via IOMUX." [IDF-SPI "GPIO Matrix and IO_MUX"] [V]. The "80 MHz IOMUX / 26 MHz GPIO matrix" figure and the ~25 ns input-delay warning are labelled ESP32-only [IDF-SPI] [V].
- The TRM only says that bypassing the GPIO matrix gives "better high-frequency digital performance", with no MHz figure for the matrix [C3-TRM §5.6.1 p166] [V].

SPI2 IO MUX pins [IDF-SPI table] [IDF-PINS] [C3-DS Table 2-4 p20, function F2] [V]:

| Signal | GPIO |
|---|---|
| CS0 (FSPICS0) | 10 |
| SCLK (FSPICLK) | 6 |
| MISO (FSPIQ) | 2 |
| MOSI (FSPID) | 7 |
| QUADWP | 5 |
| QUADHD | 4 |

Air101-LCD wiring vs IO MUX [I]: SCK=GPIO2 (the IO MUX MISO pin), MOSI=GPIO3 (no SPI2 function), CS=GPIO7 (the IO MUX MOSI pin). **None of them are on their IO MUX pin, so the whole bus goes through the GPIO matrix.** That limits the documented-safe clock to **40 MHz**. The bus is write-only, so the input-delay issue doesn't apply; 80 MHz through the matrix may work but is undocumented, and it is 5x the ST7735S write spec [U]. The Arduino variant for this board uses the same pins (SCK=2, MOSI=3, SS=7) [ARD-VAR] [V].

DMA:

- The GDMA has "six independent channels, i.e. three transmit channels and three receive channels", and SPI2 can use it [C3-DS §4.1.1.2 p33] [V].
- Transfer limits [C3-TRM §27.3 p610] [V]: "CPU-controlled transfer ... 1~64 B"; "DMA-controlled single transfer in master mode: 1~32 KB"; segmented DMA transfers "unlimited".
- Code constants:
  - `SPI_LL_DMA_MAX_BIT_LEN (1 << 18)`, i.e. **32768 bytes per DMA transaction** [IDF-LL line 42] [V].
  - `SPI_LL_CPU_MAX_BIT_LEN (16 * 32)` = 64 bytes; `SOC_SPI_MAXIMUM_BUFFER_SIZE 64` [IDF-CAPS] [V].
  - `spi_master.c` (v5.5, lines 1120-1124) rejects transactions over these limits [V].
- `max_transfer_sz` "Defaults to 4092 if 0 when DMA enabled" (one descriptor, `DMA_DESCRIPTOR_BUFFER_MAX_SIZE_4B_ALIGNED`); set it explicitly to go larger [IDF-SPI] [V]. DMA setup costs "about 2 µs per transaction"; buffers must be `MALLOC_CAP_DMA` and 32-bit aligned [IDF-SPI] [V].
- A full 160x80 RGB565 frame is 25 600 bytes, so it fits in one DMA transaction [I].
- Wire time per full frame [I]:
  - 40 MHz: 5.12 ms (max about 195 fps)
  - 20 MHz: 10.24 ms
  - 15 MHz (datasheet limit): 13.65 ms
- The panel refresh period is about 16.5 ms and there's no TE, so a full-frame write can tear against the scan. Partial (dirty-rect) updates keep the visible tearing window small [I].

### C11. CPU, SRAM, float

- "32-bit RISC-V single-core processor, up to 160 MHz"; "483.27 CoreMark; 3.02 CoreMark/MHz" [C3-DS p3] [V]. "RV32IMC ISA", "32-bit multiplier and 32-bit divider" [C3-DS §4.1.1.1 p33] [V].
- **No FPU**: RV32IMC has no F/D extension [I]. The IDF speed guide says float math on the C3 is "emulated in software and are very slow" [IDF-SPEED] [V].
- SRAM: "400 KB (16 KB for cache)"; ROM 384 KB; RTC SRAM 8 KB [C3-DS p4, p34] [V].
- Usable heap:
  - The official hello_world prints "Minimum free heap size: 337332 bytes" (about 329 KiB; an old silicon-rev-0 capture) [IDF-HELLO] [V].
  - A real-app boot log shows heap regions 268 KiB DRAM + 10 KiB STACK/DRAM + 7 KiB RTCRAM, and "free heap 274236" before Wi-Fi [MESH40] [V].
  - With Wi-Fi, "Available memory (KB)" is 59 / 160 / 180 for the Iperf / Default / Minimum configs [IDF-WIFI] [V].
  - Expect about 270-330 KB free without Wi-Fi and about 160 KB with default Wi-Fi [I].
  - A 25.6 KB framebuffer, or two for double-buffering, fits easily [I].

Soft-float costs, average cycles per call including call overhead (compiler flags not stated) [FPU-BLOG] [V]:

| Op | float | double |
|---|---|---|
| add | 100 | 122 |
| div | 102 | 133 |
| cos | 2377 (cosf) | 3560 |
| mixed expression | 3659 | 6074 |

- At 160 MHz: about 0.63 us per float add, about 15 us per cosf [I].
- No published C3 figures for float mul alone, sqrtf or sinf [U]. sinf is presumably close to cosf [I].
- Whetstone (double): 20.0 MIPS at -O2, 8.3 at -Og (160 MHz, GCC 12.2.0, IDF v5.1) [NOPNOP] [V].

Does `sinf` use double internally?

- Newer newlib `libm/common/sinf.c` computes in double (`double x = y;`) but is only built when `!__OBSOLETE_MATH` [NEWLIB] [V].
- `ieeefp.h` sets `__OBSOLETE_MATH_DEFAULT 0` only for `__riscv_flen == 64` or zdinx; RV32IMC gets 1 [NEWLIB] [V]. So the C3 uses the old all-float fdlibm `libm/math/sf_sin.c` (`__kernel_sinf`, `__ieee754_rem_pio2f`) [I]. Espressif's newlib fork `esp-4.6.0_20260914` has the same logic [V].
- ESP-IDF v6.0 switched the default libc: "Since ESP-IDF v6.0, the default LibC used in builds has switched to the PicolibC implementation" [V]. Picolibc also defaults to obsolete math on this target, so it has a float sinf too [I].
- `sin()` on a float argument promotes to double, and unsuffixed literals (`2.3`) are double, so use `sinf`, `f` suffixes and `-Wdouble-promotion` [I, standard C].
- For a clock face, precomputed sin/cos tables or integer fixed-point avoid this cost entirely [I].

### C12. ESP32C3-CORE board [W-CORE] [CORE-SCH-CH343] [CORE-SCH-USB] [ARD-VAR]

- LEDs [V]: D4 on GPIO12, D5 on GPIO13, both "高电平有效" (active high) through 1 k to GND. Arduino: `LED_BUILTIN = 12`, `LED_BUILTIN_AUX = 13`.
- Buttons [V]: BOOT on GPIO9 with a 10 k pull-up, active low. RST button on CHIP_EN.
- Flash [V]: "板载4MB，支持最高 16MB" (4 MB on board, supports up to 16 MB). The flash runs in **DIO** mode; GPIO12/13 are not connected to the flash, so builds must select DIO (Arduino `flash_mode=dio`).
- USB variants [V]:
  - 经典款 (classic): CH343P USB-serial with DTR/RTS auto-download; needs the CH343 driver.
  - 新款 / 简约版 (new / minimal): native USB on GPIO18 (D-) / GPIO19 (D+); needs USB-enabled firmware ("USB" in the LuatOS firmware name). In ESP-IDF, use the USB-Serial/JTAG console [I].
- Physical [V]: "21mm*51mm" (drawing 52.0055 x 20.9910 mm), castellated edges, 32 pins (16 per side) at 2.54 mm pitch with rows 17.78 mm apart, ME6212C33 LDO (enable on pin PWB), 2.4 GHz PCB antenna.
- Pin cautions [V]:
  - GPIO11 = VDD_SPI by default; needs the eFuse burn (see A1).
  - GPIO2/8/9 are strapping pins; don't hold GPIO8/9 low at boot.
  - GPIO14-17 go to flash and aren't broken out.
- Note: the wiki board page was deleted on 2025-09-08 as "已经废弃" (obsolete); the citations use the last revision [V].

### C13. ESP-IDF driver for ST7735

- **No official Espressif ST7735 driver.** `espressif/esp_lcd_st7735` returns "ComponentNotFoundError" [REG-404] [V]. It's also absent from the esp-bsp `components/lcd` and esp-iot-solution `components/display/lcd` listings [V]. Official ones exist for ILI9341 (2.1.0), GC9A01 (2.0.4), ST7796 (1.5.0) and others; ST7789 is built into IDF itself [V].
- Community components on the registry (search "st7735") [V]:

  | Component | Version | Notes |
  |---|---|---|
  | `waveshare/esp_lcd_st7735` | 2.0.0 (2026-06-18) | Espressif-template driver, `esp_lcd_new_panel_st7735()`, accepts a custom `init_cmds` table [REG-WS] |
  | `teriyakigod/esp_lcd_st7735` | 0.0.1 | about 62k downloads, MIT, "espidf 5.2.1 st7735 driver", no README [REG-TERI] |
  | `miraitowa-la/esp_st7735` | 0.1.1 | - |
  | `t4v4res/st7735_driver` | 0.1.2 | ESP32-C6 only |

- Alternative: `esp_lcd_new_panel_io_spi()` + built-in `esp_lcd_new_panel_st7789()` (what Grrtzm does) [GRR] [V].
  - The ST7789 driver sends SLPOUT, MADCTL, COLMOD 0x55 and RAMCTRL 0xB0 (2 params), and supports `set_gap`, mirror, swap_xy and `invert_color` [IDF-ST7789] [V].
  - 0xB0 has no ST7735S meaning and is apparently ignored, since Grrtzm's display works [I].
  - It never writes FRMCTR/PWCTR/gamma, so the panel runs on reset defaults (about 60.7 Hz, default gamma) [I].
  - The ST7789 driver's RGB/BGR flag maps to the same MADCTL bit 3, so BGR is selectable [I].
- Cleanest option [I]: `esp_lcd_new_panel_io_spi()` (dc=6, cs=7, pclk 40 MHz, mode 0, `lcd_cmd_bits=8`, `lcd_param_bits=8`) with either the Waveshare component plus the LuatOS init table, or a small custom panel that sends the B9 sequence and handles CASET/RASET offsets.

---

## Open gaps / to verify on hardware

1. Offset family (0/24 vs 1/26) and INVON for *your* unit; also the offset at 180° rotation (MX/MY asymmetry for the 24-gap).
2. Key direction names (netlist vs LuatOS disagree); whether the GPIO13 LED interferes with the RKEY pull-up.
3. Whether the GPIO11 VDD_SPI eFuse is already burned on your CORE board (LuatOS firmware flashing may have done it) [U].
4. Exact panel part number on the Air101-LCD; luminance and viewing-angle figures are for comparable modules only.
5. Default RGB565-to-18-bit expansion with no RGBSET written; LINE in the frame-rate formula; fosc tolerance.
6. Published C3 cycle counts for float mul, sqrtf, sinf.
7. Reliability of SPI above 40 MHz through the GPIO matrix (and above the 15 MHz datasheet spec at all).

---

## References

Board / Luat

- [W-LCD] luatos-wiki Air101-LCD page (last revision before deletion): https://github.com/openLuat/luatos-wiki/blob/9815c5f4315550e511ffceffc1174ca0ba0ea654/peripherals/lcd_air10x/index.md (hardware page: `.../peripherals/lcd_air10x/hardware.md`)
- [LCD-ZIP] Air101-LCD KiCad project: https://cdn.openluat-luatcommunity.openluat.com/attachment/20211120142713085_Air101-Expansion-LCD.zip
- [LCD-SCH] Air101-LCD schematic image: https://cdn.openluat-luatcommunity.openluat.com/images/image-20220223143108801.png
- [W-CORE] luatos-wiki ESP32C3-CORE board page: https://github.com/openLuat/luatos-wiki/blob/9815c5f4315550e511ffceffc1174ca0ba0ea654/chips/esp32c3/board.md
- [CORE-SCH-CH343] CORE-ESP32-C3 schematic V1.2: https://cdn.openluat-luatcommunity.openluat.com/attachment/CORE-ESP32-C3%E8%AE%BE%E8%AE%A1%E5%8E%9F%E7%90%86%E5%9B%BE_V1.2.pdf
- [CORE-SCH-USB] CORE-ESP32 A12 (native USB) schematic: https://cdn.openluat-luatcommunity.openluat.com/attachment/20220609213416069_CORE-ESP32-A12.pdf
- [ARD-VAR] Arduino variant AirM2M_CORE_ESP32C3: https://raw.githubusercontent.com/espressif/arduino-esp32/master/variants/AirM2M_CORE_ESP32C3/pins_arduino.h
- [LUA-LCD] LuatOS lcd component (luat_lcd.c, luat_lcd_st7735s.c, luat_lcd_st7735v.c, luat_lib_lcd.c): https://github.com/openLuat/LuatOS/tree/master/components/lcd
- [LUA-OLD] LuatOS st7735v driver before the 2023 refactor: https://github.com/openLuat/LuatOS/blob/8fa2682096d258845772b699332094e9ebe88d8e/components/lcd/luat_lcd_st7735v.c
- [LUA-DEMO] LuatOS demo/lcd/main.lua: https://github.com/openLuat/LuatOS/blob/56ded28a670991478fd5adcb914665486442479c/demo/lcd/main.lua
- [LUA-DEV] LuatOS turnkey lcd-0.96-lvgl (device.lua, key.lua, main.lua): https://github.com/openLuat/LuatOS/blob/16c31ac9034031af77ee172814b43b65b3f1aa04/script/turnkey/lcd-0.96-lvgl/device.lua
- [AIR32] Air32F103 SPI_Air10x_LCD demo: https://github.com/openLuat/luatos-soc-air32f103/tree/master/ModuleDemo/SPI/SPI_Air10x_LCD
- [GRR] Grrtzm ESP32_ST7735_DEMO main.c: https://github.com/Grrtzm/ESP32_ST7735_DEMO/blob/main/main/main.c
- [JIU] jiujue ESP32C3-air101-lcd-microPython-game: https://github.com/jiujue/ESP32C3-air101-lcd-microPython-game
- [BODO] bododo esp32-c3 ST7735 MicroPython: https://gitee.com/bododo/esp32-c3_-st7735
- [CNB] cnblogs Ansel09: https://www.cnblogs.com/Ansel09/p/17501743
- [ADA] Adafruit ST7735 library: https://github.com/adafruit/Adafruit-ST7735-Library/blob/master/Adafruit_ST7735.cpp

Panel

- [P-WV] Wisevision N096-1608TBBIG11-H13 spec: https://file1.elecfans.com/web2/M00/DF/FF/wKgZomY1lweAa1fAABSsflnBR_o973.pdf
- [P-LH] LH096T-IG01 spec (Waveshare): https://files.waveshare.com/wiki/Zero-LCD-HAT-A/0.96inch_LCD_Module-Datasheet.pdf
- [P-ER] EastRising ER-TFT0.96-1 datasheet: https://www.buydisplay.com/download/manual/ER-TFT0.96-1_Datasheet.pdf (product page: https://www.buydisplay.com/serial-spi-80x160-0-96-inch-mini-ips-tft-lcd-display-st7735)
- [P-DFR] DFRobot DFR0847: https://wiki.dfrobot.com/dfr0847/
- [WS-096] Waveshare 0.96inch LCD Module wiki: https://www.waveshare.com/wiki/0.96inch_LCD_Module

Controller

- [DS11] Sitronix ST7735S V1.1: https://www.waveshare.com/w/upload/e/e2/ST7735S_V1.1_20111121.pdf
- [DS14] Sitronix ST7735S V1.4: https://diy.szlcsc.com/oshwhub/project/attachments/0da7af2fe72f4d2bb33be33b2e48eb23.pdf
- [DSR] Sitronix ST7735R V0.2 (comparison): https://cdn-shop.adafruit.com/datasheets/ST7735R_V0.2.pdf

ESP32-C3 / ESP-IDF

- [C3-DS] ESP32-C3 datasheet v2.4: https://documentation.espressif.com/esp32-c3_datasheet_en.pdf
- [C3-TRM] ESP32-C3 TRM v1.4: https://documentation.espressif.com/esp32-c3_technical_reference_manual_en.pdf
- [IDF-SPI] SPI master docs: https://docs.espressif.com/projects/esp-idf/en/stable/esp32c3/api-reference/peripherals/spi_master.html
- [IDF-GPIO] GPIO docs: https://docs.espressif.com/projects/esp-idf/en/stable/esp32c3/api-reference/peripherals/gpio.html
- [IDF-PINS] spi_pins.h: https://github.com/espressif/esp-idf/blob/v5.3/components/soc/esp32c3/include/soc/spi_pins.h
- [IDF-CAPS] soc_caps.h: https://github.com/espressif/esp-idf/blob/master/components/soc/esp32c3/include/soc/soc_caps.h
- [IDF-LL] spi_ll.h: https://github.com/espressif/esp-idf/blob/v5.3/components/hal/esp32c3/include/hal/spi_ll.h
- [IDF-CLK] clk_tree_defs.h: https://github.com/espressif/esp-idf/blob/v5.5/components/soc/esp32c3/include/soc/clk_tree_defs.h
- [IDF-ST7789] esp_lcd ST7789 driver: https://github.com/espressif/esp-idf/blob/v5.4.1/components/esp_lcd/src/esp_lcd_panel_st7789.c
- [IDF-SPEED] Speed optimization guide: https://docs.espressif.com/projects/esp-idf/en/stable/esp32c3/api-guides/performance/speed.html
- [IDF-HELLO] Get started (hello_world output): https://docs.espressif.com/projects/esp-idf/en/stable/esp32c3/get-started/start-project.html
- [IDF-WIFI] Wi-Fi performance and memory: https://docs.espressif.com/projects/esp-idf/en/stable/esp32c3/api-guides/wifi-driver/wifi-performance-and-power-save.html
- [MESH40] boot log, esp-mesh-lite #40: https://github.com/espressif/esp-mesh-lite/issues/40
- [ESPEFUSE] espefuse burn_efuse (VDD_SPI_AS_GPIO): https://docs.espressif.com/projects/esptool/en/release-v4/esp32c3/espefuse/burn-efuse-cmd.html
- [FPU-BLOG] Espressif blog, cores with FPU (C3 soft-float cycles): https://developer.espressif.com/blog/2025/10/cores_with_fpu/
- [NOPNOP] nopnop2002 esp-idf-benchmark: https://github.com/nopnop2002/esp-idf-benchmark
- [NEWLIB] newlib libm (common/sinf.c, math/sf_sin.c, libc/include/machine/ieeefp.h): https://sourceware.org/git/?p=newlib-cygwin.git
- [REG-404] registry lookup for espressif/esp_lcd_st7735: https://components.espressif.com/api/components/espressif/esp_lcd_st7735
- [REG-WS] waveshare/esp_lcd_st7735: https://components.espressif.com/components/waveshare/esp_lcd_st7735 (source: https://github.com/waveshareteam/Waveshare-ESP32-components/tree/master/display/lcd/esp_lcd_st7735)
- [REG-TERI] teriyakigod/esp_lcd_st7735: https://components.espressif.com/components/teriyakigod/esp_lcd_st7735 (source: https://github.com/appsou/esp_lcd_st7735)
