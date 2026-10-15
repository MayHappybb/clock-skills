// Deterministic driver: "design X at animation time t" -> the controller in
// the state firmware would leave it in -> what the glass shows.
//
// Every frame is built the same way:
//   1. power up the controller and run the module's init sequence (free)
//   2. replay the previous frame (t - 1/fps) uncosted, so memory and
//      registers hold what the last frame left there
//   3. build this frame with the meters running: the design draws into an
//      RGB565 canvas (its work counted), the driver sends it, and the
//      design's register requests (invert, idle, gamma, display) go out only
//      where they change
// Step 2 is what makes the dirty driver's cost and the tearing model honest
// without the design keeping any state of its own.

import { ST7735, BUSES, RAM_W, RAM_H, CMD } from './st7735.js';
import { initSequence, flush } from './driver.js';
import { MODULES } from './modules.js';
import { counting, MATH, estimate } from './cost.js';
import * as kit from './kit.js';
import DESIGNS from '../designs/index.js';

export { DESIGNS, MODULES, BUSES };

/** Fixed date renders are anchored to, so they are reproducible. */
const BASE_DATE = new Date(2026, 9, 2); // 2 Oct 2026, local time

/** Wall clock at animation time t, given the clock shown at t = 0 ('HH:MM:SS', seconds may carry a fraction). */
export function dateFor(clock, t = 0) {
  const [h = 10, m = 9, s = 30] = String(clock).split(':').map(Number);
  const d = new Date(BASE_DATE);
  d.setHours(h, m, Math.floor(s), Math.round((s % 1) * 1000));
  return new Date(d.getTime() + t * 1000);
}

export function moduleOf(design, override) {
  const key = override ?? design.module ?? 'air101-lcd';
  const mod = MODULES[key];
  if (!mod) throw new Error(`unknown module '${key}' (have: ${Object.keys(MODULES).join(', ')})`);
  return { key, ...mod };
}

/** Frames per second a design is sent at: the override if given, else its own. */
export function fpsOf(design, override) {
  const f = Number(override ?? design?.fps ?? 30);
  return Number.isFinite(f) && f > 0 ? f : 30;
}

/**
 * What a design can ask of the hardware from `ctx.lcd`, per frame. Anything
 * not asked for this frame goes back to its boot value, so each frame fully
 * defines it, like the pixels.
 */
function makeControls() {
  const want = {};
  return {
    want,
    /** Backlight, 0..1: the PWM duty on the BL pin. The only brightness control there is; it dims the whole glass. */
    backlight(v) { want.backlight = kit.clamp(Number(v), 0, 1); return this; },
    /** Colour inversion, for free: the controller flips every value (INVON/INVOFF toggled from the module's setting). */
    invert(on = true) { want.invert = !!on; return this; },
    /** Idle mode (IDMON): eight colours, each channel's top bit only. */
    idle(on = true) { want.idle = !!on; return this; },
    /** Display on/off (DISPON/DISPOFF): off shows black, memory kept. */
    display(on = true) { want.displayOn = !!on; return this; },
    /** Gamma curve select (GAMSET): 1..4, see references/hardware.md. */
    gamma(n) { want.gamma = 1 << (kit.clamp(Math.round(n), 1, 4) - 1); return this; },
  };
}

/** Run the design once and push it into `lcd`. */
function runFrame(lcd, design, mod, { t, date, fps, night = 'auto', meter = false, host }) {
  const g = new kit.Gfx(mod.cols, mod.rows);
  const controls = makeControls();
  const ctx = {
    t, date, fields: kit.clockFields(date), kit, fps,
    night: kit.nightLevel(date, night),
    W: mod.cols, H: mod.rows, module: mod, lcd: controls,
  };
  let est = null;
  if (meter) {
    counting(() => design.frame(g, ctx));
    est = estimate(g.cost, { ...MATH }, host);
  } else design.frame(g, ctx);

  const want = { backlight: 1, invert: false, idle: false, displayOn: true, gamma: mod.init.gamma ?? 1, ...controls.want };
  const r = lcd.r;
  const inverse = want.invert !== !!mod.init.invert;
  if (inverse !== r.inverse) lcd.command(inverse ? CMD.INVON : CMD.INVOFF);
  if (want.idle !== r.idle) lcd.command(want.idle ? CMD.IDMON : CMD.IDMOFF);
  if (want.gamma !== r.gamma) lcd.command(CMD.GAMSET, want.gamma);
  if (want.displayOn !== r.displayOn) lcd.command(want.displayOn ? CMD.DISPON : CMD.DISPOFF);

  const sent = flush(lcd, g, mod, { mode: design.driver ?? 'full', last: lcd.lastBuf });
  lcd.lastBuf = g.buf;
  lcd.backlight = want.backlight;
  return { g, want, est, sent };
}

