// A colour TFT face, run by the TFT skill's ST7735S emulator and glass model.
//
// Each frame continues from the last controller; the glass follows the
// frames sent through the liquid crystal's rise and fall lag, as in the
// skill's live view. The glass and board around the active area never
// change, so they are painted once and only the active area after that.

import { buildFrame, transmittance, moduleOf, fpsOf, DESIGNS } from '../lazy/tft.js';
import { paintGlass, layout } from '../../skills/tft-clock/sim/js/panel.js';
import { loadDesign } from './load.js';

const DESIGN_DIR = new URL('../../skills/tft-clock/sim/designs/', import.meta.url);

export async function make(key, file, opts, canvas) {
  const design = await loadDesign(DESIGNS, DESIGN_DIR, key, file);
  const fps = fpsOf(design);
  const mod = moduleOf(design);
  const ctx = canvas.getContext('2d');
  let o = { scale: 11, crop: 'glass', style: 'photo', room: 'dark', night: 'auto', tear: false };
  let gen = null, lastK = null, lcd = null, state = null;
  let L = null, full = null, active = null, surround = null;   // surround: the key it was painted for

  function configure(next) {
    if (next.night !== undefined && next.night !== o.night) lcd = null;
    o = { ...o, ...next };
    L = layout(mod, { scale: o.scale, crop: o.crop });
    if (canvas.width !== L.width || canvas.height !== L.height) { canvas.width = L.width; canvas.height = L.height; }
    full = ctx.createImageData(L.width, L.height);
    active = o.crop === 'view' ? full : ctx.createImageData(L.aw, L.ah);
    surround = null;
  }

  function paint(backlight) {
    const p = { scale: o.scale, style: o.style, room: o.room, backlight };
    const key = `${o.crop}|${o.room}|${o.scale}`;
    if (o.crop === 'view' || surround !== key) {
      paintGlass(mod, state, { ...p, crop: o.crop, into: full.data });
      ctx.putImageData(full, 0, 0);
      surround = key;
    } else {
      paintGlass(mod, state, { ...p, crop: 'view', into: active.data });
      ctx.putImageData(active, L.ox, L.oy);
    }
  }

  configure(opts);
  return {
    configure,
    tick(c) {
      if (c.gen !== gen) { gen = c.gen; lastK = null; lcd = null; state = null; }
      const k = Math.floor(c.t * fps + 1e-6);
      if (k === lastK) return false;
      const tk = k / fps;
      const steps = lastK === null ? 1 : Math.min(4, Math.max(1, k - lastK));
      const built = buildFrame(design, { t: tk, date: new Date(c.epoch + tk * 1000), prev: lcd, night: o.night });
      lcd = built.lcd;
      const T = transmittance(lcd, mod, o.tear ? { tear: true, t: tk + 0.5 / fps, frameStart: tk } : {});
      if (!state || state.length !== T.length) state = Float32Array.from(T);
      else {
        const dt = steps / fps, { rise, fall } = mod.panel.response;
        const ar = 1 - Math.exp(-dt / rise), af = 1 - Math.exp(-dt / fall);
        for (let i = 0; i < state.length; i++) { const d = T[i] - state[i]; state[i] += d * (d > 0 ? ar : af); }
      }
      lastK = k;
      paint(lcd.backlight);
      return true;
    },
  };
}
