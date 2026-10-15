# The boards: what was read from the spec photos

Every board comes from one seller, LYQ电子. Their spec photos are in the
project's `screen_description/`. The geometry in `sim/js/panels.js` is
derived from those photos as described below. `node tools/test.mjs` checks
the result against the spec numbers.

Conventions:
- Coordinates are as seen from the front (LED side), x right, y down.
- The back silkscreen is mirrored. "输入" (input) on the right of the back
  is the left of the front.

## hex331: hexagon, 10 rings

Seller's spec: 正六边形-10层-P4-S形-331灯-3227-12mA雾状, 74.5 × 86 mm, side 43 mm.

- LEDs sit in 21 vertical columns, 3.464 mm apart (4 × √3/2). Within a
  column they are 4 mm apart.
- Columns hold 11, 12, … 21 (middle), … 11 LEDs. The back says
  "第一列11灯|中间列21灯" (first column 11, middle column 21).
- 2·(11+…+20) + 21 = 331.
- Chain: the front photo numbers 1–11 down the left column and 12 at the
  bottom of column 2. Even columns run down, odd columns up.
- Ring k (hex distance from the centre) holds 6k LEDs. Ring 2 has 12, which
  suits hours; ring 10 has 60, which suits minutes. `ringPos` 0 is at
  12 o'clock, running clockwise.
- Seam: the outer column is 2.61 mm from the flat edge. Across two butted
  flat edges the LEDs are 5.2 mm apart, against a 3.46 mm column step.

## Package orientation (3227 boards)

On the hexagon, triangle and octagon the 3.2 × 2.7 mm package stands with
its long side vertical, along the columns, and its pads at top and bottom
(IMG_7899, IMG_7901, IMG_7904); the owner confirmed it for the triangle. On
the arc board the long side runs along the rings round the left base corner
(IMG_7907).

## tri120: triangle, 15 rows

Seller's spec: 三角形点阵-15行-P4-S形-120灯-3227-12mA雾, 60 × 52 mm.

- 15 vertical columns on the same lattice as the hexagon. Column k holds k
  LEDs (1+…+15 = 120), with the apex at the input connector.
- The outline is stepped: each column's board ends half a pitch beyond its
  end LEDs. That gives exactly 51.96 × 60 mm.
- The steps stick out one step beyond the ideal 30° edge. Six triangles
  therefore cannot meet apex to apex: `tri-hex` pushes them 3.4 mm apart.
- Turned 0 and 180 degrees, triangles interlock exactly: their stepped edges
  are complementary, and if one is offset by (sc columns, sh half-rows)
  with sh - sc even, the LEDs continue on one lattice across the seam.
  Base to base is (15, 1), along a slant (0, -16). Those build `tri-diamond`,
  `tri-pair`, `tri-big` and `tri-ribbon`; tools/test.mjs checks every LED
  has a neighbour at exactly 4 mm.
- **Unverified:** the direction of column 2 (assumed to run down).
  Run the `chain` design on the hardware to confirm it.

## oct196: octagon

Seller's spec: 八边形点阵-64×64MM, WS2812-3227-P4-Z形-196灯.

- A 16 × 16 grid on 4 mm with the corners cut. Column i starts at row
  6, 5, 4, 3, 2, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6.
- Chain: taken from the map printed on the spec photo. Every column runs
  top to bottom, column 1 first.
- Edges are 24 mm straight and 28.284 mm on the diagonals.

## strip256: 32x8

Seller's spec: WS2812点阵-96×24.4MM, 32X8-P3-Z形-256灯-2020.

- From the front: 1 is top-left, 8 bottom-left, 249 top-right, 256
  bottom-right. Every column runs top to bottom.
- 96 mm = 32 × 3 mm, so strips butt end to end on a continuous lattice.
- Stacked, the seam is 3.4 mm against the 3 mm pitch. That is close enough
  that `strip-x2` counts as one lattice. Over three strips the error adds
  up to 0.8 mm, so `strip-x3` does not.
- **Unverified:** the per-channel current (5 mA assumed).

## sq400: 20x20

Seller's spec: 20X20-P3-Z形-400灯-2020-5mA, 60 × 60 mm.

- Z order, as on the strip: 1 is top-left, 20 bottom-left, 381 top-right.
- It tiles with itself and with the strip on one 3 mm lattice.

## para128: parallelogram 16x8

Seller's spec: WS2812斜点阵 16X8-P2.55-S形-128灯-2020, 52.8 × 19.1 mm,
corners 61° and 119°, top edge 42.275 mm, slanted edge 21.832 mm.

- Rows are horizontal: 16 LEDs at 2.55 mm.
- The 8 LEDs of a column run along the slant, also 2.55 mm apart. This is
  confirmed by the matching margins: 8 × 2.55 in 21.83 mm and 16 × 2.55 in
  42.275 mm both leave about 0.7 mm per end. The lattice is rhombic, close
  to triangular: each row is shifted 0.485 pitch.
- Packages are turned 31° anticlockwise: their edges run at −31° and 59°.
  Measured from the package edges in IMG_7896 (an edge-direction histogram
  peaks at 60° and 150°), and confirmed by the owner.
