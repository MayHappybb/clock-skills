// The display modules, as data: the glass and its controller, nothing about
// whatever MCU drives it. Each fact's source is in references/hardware.md;
// values marked "assumed" there are the simulator's choices, not datasheet
// figures. A new panel is a new entry here (and, for a new controller, an
// emulator beside st7735.js).

export const MODULES = {
  'air101-lcd': {
    label: 'Luat Air101-LCD, 0.96" IPS 160x80, ST7735S',
    controller: 'st7735s',
    cols: 160, rows: 80,
    /** Pixel pitch, mm (0.135 x 0.1356 on the datasheets; square is close enough). */
    pitch: 0.1356,
    /** The glass outline, mm, and where the active area sits on it (the FPC end is the wider margin). */
    glass: { w: 27.95, h: 13.5, activeX: 1.7, activeY: 1.35 },
    /**
     * The board, mm: where the glass sits on it, and its solder mask. The
     * glass position is assumed (the board is 21 x 51 mm and also carries a
     * 5-way key).
     */
    pcb: {
      w: 51, h: 21, glassX: 4, glassY: 3.75,
      colour: [58, 34, 92], colourLit: [92, 58, 140],
      pins: [],
      holes: [{ x: 2.2, y: 2.2, r: 1.1 }, { x: 48.8, y: 2.2, r: 1.1 }, { x: 2.2, y: 18.8, r: 1.1 }, { x: 48.8, y: 18.8, r: 1.1 }],
      key: { x: 41, y: 10.5, r: 3.4 },
    },
    /**
     * What the firmware's init sets (driver.js): landscape, the glass's
     * window inside the 132 x 162 memory, inversion, BGR order. Panels of
     * this module come in two batches (hardware.md): offset (1, 26) with
     * inversion on, as here, or (0, 24) with it off. The test card tells
     * them apart on real glass; designs look the same on either.
     */
    init: {
      madctl: 0x78,          // MX | MV | ML | BGR: landscape, as LuatOS sets it
      xoff: 1, yoff: 26,
      invert: true,
      gamma: 0x01,
      frmctr1: [0x05, 0x3c, 0x3c],   // LuatOS st7735s: about 59.9 Hz
    },
    /** The glass: optics and liquid crystal. */
    panel: {
      bgr: true,             // colour filters are in BGR order relative to the source lines
      invert: true,          // true colours need INVON
      gammaCurves: [2.2, 1.8, 2.5, 1.0],   // GAMSET 01h, 02h, 04h, 08h
      contrast: 800,         // : 1
      response: { rise: 0.0075, fall: 0.006 },  // first-order time constants, s (Tr + Tf = 30 ms typ, 10-90%)
      glow: 1.5,             // dark level rises by this factor at the corners
      falloff: 0.08,         // backlight non-uniformity across the glass
      ledEdge: 'left',
      reflect: 0.012,        // room light the glass returns, as a fraction of full white
      stripes: [0, 1, 2],    // filter colour of the top, middle and bottom stripe (0 R, 1 G, 2 B)
      gapX: 0.05, gapY: 0.02,
    },
    /** Default SPI clock for designs (any MCU can run it; the controller's rating is in hardware.md). */
    bus: 'spi40',
  },
};
