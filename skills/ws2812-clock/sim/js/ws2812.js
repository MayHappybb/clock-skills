// The WS2812 chain: what a frame costs to send, what it draws from the
// supply, and what the 8-bit values a design's colours become.
//
// There is no frame buffer in the LEDs. Each LED takes the first 24 bits it
// sees, passes the rest on, and shows them after the line stays low for the
// reset time. So a frame is (LEDs on the lane) x 24 bits, plus the latch gap,
// and every frame must be sent again in full.
//
// HUB75 panels (bus 'hub75') are different hardware with the same job:
// hub75Budget() models their refresh and frame-buffer RAM instead.
//
// Values and their sources are in references/hardware.md. Numbers marked
// ASSUMED there are the simulator's choices, not datasheet figures.

export const WIRE = {
  bitUs: 1.25,       // 800 kbit/s (WS2812B-V5/W V6.1, WS2812C-2020 V1.0)
  resetUs: 300,      // latch gap: > 280 us on V5 and 2020 parts (old WS2812B: > 50 us)
  bitsPerLed: 24,    // G, R, B, 8 bits each, MSB first
  idleMa: 0.6,       // per-LED quiescent current: 0.6 mA typ. (V5/W), < 0.5 mA (WS2812C-2020)
  volts: 5,
};

/** Microseconds to send one frame down a lane of n LEDs. */
export const laneUs = (n) => n * WIRE.bitsPerLed * WIRE.bitUs + WIRE.resetUs;

/** Controllers worth modelling: how many lanes they can drive at once, and RAM. */
export const CONTROLLERS = {
  'esp32s3':  { label: 'ESP32-S3, LCD_CAM I80 16-bit parallel (or 4 RMT TX)', lanes: 16, ramKB: 512 },
  'esp32':    { label: 'ESP32, I2S parallel (or 8 RMT channels)', lanes: 16, ramKB: 320 },
  'esp32c3':  { label: 'ESP32-C3, 2 RMT TX channels', lanes: 2, ramKB: 400 },
  'rp2040':   { label: 'RP2040, 8 PIO state machines', lanes: 8, ramKB: 264 },
  'avr':      { label: 'ATmega328 (Uno/Nano), bit-banged, one lane', lanes: 1, ramKB: 2 },
};

/**
 * What the layout costs on a controller: per-lane frame time, the fastest
 * frame rate, and RAM for the frame (3 bytes an LED, x2 if double-buffered).
 * Only WS2812 lanes: HUB75 panels have no wire time (see hub75Budget).
 * Boards with their own MCU (ownMcu) each drive their own lane.
 */
export function wireBudget(L, ctrl = 'esp32s3') {
  const c = CONTROLLERS[ctrl];
  const lanes = L.lanes.filter((l) => l.bus === 'ws2812').map((l) => ({ ...l, us: laneUs(l.count) }));
  const own = lanes.filter((l) => l.panels.every((p) => L.panels[p].def.ownMcu));
  const shared = lanes.filter((l) => !own.includes(l));
  // lanes beyond what the controller drives at once go out one after another
  const groups = Math.ceil(shared.length / c.lanes);
  const sorted = shared.map((l) => l.us).sort((a, b) => b - a);
  let sharedUs = 0;
  for (let g = 0; g < groups; g++) sharedUs += sorted[g * c.lanes] ?? 0;
  // boards with their own MCU send in parallel with everything else
  const us = Math.max(sharedUs, 0, ...own.map((l) => l.us));
  const n = lanes.reduce((s, l) => s + l.count, 0);
  return { controller: c, lanes, shared: shared.length, own: own.length, frameUs: us, maxFps: us ? 1e6 / us : Infinity, ramBytes: n * 3 };
}

/**
 * HUB75 panels. The controller scans them continuously from a frame buffer
 * in DMA memory (ESP32-HUB75-MatrixPanel-DMA); the design only updates that
 * buffer. Modelled after the library's own code (references/hardware.md):
 *   - a chain of panels is one long row of PPR = 64 x panels pixels;
 *     two rows are lit at a time, 32 row pairs a frame (1/32 scan)
 *   - binary-coded modulation: every bit plane is shifted out once, and the
 *     planes above the "LSB-MSB transition bit" t are repeated 2^(i-t-1)
 *     times; t rises until the refresh rate reaches `minRefresh`, which
 *     shows the planes up to t for the same time: levels below 2^(t+1)/255
 *     are no longer in proportion
 *   - buffer: PPR x depth x 2 bytes per row pair, x 32, x2 double-buffered
 *   - writing a pixel into the bit planes costs `pixelUs` (ASSUMED)
 * opts: clockHz (8e6: the library's HZ_8M default; HZ_16M or 20M on short
 * ribbons), depth (8), minRefresh (60), double (true).
 */