/**
 * Build the controller state for design `name` at time `t`.
 * @param {object} [opts] { t, clock, date, bus, module, fps, night, prime, prev, meter }
 *   night: 'auto' (by the clock) | 'off' | 'on', what designs see as ctx.night
 *   prev:  a controller a previous call returned, to continue from (the live view)
 *   meter: count the design's work (cost.js); the result has `cpu`, priced
 *          for opts.host (a cost.js HOSTS key, default the slowest) 
 */
export function buildFrame(name, opts = {}) {
  const design = typeof name === 'string' ? DESIGNS[name] : name;
  if (!design) throw new Error(`unknown design '${name}' (have: ${Object.keys(DESIGNS).join(', ')})`);
  const bus = opts.bus ?? design.bus ?? 'spi40';
  const mod = moduleOf(design, opts.module);
  const fps = fpsOf(design, opts.fps);
  const t = opts.t ?? 0;
  const clock = opts.clock ?? '10:09:30';
  const at = (tt) => (opts.date ? new Date(opts.date.getTime() + (tt - t) * 1000) : dateFor(clock, tt));

  let lcd = opts.prev;
  if (!lcd || lcd.bus !== bus || lcd.moduleKey !== mod.key) {
    lcd = new ST7735({ bus });
    lcd.moduleKey = mod.key;
    lcd.run(initSequence(mod));
    if (opts.prime !== false) runFrame(lcd, design, mod, { t: t - 1 / fps, date: at(t - 1 / fps), fps, night: opts.night });
  }
  lcd.beginFrame();
  const { g, est, sent, want } = runFrame(lcd, design, mod, { t, date: at(t), fps, night: opts.night, meter: opts.meter, host: opts.host });
  return { lcd, design, module: mod, fps, bus, report: lcd.report(), canvas: g, date: at(t), cpu: est, sent, want };
}

// ------------------------------------------------------------ the glass

/**
 * Which memory cell each glass pixel shows, row-major over the glass as the
 * viewer sees it. Derived from the module's init: the panel is wired so that
 * init shows the canvas upright, and any other register setting is then
 * simulated through the same wiring.
 */
const WIRING = new Map();
export function wiring(mod) {
  if (!WIRING.has(mod.key)) {
    const ref = new ST7735();
    const map = new Int32Array(mod.cols * mod.rows);
    for (let y = 0; y < mod.rows; y++)
      for (let x = 0; x < mod.cols; x++) map[y * mod.cols + x] = ref.addressOf(x + mod.init.xoff, y + mod.init.yoff, mod.init.madctl);
    WIRING.set(mod.key, map);
  }
  return WIRING.get(mod.key);
}

/**
 * Light transmitted by each glass pixel, 0..1 linear per channel (R, G, B
 * interleaved), as the panel shows the controller's memory: through the
 * data-to-subpixel order (MADCTL BGR against the panel's filters), the
 * panel's inversion, idle mode and the selected gamma curve.
 *
 * `tear`: show one panel refresh as it is scanned while this frame is still
 * on the wire, instead of the settled frame. `t` is the instant (seconds),
 * `frameStart` when this frame's bytes began to go out.
 */
