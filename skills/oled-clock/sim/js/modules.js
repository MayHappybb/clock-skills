// The modules a design can target, in millimetres. Sources (full list in
// references/hardware.md):
//   0.96" glass  Univision UG-2864HSWEG01 Rev B p1-2 (cross-checked Raystar REX012864DWPP)
//   0.96" board  Winstar WEA012864D p7 (27.3 x 27.3, holes, header position)
//   0.96" dual   Enrich LM096 p5: 16 yellow rows, a 2-pitch gap, 48 blue
//   0.91" glass  Univision UG-2832HSWEG02 Rev B p1-2 (cross-checked Raystar REX012832F)
//   0.91" board  NO primary drawing found: the common 38 x 12 board is approximated
//   1.3" glass   Allvision QG-2864KSWLG01 p2-3 (SH1106; RAM columns 2-129 shown)
//   1.3" board   Pololu 3760 drawing (35.4 x 33.5); the 4-pin I2C clone is unverified
//   SPI boards   the common 7-pin boards (GND VCC D0 D1 RES DC CS): same glass;
//                the header is drawn from typical photos, NOT from a drawing.
//                Used whenever a design runs on an SPI bus (`spi` below).
//
// Coordinates: module (PCB) top-left is (0, 0), x right, y down, with the
// module the way up its picture is under the standard init (header at the
// top on the square boards; the flex cable folds behind the glass's lower
// edge). `glass` is the glass on the board; `active` is the active area
// within the glass; `pixel` the emitter size; `pitch` the pixel pitch.

export const MODULES = {
  '096-128x64': {
    label: '0.96" 128x64 SSD1306 (I2C, 4-pin)',
    chip: 'ssd1306', chargePump: true,
    cols: 128, rows: 64,
    colours: ['white', 'blue', 'yellow-blue', 'yellow'],
    pitch: { x: 0.17, y: 0.17 },
    pixel: { w: 0.154, h: 0.154 },          // 0.148 on Raystar/Winstar/Vishay glass
    active: { x: 2.478, y: 2.1, w: 21.744, h: 10.864 },
    glass: { x: 0.3, y: 4.02, w: 26.7, h: 19.26 },
    // Dual-colour glass only: rows 0-15 yellow, then two pixel pitches of
    // glass left out (0.34 mm extra), then 48 blue rows.
    zones: { split: 16, gap: 0.34 },
    pcb: {
      w: 27.3, h: 27.3, r: 0.6, colour: '#1f4fa8', shade: '#173d85',
      holes: [[3.3, 2.05, 1.25], [24.0, 2.05, 1.25], [3.3, 25.25, 1.25], [24.0, 25.25, 1.25]],
      // Clones are GND-first; Winstar's own board is VCC, GND, SCL, SDA.
      header: { x: 9.84, y: 1.65, pins: ['GND', 'VCC', 'SCL', 'SDA'], labelBelow: true },
    },
    spi: {
      label: '0.96" 128x64 SSD1306 (SPI, 7-pin)',
      header: { x: 6.03, y: 1.65, pins: ['GND', 'VCC', 'D0', 'D1', 'RES', 'DC', 'CS'], labelBelow: true },
    },
  },
  '091-128x32': {
    label: '0.91" 128x32 SSD1306 (I2C, 4-pin)',
    chip: 'ssd1306', chargePump: true,
    cols: 128, rows: 32,
    colours: ['white', 'blue'],
    pitch: { x: 0.175, y: 0.175 },
    pixel: { w: 0.159, h: 0.159 },
    // 2.1 mm from the glass's far end and from the Row-1 edge; the flex
    // leaves the end beyond column 128.
    active: { x: 2.1, y: 2.1, w: 22.384, h: 5.584 },
    glass: { x: 6.8, y: 0.25, w: 30.0, h: 11.5 },
    pcb: {
      w: 38.0, h: 12.0, r: 0.5, colour: '#1f4fa8', shade: '#173d85',
      holes: [],
      header: { x: 2.4, y: 2.19, vertical: true, pins: ['GND', 'VCC', 'SCL', 'SDA'] },
    },
  },
  '130-128x64': {
    label: '1.3" 128x64 SH1106 (I2C, 4-pin)',
    chip: 'sh1106', chargePump: true, colOffset: 2,
    cols: 128, rows: 64,
    colours: ['white', 'blue'],
    pitch: { x: 0.23, y: 0.23 },
    pixel: { w: 0.21, h: 0.21 },
    active: { x: 2.54, y: 2.1, w: 29.42, h: 14.7 },
    glass: { x: 0.45, y: 5.25, w: 34.5, h: 23.0 },
    pcb: {
      w: 35.4, h: 33.5, r: 0.8, colour: '#1f4fa8', shade: '#173d85',
      holes: [[2.5, 2.5, 1.525], [32.9, 2.5, 1.525], [2.5, 31.0, 1.525], [32.9, 31.0, 1.525]],
      header: { x: 13.89, y: 2.0, pins: ['GND', 'VCC', 'SCL', 'SDA'], labelBelow: true },
    },
    spi: {
      label: '1.3" 128x64 SH1106 (SPI, 7-pin)',
      header: { x: 10.08, y: 2.0, pins: ['GND', 'VCC', 'D0', 'D1', 'RES', 'DC', 'CS'], labelBelow: true },
    },
  },
};