export const HUB75 = { clockHz: 8e6, depth: 8, minRefresh: 60, double: true, pixelUs: 0.35, internalKB: 160 };
export function hub75Budget(L, opts = {}) {
  const o = { ...HUB75 };
  for (const [k, v] of Object.entries(opts)) if (v !== undefined) o[k] = v;
  if (!(o.depth >= 2 && o.depth <= 12)) throw new Error(`HUB75 depth ${o.depth}: the library takes 2..12 bits`);
  const chains = L.lanes.filter((l) => l.bus === 'hub75').map((l) => {
    const def = L.panels[l.panels[0]].def, rows = def.hub.h / 2, ppr = def.hub.w * l.panels.length;
    let t = 0, refresh = 0;
    for (;; t++) {
      let periods = o.depth;
      for (let i = t + 1; i < o.depth; i++) periods += 2 ** (i - t - 1);
      refresh = o.clockHz / (ppr * periods * rows);
      if (refresh >= o.minRefresh || t >= o.depth - 1) break;
    }
    const ramBytes = ppr * o.depth * 2 * rows * (o.double ? 2 : 1);
    return { ...l, ppr, rows, t, refresh, ramBytes };
  });
  const pixels = chains.reduce((s, c) => s + c.count, 0);
  const updateUs = pixels * o.pixelUs;
  return { ...o, chains, pixels, ramBytes: chains.reduce((s, c) => s + c.ramBytes, 0), updateUs, maxFps: updateUs ? 1e6 / updateUs : Infinity };
}

/**
 * Per-LED current model, cached per layout: chMa[i] is the mA of one channel
 * of LED i at full duty, idleMa[i] its share of the quiescent current.
 *   WS2812: constant-current sinks switched by PWM, so a channel draws its
 *     full-scale current times its duty; plus 0.6 mA per LED.
 *   HUB75: the panel's drivers sink a fixed current per column while a row
 *     pair is lit, so the panel's average current is its full-white current
 *     times the mean duty over all its channels; plus an idle current.
 */
const currents = new WeakMap();
export function ledCurrents(L) {
  if (currents.has(L)) return currents.get(L);
  const chMa = new Float32Array(L.n), idleMa = new Float32Array(L.n);
  for (const l of L.leds) {
    const p = L.panels[l.panel], d = p.def;
    if (d.bus === 'hub75') { chMa[l.i] = (d.hub.fullA * 1000) / (3 * p.count); idleMa[l.i] = (d.hub.idleA * 1000) / p.count; }
    else { chMa[l.i] = d.mA; idleMa[l.i] = WIRE.idleMa; }
  }
  const c = { chMa, idleMa };
  currents.set(L, c);
  return c;
}

/** Supply current in amps for a frame, from `duty` (0..1 per channel, as the eye sees it). */
export function currentA(L, duty) {
  const { chMa, idleMa } = ledCurrents(L);
  let mA = 0;
  for (let i = 0; i < L.n; i++) mA += idleMa[i] + chMa[i] * (duty[3 * i] + duty[3 * i + 1] + duty[3 * i + 2]);
  return mA / 1000;
}

/** Full-white current of the layout: the number that sizes a power supply. */
export function fullWhiteA(L) {
  const { chMa, idleMa } = ledCurrents(L);
  let mA = 0;
  for (let i = 0; i < L.n; i++) mA += idleMa[i] + 3 * chMa[i];
  return mA / 1000;
}

/**
 * Linear light (0..1 per channel, any range: clipped) to the 8-bit values
 * sent down the wire. PWM duty is linear in the value, so linear light maps
 * straight to the value; there is no gamma inside the LED.
 *
 * `scale` is the global brightness (a number, or one per channel). With `carry` (a Float32Array the caller
 * keeps between frames) the rounding error is carried to the next frame:
 * temporal dithering, which gives dim colours the in-between levels 8 bits
 * lack, at the cost of flicker if the frame rate is low.
 */
export function quantize(lin, values, scale = 1, carry = null) {
  const per = typeof scale !== 'number';          // a Float32Array: one scale per channel
  for (let k = 0; k < lin.length; k++) {
    let v = Math.max(0, Math.min(1, lin[k])) * (per ? scale[k] : scale) * 255;
    if (carry) {
      v += carry[k];
      const q = Math.max(0, Math.min(255, Math.round(v)));
      carry[k] = v - q;
      values[k] = q;
    } else values[k] = Math.max(0, Math.min(255, Math.round(v)));
  }
  return values;
}