export function transmittance(lcd, mod, { tear = false, t = 0, frameStart = 0 } = {}) {
  const W = mod.cols, H = mod.rows, map = wiring(mod);
  const out = new Float32Array(W * H * 3);
  const final = lcd.r;
  const period = 1 / lcd.frameRate(final);
  const lines = RAM_H;
  let cache = null;
  for (let i = 0; i < W * H; i++) {
    const a = map[i];
    let r = final, v;
    if (tear) {
      // When was this pixel's gate line last scanned? Lines go out in order.
      const line = Math.floor(a / RAM_W);
      const k = lcd.scanReversed(final) ? lines - 1 - line : line;
      const slot = (k / lines) * period;
      const scanned = Math.floor((t - slot) / period) * period + slot;
      const sinceUs = (scanned - frameStart) * 1e6;
      r = regsAt(lcd, sinceUs);
      const w = lcd.writeAt[a];
      v = w >= 0 && w <= sinceUs ? lcd.ram[a] : lcd.ramBefore[a];
    } else v = lcd.ram[a];
    if (!cache || cache.r !== r) cache = { r, lut: levelLUT(mod, r) };
    const swap = !!(r.madctl & 0x08) !== !!mod.panel.bgr;
    let cr = (v >> 16) & 63, cg = (v >> 8) & 63, cb = v & 63;
    if (swap) { const s = cr; cr = cb; cb = s; }
    out[i * 3] = cache.lut[cr]; out[i * 3 + 1] = cache.lut[cg]; out[i * 3 + 2] = cache.lut[cb];
  }
  return out;
}

/** 6-bit level -> transmittance under registers r. */
function levelLUT(mod, r) {
  const lut = new Float32Array(64);
  const on = r.displayOn && !r.sleep;
  const gamma = mod.panel.gammaCurves[Math.log2(r.gamma & 15 || 1) | 0] ?? 2.2;
  const flip = r.inverse !== !!mod.panel.invert;   // the panel shows true colours with its own setting
  for (let v = 0; v < 64; v++) {
    let k = flip ? 63 - v : v;
    if (r.idle) k = k >= 32 ? 63 : 0;
    lut[v] = on ? (k / 63) ** gamma : 0;
  }
  return lut;
}

function regsAt(lcd, us) {
  let r = lcd.regLog[0]?.r ?? lcd.r;
  for (const e of lcd.regLog) if (e.at <= us) r = e.r;
  return r;
}

/**
 * The glass as seen at time t: liquid crystal is slow, so each subpixel
 * follows the frames sent with a first-order lag (mod.panel.response, rise
 * and fall time constants). A still shows the state at the end of the frame
 * period containing t, the moment before the next frame lands.
 * Returns { levels: Float32Array (0..1 per channel), built: the last buildFrame, backlight }.
 */
export function glassAt(name, opts = {}) {
  const design = typeof name === 'string' ? DESIGNS[name] : name;
  const fps = fpsOf(design, opts.fps);
  const t = opts.t ?? 0;
  const k = Math.floor(t * fps + 1e-6);
  const mod = moduleOf(design, opts.module);
  const { rise, fall } = mod.panel.response;   // seconds
  const dt = 1 / fps;
  // History long enough for the slow edge to settle to under 1%.
  const n = opts.smear === false ? 0 : Math.min(12, Math.ceil((Math.max(rise, fall) * 4.6) / dt));
  let prev = null, state = null, built = null;
  for (let j = k - n; j <= k; j++) {
    built = buildFrame(design, { ...opts, t: j / fps, prev, prime: prev ? undefined : true, meter: opts.meter && j === k });
    prev = built.lcd;
    const T = opts.tear && j === k
      ? transmittance(built.lcd, mod, { tear: true, t: opts.tearAt ?? t, frameStart: j / fps })
      : transmittance(built.lcd, mod);
    if (!state) { state = Float32Array.from(T); continue; }
    const ar = 1 - Math.exp(-dt / rise), af = 1 - Math.exp(-dt / fall);
    for (let i = 0; i < state.length; i++) {
      const d = T[i] - state[i];
      state[i] += d * (d > 0 ? ar : af);
    }
  }
  return { levels: state, built, backlight: built.lcd.backlight };
}

export const designNames = () => Object.keys(DESIGNS);
