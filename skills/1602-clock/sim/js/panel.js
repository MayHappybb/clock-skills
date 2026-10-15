// Draws an emulated HD44780 into a canvas so it reads as a photograph of a real
// 1602 module rather than a generic dot-matrix grid.
//
// Everything is laid out in millimetres using the module's own dimensions and
// then scaled, so the dot pitch, the character gaps and the bezel stay in the
// same proportion as the physical part no matter the zoom.
//
// Numbers are from the LCD-1602A datasheet's "General Specification" and
// "DOT SIZE" drawing. Two consequences worth knowing when drawing:
//   - dots sit on a 0.60 x 0.70 mm pitch, so they are taller than wide (1.17:1)
//   - between cells the glass skips 0.60 mm horizontally (one whole missing dot
//     column) but only 0.40 mm vertically, so a shape spanning both rows is far
//     more continuous than one spanning two cells side by side.

import { DOT_COLS, DOT_ROWS } from './hd44780.js';

/** Physical geometry of the 16x2 module, in millimetres. */
export const MODULE = {
  bodyW: 80.0,
  bodyH: 36.0,
  viewW: 64.5,
  viewH: 14.5,
  dotPitchX: 0.60,
  dotPitchY: 0.70,
  dotSizeX: 0.55,
  dotSizeY: 0.65,
  /** Character pitch: 2.95 x 5.55 mm cell plus a 0.60 / 0.40 mm gap. */
  charPitchX: 3.55,
  charPitchY: 5.95,
};

/**
 * Optical response of the liquid crystal (datasheet "Optical Characteristics"):
 * 10-90% rise and fall of 150 ms typical, 200 ms max. Modelled as a first-order
 * lag, so the time constant is the 10-90% time over ln 9. Colder glass is
 * slower still; the datasheet gives no figure for that.
 */
export const RESPONSE = {
  typ: 0.150 / Math.log(9),
  max: 0.200 / Math.log(9),
};

export const PANEL_PRESETS = {
  /** Classic STN yellow-green, positive image: dark pixels on a lit green field. */
  green: {
    label: 'STN green',
    backlight: '#c3d94a',
    field: '#b4cc3c',
    offDot: '#a8bf35',
    onDot: '#1b2607',
    onGlow: 'rgba(120,150,20,0.35)',
    ghost: 0.5,
    glow: 0.0,
    textShadow: 'rgba(255,255,255,0.10)',
  },
  /** FSTN negative blue: bright pixels on a deep blue field, strong bloom. */
  blue: {
    label: 'FSTN blue',
    backlight: '#1657c8',
    field: '#0e3ea0',
    offDot: '#12459f',
    onDot: '#eef6ff',
    onGlow: 'rgba(150,200,255,0.55)',
    ghost: 0.75,
    glow: 0.55,
    textShadow: 'rgba(0,0,0,0.35)',
  },
  /** Reflective grey, no backlight at all. */
  gray: {
    label: 'Reflective grey',
    backlight: '#a9ad9c',
    field: '#9ea291',
    offDot: '#969a89',
    onDot: '#181c14',
    onGlow: 'rgba(60,70,40,0.25)',
    ghost: 0.4,
    glow: 0.0,
    textShadow: 'rgba(255,255,255,0.08)',
  },
  /** Negative amber on near-black: a backlit amber module, the look of the
   *  reference photo. Almost no unlit-dot ghosting, a strong warm bloom. */
  amber: {
    label: 'Amber',
    backlight: '#2e1a04',
    field: '#15100a',
    offDot: '#1b1610',
    onDot: '#ffab1e',
    onGlow: 'rgba(255,150,20,0.75)',
    ghost: 0.45,
    glow: 0.5,
    textShadow: 'rgba(0,0,0,0.5)',
  },
};

/**
 * Canvas size for a given render, so callers can size the canvas before drawing.
 * @param {'body'|'view'} [crop] 'body' includes the bezel, 'view' is just the glass
 */
