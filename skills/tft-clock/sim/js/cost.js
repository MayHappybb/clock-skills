// How much work a frame is, independent of what drives the display.
//
// A face is meant to run on whatever small MCU drives the panel. Those
// differ a lot (an ESP32-C3 has no floating-point unit, an ESP32-S3 or an
// RP2350 do), so the design side does not assume one. What it can report
// is the frame's workload: pixels written and blended, anti-aliased edge
// pixels, calls of your own per-pixel functions, and transcendental Math
// calls. Those are what decide whether a face is cheap on any of them.
//
// The canvas counts what each frame did (gfx.js `cost`); Math calls are
// counted while a frame runs. `estimate()` prices the counts for a host
// profile (HOSTS) when you ask for one. The prices are rough figures for C
// ported the efficient way (integer spans, fixed point) with your own
// per-pixel code ported as written; good to a factor of two at best.

/** Where the frame is: inside a kit primitive's own loop, or in a design's per-pixel callback. */
export const STATE = { prim: 0, shader: 0, counting: false };

/** Math calls made by design code this frame (not by the kit's own primitives). */
export const MATH = {};

/** Cycles per counted event, for a core without an FPU (soft float). */
export const PRICES = {
  frame: 40000,   // per frame: clock fields, loop, task switch, DMA kick-off
  calls: 250,     // per drawing call: argument set-up, clipping
  px: 2,          // a plain pixel store (fills are 16-bit stores in a loop)
  blend: 24,      // an alpha blend: unpack RGB565, mix three channels, pack
  dither: 8,      // extra for a dithered store: a threshold lookup per channel
  box: 3,         // a pixel a primitive scans (span set-up amortised)
  edge: 120,      // an anti-aliased edge pixel: a fixed-point distance and coverage
  shade: 160,     // one call of your per-pixel function, plus a few float ops in it
  ramp: 14,       // a gradient pixel (incremental fixed point)
  blit: 5,        // a sprite or glyph pixel
  math: {         // soft-float library calls, single precision
    sin: 900, cos: 900, tan: 1400, asin: 1400, acos: 1400, atan: 1100, atan2: 1500,
    sqrt: 220, cbrt: 900, hypot: 400, exp: 900, log: 900, log2: 900, log10: 900, pow: 2200,
    sinh: 1500, cosh: 1500, tanh: 1500,
    floor: 25, ceil: 25, round: 25, trunc: 20, sign: 6, abs: 4, min: 6, max: 6, random: 40,
    // kit's table-driven versions (kit.sin, kit.cos): a lookup and a lerp
    ksin: 40,
  },
};

/**
 * Host profiles for `estimate()`. `fpu`: single-precision float in hardware,
 * which makes float maths and your per-pixel code several times cheaper.
 * Clocks are the chips' usual maxima; the scaling is an assumption.
 */
export const HOSTS = {
  esp32c3: { label: 'ESP32-C3 (RV32IMC 160 MHz, no FPU)', mhz: 160, fpu: false },
  esp32s3: { label: 'ESP32-S3 (Xtensa LX7 240 MHz, FPU)', mhz: 240, fpu: true },
  rp2350: { label: 'RP2350 (Cortex-M33 150 MHz, FPU)', mhz: 150, fpu: true },
};
/** With an FPU: per-pixel functions and Math calls cost this fraction of the soft-float price. */
const FPU_FACTOR = { shade: 0.3, math: 0.15 };

const WRAPPED = Object.keys(PRICES.math).filter((k) => typeof Math[k] === 'function');
const ORIGINAL = Object.fromEntries(WRAPPED.map((k) => [k, Math[k]]));

/**
 * Run `fn` with Math calls counted into MATH. Calls made inside a kit
 * primitive's own loop are not counted (they are priced as `box`/`edge`),
 * except inside a design's callback there.
 */
export function counting(fn) {
  for (const k of Object.keys(MATH)) delete MATH[k];
  if (STATE.counting) return fn();
  STATE.counting = true;
  for (const k of WRAPPED) {
    const f = ORIGINAL[k];
    Math[k] = function (...a) {
      if (STATE.prim === 0 || STATE.shader > 0) MATH[k] = (MATH[k] ?? 0) + 1;
      return f.apply(Math, a);
    };
  }
  try { return fn(); } finally {
    for (const k of WRAPPED) Math[k] = ORIGINAL[k];
    STATE.counting = false;
    STATE.prim = 0; STATE.shader = 0;
  }
}

/** Count a kit table function call (kit.sin and friends). */
export function countKit(name) {
  if (STATE.counting && (STATE.prim === 0 || STATE.shader > 0)) MATH[name] = (MATH[name] ?? 0) + 1;
}

/** Per-frame workload in plain numbers: what any host has to do for this frame. */
export function workload(cost, math = {}) {
  const trig = Object.entries(math).filter(([k]) => !['floor', 'ceil', 'round', 'trunc', 'sign', 'abs', 'min', 'max', 'ksin'].includes(k))
    .reduce((a, [, n]) => a + n, 0);
  return {
    written: (cost.px ?? 0) + (cost.blit ?? 0),
    blended: cost.blend ?? 0,
    edges: cost.edge ?? 0,
    shaded: cost.shade ?? 0,   // calls of your own per-pixel functions
    ramp: cost.ramp ?? 0,
    trig,                      // sin, atan2, sqrt, pow... made by design code
    calls: cost.calls ?? 0,
  };
}

/**
 * Cycles and milliseconds for one frame's counts on a host profile.
 * @param {object} cost  the canvas's `cost`
 * @param {object} math  Math call counts (MATH after the frame)
 * @param {string|object} host  a HOSTS key or profile (default esp32c3, the slowest)
 */
export function estimate(cost, math = {}, host = 'esp32c3') {
  const h = typeof host === 'string' ? HOSTS[host] : host;
  if (!h) throw new Error(`unknown host '${host}' (have: ${Object.keys(HOSTS).join(', ')})`);
  const parts = { frame: PRICES.frame };
  for (const k of ['calls', 'px', 'blend', 'dither', 'box', 'edge', 'shade', 'ramp', 'blit'])
    parts[k] = (cost[k] ?? 0) * PRICES[k] * (h.fpu && k === 'shade' ? FPU_FACTOR.shade : 1);
  let m = 0;
  for (const [k, n] of Object.entries(math)) m += n * (PRICES.math[k] ?? 200) * (h.fpu && k !== 'ksin' ? FPU_FACTOR.math : 1);
  parts.math = m;
  const cycles = Object.values(parts).reduce((a, b) => a + b, 0);
  const top = Object.entries(parts).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > cycles * 0.1).map(([k]) => k);
  return { host: h.label, cycles, ms: cycles / (h.mhz * 1000), parts, top, math: { ...math }, workload: workload(cost, math) };
}
