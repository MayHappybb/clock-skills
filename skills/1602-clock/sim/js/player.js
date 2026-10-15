// Deterministic driver: turns "design X at animation time t" into a fully
// populated emulator plus a rendered canvas. Rendering a specific time is what
// makes frames reviewable and comparable, so every screenshot, contact sheet
// and animation frame goes through here.

import { HD44780 } from './hd44780.js';
import { drawPanel, panelCanvasSize, dotStates, RESPONSE } from './panel.js';
import * as kit from './kit.js';
import DESIGNS from '../designs/index.js';

export { DESIGNS };

/** Fixed date the clock is anchored to, so renders are reproducible. */
const BASE_DATE = new Date(2026, 9, 1); // 1 Oct 2026, local time

/**
 * Wall clock for a render: the `clock` param sets the displayed time at t = 0,
 * and the clock then advances one second per second of animation time.
 * @param {string} clock 'HH:MM:SS'
 * @param {number} t seconds
 */
export function dateFor(clock, t = 0) {
  const [h = 10, m = 9, s = 30] = String(clock).split(':').map(Number);
  const d = new Date(BASE_DATE);
  d.setHours(h, m, s, 0);
  return new Date(d.getTime() + t * 1000);
}

/**
 * Run a design up to time `t` and return the resulting controller state.
 * @param {string} name design key
 * @param {object} [opts]
 */
export function buildFrame(name, opts = {}) {
  const design = DESIGNS[name];
  if (!design) throw new Error(`unknown design '${name}' (have: ${Object.keys(DESIGNS).join(', ')})`);
  const { t = 0, clock = '10:09:30', bus } = opts;

  const lcd = new HD44780({ bus: bus ?? design.bus ?? 'i2c100' });
  const api = { ...kit, DESIGNS };
  design.setup?.(lcd, api);

  // `date` overrides the clock, for the live view running on real time.
  const date = opts.date ?? dateFor(clock, t);
  lcd.beginFrame();
  design.frame?.(lcd, api, { t, date, kit: api, fields: kit.clockFields(date) });

  return { lcd, design, report: lcd.report(), date };
}

/**
 * What the glass actually shows at time `t`, as a 0..1 level per dot.
 *
 * The controller switches a dot instantly; the liquid crystal over it takes
 * 150-200 ms to follow. So the picture at `t` is the design's recent frames
 * blended through a first-order lag. The hardware only changes at the design's
 * own frame rate, so frames are sampled on that grid, far enough back (eight
 * time constants) that anything older has no visible effect.
 *
 * @param {string} name design key
 * @param {object} opts buildFrame options; `t` is the instant to show
 * @param {number} tau liquid-crystal time constant, seconds
 */
export function opticalLevels(name, opts, tau) {
  const design = DESIGNS[name];
  const fps = design.fps ?? 30;
  const t = opts.t ?? 0;
  const last = Math.floor(t * fps + 1e-9);
  const first = last - Math.ceil(8 * tau * fps);

  let level = null, target = null, prevT = 0;
  for (let k = first; k <= last; k++) {
    const tk = k / fps;
    const next = dotStates(buildFrame(name, { ...opts, t: tk }).lcd);
    if (!level) level = Float32Array.from(next);
    else relax(level, target, tk - prevT, tau);
    target = next;
    prevT = tk;
  }
  // Show the frame sent at or before `t` as it looks at the end of its time on
  // screen, just before the next one replaces it. Sampling at the instant it
  // was sent would show the glass not yet having moved at all.
  relax(level, target, 1 / fps, tau);
  return level;
}

/** Move every dot `dt` seconds of the way along its lag towards `target`. */
export function relax(level, target, dt, tau) {
  const a = 1 - Math.exp(-Math.max(0, dt) / tau);
  for (let i = 0; i < level.length; i++) level[i] += (target[i] - level[i]) * a;
}

/**
 * Build a frame and paint it onto a canvas.
 *
 * `response` is 'typ' (default), 'max' or 'off': whether to show the liquid
 * crystal's switching lag, at the datasheet's typical or worst-case time.
 * @param {HTMLCanvasElement} canvas
 */
export function renderToCanvas(canvas, name, opts = {}) {
  const { preset, scale = 16, style = 'photo', crop = 'body', response = 'typ', ...rest } = opts;
  const tau = RESPONSE[response];
  // With the lag on, the controller holds the last frame sent at or before t.
  const fps = DESIGNS[name]?.fps ?? 30;
  const shown = tau ? { ...rest, t: Math.floor((rest.t ?? 0) * fps + 1e-9) / fps } : rest;
  const { lcd, design, report } = buildFrame(name, shown);
  const levels = tau ? opticalLevels(name, rest, tau) : undefined;
  const panel = preset ?? design.panel ?? 'green';
  const size = paint(canvas, lcd, { preset: panel, scale, style, crop, levels, t: rest.t ?? 0, rotate: design.rotate });
  return { lcd, design, report, size, panel };
}

/**
 * Paint an already-built controller onto a canvas, sizing the canvas to fit.
 * `levels` (from `dotStates`/`relax`) draws the glass's optical state instead
 * of the logical one.
 *
 * `rotate: 90` shows the module turned a quarter turn clockwise, as it is
 * mounted for a portrait design: the module's left edge is at the top and its
 * top row of cells is the right-hand column. The panel is drawn as usual and
 * then turned, so the dot geometry is exactly the landscape one.
 */
export function paint(canvas, lcd, { preset = 'green', scale = 16, style = 'photo', crop = 'body', levels, t = 0, rotate = 0 } = {}) {
  const size = panelCanvasSize(lcd, { scale, crop });
  const turned = rotate === 90;
  const outW = turned ? size.height : size.width, outH = turned ? size.width : size.height;
  if (canvas.width !== outW || canvas.height !== outH) {
    canvas.width = outW;
    canvas.height = outH;
    canvas.style.width = `${outW}px`;
    canvas.style.height = `${outH}px`;
  }
  const opts = { preset, scale, style, crop, levels, blinkPhase: Math.floor(t / 0.4096) % 2 ? 1 : 0.2 };
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!turned) {
    drawPanel(ctx, lcd, opts);
    return size;
  }
  const flat = canvas.ownerDocument.createElement('canvas');
  flat.width = size.width;
  flat.height = size.height;
  drawPanel(flat.getContext('2d'), lcd, opts);
  ctx.clearRect(0, 0, outW, outH);
  ctx.translate(outW, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(flat, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { ...size, width: outW, height: outH };
}

/** Every design key, in registry order. */
export const designNames = () => Object.keys(DESIGNS);