export function panelCanvasSize(lcd, { scale = 16, crop = 'body' } = {}) {
  if (crop === 'view') {
    const w = MODULE.viewW * scale, h = MODULE.viewH * scale;
    return { width: Math.round(w), height: Math.round(h), offsetX: -(MODULE.bodyW * scale - w) / 2, offsetY: -(MODULE.bodyH * scale - h) / 2 };
  }
  return { width: Math.round(MODULE.bodyW * scale), height: Math.round(MODULE.bodyH * scale), offsetX: 0, offsetY: 0 };
}

/** Resolve millimetre geometry into pixel positions for a given zoom. */
export function panelGeometry({ lcd, scale = 16, preset = 'green' }) {
  const p = MODULE;
  const strideX = p.charPitchX;
  const strideY = p.charPitchY;
  const fieldW = (lcd.cols - 1) * strideX + (DOT_COLS - 1) * p.dotPitchX + p.dotSizeX;
  const fieldH = (lcd.rows - 1) * strideY + (DOT_ROWS - 1) * p.dotPitchY + p.dotSizeY;
  const ox = (p.viewW - fieldW) / 2;
  const oy = (p.viewH - fieldH) / 2;
  return {
    scale,
    mm: (v) => v * scale,
    dotPitchX: p.dotPitchX,
    dotPitchY: p.dotPitchY,
    fieldW,
    fieldH,
    /** Pixel origin of a dot, relative to the viewing-area origin. */
    dotOrigin(col, row, i, r) {
      return [
        (ox + col * strideX + i * p.dotPitchX) * scale,
        (oy + row * strideY + r * p.dotPitchY) * scale,
      ];
    },
  };
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, rr);
  else {
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}

/**
 * Render the emulated display.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./hd44780.js').HD44780} lcd
 * @param {object} [opts]
 * @param {string} [opts.preset] key of PANEL_PRESETS
 * @param {number} [opts.scale] pixels per millimetre
 * @param {'photo'|'clean'} [opts.style] 'clean' drops the bezel and optics
 * @param {number} [opts.blinkPhase] 0..1, drives the hardware cursor blink
 * @param {boolean} [opts.bezel] draw the PCB and plastic frame
 */