- Chain: 1 at the top of the left column, 8 at the bottom-left, 9 next to 8
  going up.
- Seams: end to end the LEDs are 3.6 mm apart against 2.55 mm, so the
  lattice breaks. **Unverified:** the per-channel current (5 mA assumed).

## arc210: arc triangle, 20 rings

Seller's spec: 圆弧三角形-20行-P4-Z形-210灯-3227-12mA雾, 86 × 72.7 mm, sides
R83, base R100, apex 63.1 mm above the base's middle, "每圈灯珠距离4mm"
(4 mm between LEDs on each ring).

**Measured from the lit photo IMG_7907** (nearly top-down):
- All 210 LED centroids were extracted from the photo.
- The rows (labelled 1–20 on the silkscreen) are concentric circles round one
  centre with a 4 mm step: rms 2.4 px, about 0.1 mm.
- The other set of rows are concentric circles round a second centre 81.6 mm
  away, also 4 mm apart.
- Together this is a **bipolar lattice**: each LED sits where ring u round C1
  crosses ring v round C2, at radii 5.04 + 4(u−1) and 5.04 + 4(v−1) mm, with
  u + v ≥ 21. The ideal model fits all 210 LEDs to 0.2 mm rms.
- C1 and C2 are the two base corners. The convex sides are the outermost
  rings (81.0 mm + 2 mm margin, which is the spec's R83). The base row lies on
  an ellipse with foci C1 and C2; the board's concave base is an R100 arc
  4.4 mm below the middle of that row, which makes the apex 63 mm above it.
- `w = u + v − 20` counts rows up from the base (1 = base, 20 = apex). Along a
  ring, LEDs are 3.8–6.1 mm apart (wider near the base, where the rings cross
  at a shallow angle).
- Packages are turned with their long side along ring u.

**Model limits:**
- The modelled outline is 84.5 × 72.3 mm against the spec's 86 × 72.7; the
  margins aren't known.
- **Unverified:** the chain order. Ring u = 1..20 in turn, each from the base
  up, is assumed from "Z形" and the silkscreen numbers 1–20 along the base.
  Run `chain` on the hardware to confirm it.

The apex angle is about 120°, so three meet round a point (`arc-trio`) and
two meet apex to apex (`arc-pair`).

A 2020 version also exists: 68 × 57.78 mm, "双同心圆交叉点阵, 半径递增3.2MM",
the same bipolar lattice on a 3.2 mm step. It isn't modelled.

## hub64: HUB75 RGB matrix 64×64, P2, GOB

Waveshare RGB-Matrix-P2-64x64-B, IMG_8301–8303 (product page and spec
table): 2 mm pitch, 64 × 64 = 4096, 128 × 128 mm, 1R1G1B, ≥140° viewing
angle, 1/32 scan, HUB75, 5 V 3 A (VH4 header), ≤ 15 W. GOB = "glue on
board", an epoxy coat over the LEDs against knocks.

- **Not a WS2812 board.** It is a scanned matrix: R1 G1 B1 (top half) and
  R2 G2 B2 (bottom half) shift a row pair in; A–E select one of 32 row
  pairs; LAT latches; OE gates the light. Driven by ESP32-HUB75-MatrixPanel-DMA
  (or hzeller's rpi-rgb-led-matrix on a Pi).
- PCB silkscreen DCHY-P2-6464-1515-VP: 1515 packages, black body.
- 128 mm = 64 × 2 mm, so the LEDs sit 1 mm from each edge and butted panels
  keep the 2 mm pitch: assemblies are one seamless lattice.
- Seen from the back, data in is the left header and out the right (arrows
  point right), so seen from the front the input is on the right.
- `leds[]` is frame-buffer order (index y·64 + x from the top-left, seen
  from the front), not a chain. `tools/test.mjs` checks it.

## s3m64: Waveshare ESP32-S3-Matrix

IMG_8304: the dimension drawing. 25.00 × 25.00 mm, R1.0 corners, 8 × 8 LEDs,
2.54 mm headers (22.86 mm = 9 pitches between the pad columns).

- **Pitch, measured** from the drawing: pad centres calibrate it at
  27.9 px/mm both ways; the LED centroids step 73.97 px across (2.65 mm,
  steady to ±0.3 px) and 76.84 px down (2.75 mm, ±2 px). The grid is
  centred on the board.
- From the Zephyr board DTS (waveshare/esp32s3_matrix): WS2812 on GPIO14
  (SPI2 MOSI), chain length 64, colour order R, G, B, WS2812C timing,
  `led-strip-matrix` 8 × 8 `circulative` (rows in the same direction).
  4 MB flash, 2 MB PSRAM. The Robojax ESP32-S3 matrix clock uses NeoMatrix
  TOP + LEFT + ROWS + PROGRESSIVE and NEO_RGB, which agrees. ESPHome's
  example uses a column-serpentine mapper with a 180° rotation, which does
  not: **unverified**, run `chain` on the board.
- **Assumed:** the chain starts top-left with the USB-C edge up; 5 mA per
  channel (WS2812C-2020); the MCU's 0.4 W.
- The back has Dout, 5 V and GND pads: the 8×8's data out, so more WS2812
  boards can follow it on the same lane.
