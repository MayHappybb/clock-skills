// Draws the glass, and optionally the module around it, so a render reads as
// a photograph of the real part at its real proportions.
//
// Everything is laid out in millimetres from the module's mechanical drawing
// (modules.js) and then scaled, so the pixel pitch, the fill factor, the
// dual-colour gap and the PCB stay in proportion at any zoom.
//
// An OLED pixel emits light; an unlit one is black glass. So, unlike an LCD,
// there is no visible unlit-dot lattice in a normal room: the 'photo' style
// shows a trace of it only where a lit neighbour's bloom catches it.

/** Emission colours. `rgb` is what a lit pixel looks like on a photo. */
export const COLOURS = {
  white: { label: 'white', rgb: [236, 244, 255], glow: [190, 215, 255] },
  blue: { label: 'blue', rgb: [70, 200, 255], glow: [30, 140, 255] },
  yellow: { label: 'yellow', rgb: [255, 214, 40], glow: [255, 170, 0] },
  green: { label: 'green', rgb: [90, 255, 140], glow: [40, 220, 90] },
};

/**
 * Canvas size for a render.
 * @param {object} mod module from modules.js
 * @param {'view'|'glass'|'body'} crop
 */
export function canvasSize(mod, { scale, crop = 'view', colour }) {
  if (colour !== undefined && colour !== 'yellow-blue') mod = { ...mod, zones: null };
  const box = cropBox(mod, crop);
  return { width: Math.round(box.w * scale), height: Math.round(box.h * scale), box };
}

/** The millimetre box a crop covers, in module coordinates (PCB top-left = 0,0). */
export function cropBox(mod, crop) {
  const ax = mod.glass.x + mod.active.x, ay = mod.glass.y + mod.active.y;
  if (crop === 'body') return { x: 0, y: 0, w: mod.pcb.w, h: mod.pcb.h };
  if (crop === 'glass') return { x: mod.glass.x, y: mod.glass.y, w: mod.glass.w, h: mod.glass.h };
  // 'view': the active area plus a margin of one pixel pitch.
  const m = mod.pitch.x * 1.5;
  return { x: ax - m, y: ay - m, w: mod.active.w + 2 * m, h: mod.active.h + 2 * m + (mod.zones?.gap ?? 0) };
}

/** Centre of physical pixel (x, y) in module millimetres. */
export function pixelCentre(mod, x, y) {
  const ax = mod.glass.x + mod.active.x, ay = mod.glass.y + mod.active.y;
  const gapY = mod.zones && y >= mod.zones.split ? mod.zones.gap : 0;
  return [ax + mod.pixel.w / 2 + x * mod.pitch.x, ay + mod.pixel.h / 2 + y * mod.pitch.y + gapY];
}

/** The emission colour of physical row y on this panel colour. */
export function rowColour(mod, colour, y) {
  if (colour === 'yellow-blue') return COLOURS[y < (mod.zones?.split ?? 16) ? 'yellow' : 'blue'];
  return COLOURS[colour] ?? COLOURS.white;
}

