// A 16x2 character LCD face, run by the 1602 skill's own emulator and painter.
//
// As in the skill's live view: the design is asked for a frame at its own
// rate, and between frames the glass relaxes toward the last frame sent with
// the liquid crystal's time constant. Painting stops once the glass settles.
//
// Two painters. 'exact' is the skill's drawPanel, used in the focus view. It
// fills 1,280 rounded dots a frame, the lit ones with a shadow blur for the
// backlight's glow; a hall of those repainting through the lag took the page
// down to 2 fps. 'fast' (the hall) asks drawPanel once for the module with
// every dot off and once with every dot on, and mixes the two per dot by its
// level. drawPanel draws a dot at alpha = level over the same background, so
// within a dot that mix is what it would draw. The hardware cursor is not in
// either picture, so frames that show it go through drawPanel.

import { buildFrame, relax, DESIGNS } from '../lazy/1602.js';
import { drawPanel, panelCanvasSize, panelGeometry, dotStates, dotIndex, RESPONSE, MODULE } from '../../skills/1602-clock/sim/js/panel.js';
import { DOT_COLS, DOT_ROWS } from '../../skills/1602-clock/sim/js/hd44780.js';
import { loadDesign } from './load.js';

const DESIGN_DIR = new URL('../../skills/1602-clock/sim/designs/', import.meta.url);

const SETTLED = 0.004;   // largest dot difference still worth a repaint