export function drawPanel(ctx, lcd, opts = {}) {
  const {
    preset = 'green',
    scale = 16,
    style = 'photo',
    blinkPhase = 1,
    crop = 'body',
  } = opts;
  const bezel = opts.bezel ?? (style === 'photo' && crop === 'body');
  const col = PANEL_PRESETS[preset] ?? PANEL_PRESETS.green;
  const geo = panelGeometry({ lcd, scale, preset });
  const photo = style === 'photo';

  const bodyW = MODULE.bodyW * scale;
  const bodyH = MODULE.bodyH * scale;
  const viewW = MODULE.viewW * scale;
  const viewH = MODULE.viewH * scale;
  const viewX = (bodyW - viewW) / 2;
  const viewY = (bodyH - viewH) / 2;

  const size = panelCanvasSize(lcd, { scale, crop });
  ctx.save();
  ctx.clearRect(0, 0, size.width, size.height);
  if (crop === 'view') ctx.translate(size.offsetX, size.offsetY);

  if (bezel) drawBody(ctx, { bodyW, bodyH, viewX, viewY, viewW, viewH, scale });

  // --- the lit field -------------------------------------------------------
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, viewX, viewY, viewW, viewH, scale * 0.3);
  ctx.clip();
  ctx.fillStyle = col.field;
  ctx.fillRect(viewX, viewY, viewW, viewH);

  if (photo && col.glow > 0) {
    const g = ctx.createRadialGradient(
      viewX + viewW / 2, viewY + viewH / 2, 0,
      viewX + viewW / 2, viewY + viewH / 2, viewW * 0.62,
    );
    g.addColorStop(0, col.backlight);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = col.glow;
    ctx.fillStyle = g;
    ctx.fillRect(viewX, viewY, viewW, viewH);
    ctx.globalAlpha = 1;
  }

  // --- the dot grid --------------------------------------------------------
  ctx.save();
  ctx.translate(viewX, viewY);

  const dw = MODULE.dotSizeX * scale;
  const dh = MODULE.dotSizeY * scale;
  const radius = scale * 0.09;

  const cells = [];
  for (let row = 0; row < lcd.rows; row++)
    for (let c = 0; c < lcd.cols; c++) cells.push([c, row, lcd.codeAt(c, row)]);

  // Unlit dots are faintly visible on a real panel: the polariser never blocks
  // completely, so draw the whole lattice first at low contrast.
  ctx.fillStyle = col.offDot;
  ctx.globalAlpha = photo ? col.ghost : 0.55;
  for (const [c, row] of cells) {
    for (let r = 0; r < DOT_ROWS; r++) {
      for (let i = 0; i < DOT_COLS; i++) {
        const [x, y] = geo.dotOrigin(c, row, i, r);
        roundRect(ctx, x, y, dw, dh, radius);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;

  // Lit dots.
  if (photo && col.glow > 0) {
    ctx.shadowColor = col.onGlow;
    ctx.shadowBlur = scale * 0.5;
  }
  // With `levels`, each dot is drawn at its optical state (0..1) rather than
  // its logical one, which is how a dot mid-way through switching looks.
  const { levels } = opts;
  ctx.fillStyle = col.onDot;
  for (const [c, row, code] of cells) {
    const rows = lcd.glyph(code);
    for (let r = 0; r < DOT_ROWS; r++) {
      const bits = rows[r] ?? 0;
      if (!bits && !levels) continue;
      for (let i = 0; i < DOT_COLS; i++) {
        const level = levels ? levels[dotIndex(lcd, c, row, i, r)] : (bits >> (4 - i)) & 1;
        if (level < 0.03) continue;
        ctx.globalAlpha = Math.min(1, level);
        const [x, y] = geo.dotOrigin(c, row, i, r);
        roundRect(ctx, x, y, dw, dh, radius);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // Hardware cursor / blink, if the design turned them on.
  // The underline is steady; the blinking block alternates between all dots
  // on and the character, at 409.6 ms a phase with a 250 kHz clock (HD44780U
  // datasheet). `blinkPhase` <= 0.5 is the block's on phase.
  if (lcd.displayOn && (lcd.cursorOn || lcd.blinkOn)) {
    const [cc, cr] = cursorCell(lcd);
    if (cc >= 0) {
      ctx.fillStyle = col.onDot;
      if (lcd.cursorOn) {
        for (let i = 0; i < DOT_COLS; i++) {
          const [x, y] = geo.dotOrigin(cc, cr, i, 7);
          roundRect(ctx, x, y, dw, dh, radius);
          ctx.fill();
        }
      }
      if (lcd.blinkOn && blinkPhase <= 0.5) {
        for (let r = 0; r < DOT_ROWS; r++)
          for (let i = 0; i < DOT_COLS; i++) {
            const [x, y] = geo.dotOrigin(cc, cr, i, r);
            roundRect(ctx, x, y, dw, dh, radius);
            ctx.fill();
          }
      }
    }
  }

  ctx.restore();

  // --- optics --------------------------------------------------------------
  if (photo) {
    // Polariser sheen: real panels wash out towards one corner.
    const sheen = ctx.createLinearGradient(viewX, viewY, viewX + viewW, viewY + viewH);
    sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
    sheen.addColorStop(0.45, 'rgba(255,255,255,0.02)');
    sheen.addColorStop(1, 'rgba(255,255,255,0.00)');
    ctx.fillStyle = sheen;
    ctx.fillRect(viewX, viewY, viewW, viewH);

    // Inner shadow at the window edge, where the glass meets the bezel.
    const inner = ctx.createLinearGradient(0, viewY, 0, viewY + viewH);
    inner.addColorStop(0, 'rgba(0,0,0,0.16)');
    inner.addColorStop(0.10, 'rgba(0,0,0,0)');
    inner.addColorStop(0.90, 'rgba(0,0,0,0)');
    inner.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = inner;
    ctx.fillRect(viewX, viewY, viewW, viewH);
  }
  ctx.restore();
  ctx.restore();

  return { bodyW, bodyH, viewX, viewY, viewW, viewH };
}

/** Position of one dot in a flat per-dot array covering the whole glass. */
export function dotIndex(lcd, col, row, i, r) {
  return ((row * lcd.cols + col) * DOT_ROWS + r) * DOT_COLS + i;
}

/** Every visible dot of the display as 0/1, in `dotIndex` order. */
export function dotStates(lcd) {
  const out = new Float32Array(lcd.cols * lcd.rows * DOT_ROWS * DOT_COLS);
  for (let row = 0; row < lcd.rows; row++)
    for (let c = 0; c < lcd.cols; c++) {
      const rows = lcd.glyph(lcd.codeAt(c, row));
      for (let r = 0; r < DOT_ROWS; r++)
        for (let i = 0; i < DOT_COLS; i++)
          out[dotIndex(lcd, c, row, i, r)] = (rows[r] >> (4 - i)) & 1;
    }
  return out;
}

/** Where the hardware cursor currently sits, in visible cells. */
function cursorCell(lcd) {
  for (let row = 0; row < lcd.rows; row++)
    for (let c = 0; c < lcd.cols; c++)
      if (lcd.addressOf(c, row) === lcd.ac) return [c, row];
  return [-1, -1];
}

/** PCB, plastic frame, mounting holes and pin header. */
function drawBody(ctx, { bodyW, bodyH, viewX, viewY, viewW, viewH, scale }) {
  // PCB
  const pcb = ctx.createLinearGradient(0, 0, 0, bodyH);
  pcb.addColorStop(0, '#1d5c33');
  pcb.addColorStop(0.5, '#17492a');
  pcb.addColorStop(1, '#0f3520');
  ctx.fillStyle = pcb;
  roundRect(ctx, 0, 0, bodyW, bodyH, scale * 0.4);
  ctx.fill();

  // Bezel
  const bez = ctx.createLinearGradient(0, viewY - scale * 2, 0, viewY + viewH + scale * 2);
  bez.addColorStop(0, '#2b2b30');
  bez.addColorStop(0.5, '#17171a');
  bez.addColorStop(1, '#0c0c0e');
  ctx.fillStyle = bez;
  roundRect(ctx, viewX - scale * 1.6, viewY - scale * 1.6,
    viewW + scale * 3.2, viewH + scale * 3.2, scale * 0.6);
  ctx.fill();

  // Mounting holes
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (const [hx, hy] of [[2.5, 2.5], [bodyW - 2.5, 2.5], [2.5, bodyH - 2.5], [bodyW - 2.5, bodyH - 2.5]]) {
    ctx.beginPath();
    ctx.arc(hx * 1, hy * 1, scale * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pin header, sitting on the PCB above the bezel
  const hdrY = scale * 0.35;
  const hdrH = scale * 1.1;
  ctx.fillStyle = '#0a0a0c';
  roundRect(ctx, scale * 4, hdrY, bodyW - scale * 8, hdrH, scale * 0.12);
  ctx.fill();
  ctx.fillStyle = '#c8a24a';
  const pins = 16;
  for (let i = 0; i < pins; i++) {
    const x = scale * 4.7 + i * ((bodyW - scale * 9.4) / (pins - 1));
    ctx.fillRect(x - scale * 0.09, hdrY + scale * 0.15, scale * 0.18, hdrH - scale * 0.3);
  }
}