const rgba = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`;

/** One scratch canvas, resized only when the frame size changes. */
let scratchCanvas = null;
function scratch(width, height) {
  if (!scratchCanvas) scratchCanvas = new OffscreenCanvas(width, height);
  if (scratchCanvas.width !== width || scratchCanvas.height !== height) {
    scratchCanvas.width = width;
    scratchCanvas.height = height;
  }
  return scratchCanvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

/**
 * Paint the display.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} mod module from modules.js
 * @param {Float32Array} levels physical pixel brightness 0..1, row-major, mod.cols x mod.rows
 * @param {object} opts
 * @param {string} opts.colour key of COLOURS, or 'yellow-blue'
 * @param {number} opts.scale pixels per millimetre
 * @param {'photo'|'clean'} opts.style
 * @param {'view'|'glass'|'body'} opts.crop
 */
export function drawPanel(ctx, mod, levels, { colour = 'white', scale = 30, style = 'photo', crop = 'view' } = {}) {
  // Only the dual-colour glass has two zones, and the gap between them.
  if (colour !== 'yellow-blue') mod = { ...mod, zones: null };
  const { box, width, height } = canvasSize(mod, { scale, crop });
  const photo = style === 'photo';
  const mm = (v) => v * scale;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.translate(-mm(box.x), -mm(box.y));

  if (photo && crop === 'body') drawBoard(ctx, mod, scale);
  if (photo) drawGlass(ctx, mod, scale);

  // Pixels. Bloom first (a soft pass), then the crisp emitters on top.
  const pw = mm(mod.pixel.w), ph = mm(mod.pixel.h);
  const corner = Math.min(pw, ph) * 0.18;
  if (photo) {
    // Drawn unblurred to a scratch canvas, then blurred once as a whole.
    // The scratch canvas is reused from frame to frame: allocating one per
    // frame made a 300-frame render hold gigabytes until garbage collection.
    const glow = scratch(width, height);
    const gc = glow.getContext('2d');
    gc.setTransform(1, 0, 0, 1, 0, 0);
    gc.clearRect(0, 0, width, height);
    gc.translate(-mm(box.x), -mm(box.y));
    for (let y = 0; y < mod.rows; y++) {
      const col = rowColour(mod, colour, y);
      for (let x = 0; x < mod.cols; x++) {
        const v = levels[y * mod.cols + x];
        if (v < 0.02) continue;
        const [cx, cy] = pixelCentre(mod, x, y);
        gc.fillStyle = rgba(col.glow, 0.45 * v);
        gc.fillRect(mm(cx) - pw * 0.7, mm(cy) - ph * 0.7, pw * 1.4, ph * 1.4);
      }
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = `blur(${Math.max(1, mm(mod.pitch.x) * 0.9)}px)`;
    ctx.drawImage(glow, 0, 0);
    ctx.restore();
  }
  for (let y = 0; y < mod.rows; y++) {
    const col = rowColour(mod, colour, y);
    for (let x = 0; x < mod.cols; x++) {
      const v = levels[y * mod.cols + x];
      const [cx, cy] = pixelCentre(mod, x, y);
      if (v < 0.02) {
        if (photo) {
          // The unlit emitter: barely visible structure in the black glass.
          ctx.fillStyle = 'rgba(40,44,52,0.07)';
          roundRect(ctx, mm(cx) - pw / 2, mm(cy) - ph / 2, pw, ph, corner);
          ctx.fill();
        }
        continue;
      }
      // Perceived brightness: levels are linear light, the canvas is sRGB.
      const a = Math.pow(Math.min(1, v), 1 / 2.2);
      ctx.fillStyle = rgba(col.rgb.map((c) => Math.round(c * a)), 1);
      roundRect(ctx, mm(cx) - pw / 2, mm(cy) - ph / 2, pw, ph, corner);
      ctx.fill();
    }
  }

  if (photo) {
    // Glass sheen across the whole panel.
    const gx = mm(mod.glass.x), gy = mm(mod.glass.y), gw = mm(mod.glass.w), gh = mm(mod.glass.h);
    const sheen = ctx.createLinearGradient(gx, gy, gx + gw * 0.7, gy + gh);
    sheen.addColorStop(0, 'rgba(255,255,255,0.045)');
    sheen.addColorStop(0.35, 'rgba(255,255,255,0.015)');
    sheen.addColorStop(0.6, 'rgba(255,255,255,0.0)');
    sheen.addColorStop(1, 'rgba(255,255,255,0.03)');
    ctx.fillStyle = sheen;
    ctx.fillRect(gx, gy, gw, gh);
  }
  ctx.restore();
  return { width, height };
}

/** The glass: a black slab, the active area's faint outline, the flex tail. */
function drawGlass(ctx, mod, scale) {
  const mm = (v) => v * scale;
  const g = mod.glass;
  // Flex cable, folded behind the board: a strip of amber polyimide past the glass edge.
  if (mod.fpc) {
    ctx.fillStyle = '#b8761c';
    const f = mod.fpc;
    ctx.fillRect(mm(f.x), mm(f.y), mm(f.w), mm(f.h));
  }
  const grad = ctx.createLinearGradient(0, mm(g.y), 0, mm(g.y + g.h));
  grad.addColorStop(0, '#111215');
  grad.addColorStop(1, '#08090a');
  ctx.fillStyle = grad;
  roundRect(ctx, mm(g.x), mm(g.y), mm(g.w), mm(g.h), mm(0.3));
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = Math.max(1, mm(0.06));
  ctx.stroke();
  // The encapsulated area is very slightly lighter than the bare glass round it.
  ctx.fillStyle = 'rgba(30,33,40,0.30)';
  const a = mod.active, m = mod.pitch.x * 0.8;
  ctx.fillRect(mm(g.x + a.x - m), mm(g.y + a.y - m), mm(a.w + 2 * m), mm(a.h + 2 * m + (mod.zones?.gap ?? 0)));
}

/** PCB, holes, header and silkscreen. */
function drawBoard(ctx, mod, scale) {
  const mm = (v) => v * scale;
  const b = mod.pcb;
  const grad = ctx.createLinearGradient(0, 0, mm(b.w), mm(b.h));
  grad.addColorStop(0, b.colour ?? '#1f4fa8');
  grad.addColorStop(1, b.shade ?? '#173d85');
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, mm(b.w), mm(b.h), mm(b.r ?? 0.8));
  ctx.fill();
  for (const [hx, hy, hr] of b.holes ?? []) {
    ctx.fillStyle = '#d6b45a';
    ctx.beginPath(); ctx.arc(mm(hx), mm(hy), mm(hr + 0.45), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#050505';
    ctx.beginPath(); ctx.arc(mm(hx), mm(hy), mm(hr), 0, Math.PI * 2); ctx.fill();
  }
  const hdr = b.header;
  if (hdr) {
    hdr.pins.forEach((label, i) => {
      const [px, py] = hdr.vertical ? [hdr.x, hdr.y + i * 2.54] : [hdr.x + i * 2.54, hdr.y];
      ctx.fillStyle = '#d6b45a';
      ctx.beginPath(); ctx.arc(mm(px), mm(py), mm(0.85), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(mm(px - 0.32), mm(py - 0.32), mm(0.64), mm(0.64));
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `600 ${mm(0.95)}px Helvetica, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (hdr.vertical) { ctx.textAlign = 'left'; ctx.fillText(label, mm(px + 1.3), mm(py)); }
      else ctx.fillText(label, mm(px), mm(py + (hdr.labelBelow ? 1.7 : -1.7)));
    });
  }
}