export async function make(key, file, opts, canvas) {
  const design = await loadDesign(DESIGNS, DESIGN_DIR, key, file);
  const fps = Number(design.fps ?? 30);
  const turned = design.rotate === 90;
  const ctx = canvas.getContext('2d');
  let o = { scale: 4, style: 'photo', crop: 'body', response: 'typ', preset: undefined, painter: 'exact' };
  let flat = null, fast = null;
  let gen = null, lastK = null, target = null, levels = null, blink = null, settled = false, lcd = null;

  const paintOpts = () => ({ preset: o.preset ?? design.panel ?? 'green', scale: o.scale, style: o.style, crop: o.crop });

  function configure(next) {
    o = { ...o, ...next };
    const s = panelCanvasSize(null, o);
    const w = turned ? s.height : s.width, h = turned ? s.width : s.height;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    flat = turned ? new OffscreenCanvas(s.width, s.height) : null;
    fast = null;     // rebuilt on the next paint, from the controller then
    settled = false;
  }

  function paint(t) {
    const phase = Math.floor(t / 0.4096) % 2 ? 1 : 0.2;   // the hardware cursor blink
    blink = phase;
    const into = turned ? flat.getContext('2d') : ctx;
    const cursor = lcd.displayOn && (lcd.cursorOn || lcd.blinkOn);
    if (o.painter === 'fast' && !cursor) {
      fast ??= fastPainter(lcd, paintOpts());
      fast(into, levels);
    } else {
      into.setTransform(1, 0, 0, 1, 0, 0);
      drawPanel(into, lcd, { ...paintOpts(), levels, blinkPhase: phase });
    }
    if (!turned) return;
    // Upright modules are drawn flat and turned a quarter clockwise, as player.js paint() does.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(flat, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  configure(opts);
  return {
    configure,
    tick(c) {
      if (c.gen !== gen) { gen = c.gen; lastK = null; levels = null; }
      const k = Math.floor(c.t * fps + 1e-6);
      let fresh = false;
      if (k !== lastK) {
        const tk = k / fps;
        const out = buildFrame(key, { t: tk, date: new Date(c.epoch + tk * 1000) });
        const next = dotStates(out.lcd);
        if (!levels || levels.length !== next.length) { levels = Float32Array.from(next); settled = false; }
        else if (!(settled && target && next.every((v, i) => v === target[i]))) settled = false;
        lcd = out.lcd; target = next; lastK = k; fresh = true;
      }
      const phase = Math.floor(c.t / 0.4096) % 2 ? 1 : 0.2;
      if (!settled) {
        const tau = RESPONSE[o.response];
        if (tau) relax(levels, target, c.dt, tau); else levels.set(target);
        let d = 0;
        for (let i = 0; i < levels.length; i++) d = Math.max(d, Math.abs(levels[i] - target[i]));
        settled = d < SETTLED;
        paint(c.t);
      } else if (phase !== blink) paint(c.t);
      return fresh;
    },
  };
}

/** The 'fast' painter: drawPanel's all-off and all-on pictures, mixed per dot. Returns paint(ctx, levels). */
function fastPainter(lcd, opts) {
  const size = panelCanvasSize(lcd, opts);
  const { width, height } = size;
  // A stand-in controller for the two references: what drawPanel reads when
  // it is given levels, with the cursor off.
  const still = { cols: lcd.cols, rows: lcd.rows, codeAt: () => 0x20, glyph: () => new Array(DOT_ROWS).fill(0), displayOn: false, cursorOn: false, blinkOn: false };
  const n = lcd.cols * lcd.rows * DOT_ROWS * DOT_COLS;
  const shot = (level) => {
    const c = new OffscreenCanvas(width, height), g = c.getContext('2d', { willReadFrequently: true });
    drawPanel(g, still, { ...opts, levels: new Float32Array(n).fill(level), blinkPhase: 1 });
    return g.getImageData(0, 0, width, height).data;
  };
  const off = shot(0), on = shot(1);
  const frame = new ImageData(width, height), F = frame.data;
  F.set(off);

  // Which dot each canvas pixel belongs to: a dot's own rectangle plus half
  // the gap to its neighbours inside a character cell.
  const s = opts.scale, geo = panelGeometry({ lcd, scale: s });
  const vx = (MODULE.bodyW - MODULE.viewW) / 2 * s + (opts.crop === 'view' ? size.offsetX : 0);
  const vy = (MODULE.bodyH - MODULE.viewH) / 2 * s + (opts.crop === 'view' ? size.offsetY : 0);
  const padX = (MODULE.dotPitchX - MODULE.dotSizeX) / 2 * s, padY = (MODULE.dotPitchY - MODULE.dotSizeY) / 2 * s;
  const dw = MODULE.dotSizeX * s, dh = MODULE.dotSizeY * s;
  const pixels = [], owners = [];
  for (let row = 0; row < lcd.rows; row++)
    for (let c = 0; c < lcd.cols; c++)
      for (let r = 0; r < DOT_ROWS; r++)
        for (let i = 0; i < DOT_COLS; i++) {
          const [x, y] = geo.dotOrigin(c, row, i, r);
          const x0 = Math.max(0, Math.round(vx + x - padX)), x1 = Math.min(width, Math.round(vx + x + dw + padX));
          const y0 = Math.max(0, Math.round(vy + y - padY)), y1 = Math.min(height, Math.round(vy + y + dh + padY));
          const d = dotIndex(lcd, c, row, i, r);
          for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) { pixels.push(py * width + px); owners.push(d); }
        }
  const at = Int32Array.from(pixels), who = Int32Array.from(owners);

  return function paint(ctx, levels) {
    for (let k = 0; k < at.length; k++) {
      const v = Math.min(1, levels[who[k]]), p = at[k] * 4;
      if (v < 0.03) { F[p] = off[p]; F[p + 1] = off[p + 1]; F[p + 2] = off[p + 2]; F[p + 3] = off[p + 3]; continue; }
      F[p] = off[p] + (on[p] - off[p]) * v;
      F[p + 1] = off[p + 1] + (on[p + 1] - off[p + 1]) * v;
      F[p + 2] = off[p + 2] + (on[p + 2] - off[p + 2]) * v;
      F[p + 3] = off[p + 3] + (on[p + 3] - off[p + 3]) * v;
    }
    ctx.putImageData(frame, 0, 0);
  };
}
