// An LED board / HUB75 face, run by the WS2812 skill's runner and light model.
//
// The light is drawn by the skill's WebGL2 renderer (glrender.js). A page
// gets only a handful of WebGL contexts, so every LED face in a worker shares
// one: each face has its own renderer (programs, textures, scene) on that
// context, draws into the corner of one shared canvas, and copies the result
// onto its own 2D canvas. Without WebGL2 it falls back to the CPU renderer.

import { runner, DESIGNS } from '../lazy/led.js';
import { renderFrame, frameSize } from '../../skills/ws2812-clock/sim/js/render.js';
import { createGLRenderer } from '../../skills/ws2812-clock/sim/js/glrender.js';
import { loadDesign } from './load.js';

const DESIGN_DIR = new URL('../../skills/ws2812-clock/sim/designs/', import.meta.url);

const GL_MAX_SCALE = 24, CPU_MAX_SCALE = 4;   // px per mm, as the skill's live view caps them

let shared;   // { canvas, gl } once tried; null when WebGL2 is missing
function sharedGL() {
  if (shared === undefined) {
    const canvas = new OffscreenCanvas(64, 64);
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
    shared = gl && gl.getExtension('EXT_color_buffer_float') ? { canvas, gl } : null;
  }
  return shared;
}

/** A glrender.js renderer on the shared context. It sizes a stand-in canvas; the real one only grows. */
function glRenderer() {
  const S = sharedGL();
  if (!S) return null;
  const stand = {
    w: 1, h: 1,
    getContext: () => S.gl,
    get width() { return this.w; },
    set width(v) { this.w = v; if (S.canvas.width < v) S.canvas.width = v; },
    get height() { return this.h; },
    set height(v) { this.h = v; if (S.canvas.height < v) S.canvas.height = v; },
  };
  const r = createGLRenderer(stand);
  return r && { ...r, stand, S };
}

export async function make(key, file, opts, canvas) {
  const design = await loadDesign(DESIGNS, DESIGN_DIR, key, file);
  const ctx = canvas.getContext('2d');
  const gl = glRenderer();
  let o = { scale: 3, layout: undefined, look: undefined, gap: undefined, room: 'dark', night: 'auto' };
  let run = null, scene = null, date0 = null, lastK = null, gen = null;

  function restart(epoch) {
    date0 = new Date(epoch);
    run = runner(design, { layout: o.layout, date0, night: o.night });
    lastK = null;
    setScene();
  }
  function setScene() {
    if (!run) return;
    const look = typeof design.look === 'object' ? design.look : { look: design.look ?? 'bare' };
    const scale = Math.min(o.scale, gl ? GL_MAX_SCALE : CPU_MAX_SCALE);
    scene = { look: o.look ?? look.look ?? 'bare', gap: Number(o.gap ?? look.gap ?? 8), room: o.room, scale };
    const size = gl ? gl.setScene(run.layout, scene) : frameSize(run.layout, scene);
    if (canvas.width !== size.width || canvas.height !== size.height) { canvas.width = size.width; canvas.height = size.height; }
    lastK = null;
  }

  function configure(next) {
    const rerun = (next.layout !== undefined && next.layout !== o.layout) || (next.night !== undefined && next.night !== o.night);
    o = { ...o, ...next };
    if (rerun) run = null; else setScene();
  }

  configure(opts);
  return {
    configure,
    tick(c) {
      // The runner replays a stateful design's history itself after a jump, so
      // it is only rebuilt (a big layout is slow to build) when the clock
      // jumps back before the time it started from.
      if (c.gen !== gen) { gen = c.gen; lastK = null; if (run && c.sim < date0.getTime()) run = null; }
      if (!run) restart(c.epoch);
      const t = (c.sim - date0.getTime()) / 1000;
      const k = Math.floor(t * run.fps + 1e-6);
      if (k === lastK) return false;
      lastK = k;
      const f = run.at(k / run.fps);
      if (gl) {
        gl.draw(f.duty);
        const { w, h } = gl.stand;
        ctx.drawImage(gl.S.canvas, 0, gl.S.canvas.height - h, w, h, 0, 0, w, h);
      } else {
        const img = renderFrame(run.layout, f.duty, scene);
        ctx.putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);
      }
      return true;
    },
  };
}
