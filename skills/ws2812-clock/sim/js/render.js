// Draws the boards and their light at true geometry, in linear light, then
// tone-maps to sRGB. This is the CPU renderer (render.mjs, PNG and GIF);
// the live view uses glrender.js, the same model on the GPU. Both read the
// numbers in LIGHT, so a still and the live view agree.
//
// What it models, per LED:
//   the package body (white plastic, lit by the room),
//   the face glow (a frosted 3227 lights its whole face; a clear 2020 much less),
//   the dies (a clear 2020 shows three separate R, G, B dots; frosted: one soft spot),
//   a halo of scattered light on the board round it.
// Looks:
//   bare   the boards as they are
//   smoke  behind tinted acrylic: the board and unlit parts vanish, dots stay
//   opal   behind an opal (milky) diffuser sheet `gap` mm above the LEDs.
//          A WS2812 emits roughly as a Lambertian source (120 degree viewing
//          angle), so the light falling on the sheet r mm off-axis goes as
//          1 / (1 + r^2/a^2)^2 with a = gap; the sheet's own scattering and
//          the size of the package widen that (a^2 = gap^2 + sheet^2 + led^2).
//          The opal re-emits it diffusely, so that is the picture. Spots are
//          cut off smoothly at 3a and drawn on a coarse grid (a/4), then
//          interpolated: the diffuser leaves no finer detail than that.
// The light model is an approximation tuned against the photos in
// screen_description/, not a measurement; see references/hardware.md.

export const LIGHT = {
  room: { dark: 0.006, lit: 0.45 },
  desk: [0.30, 0.26, 0.20],          // kraft cardboard, as in the photos
  mask: [0.018, 0.019, 0.021],       // black solder mask
  opalSheet: [0.75, 0.75, 0.74],
  smokeTint: 0.08,
  dies: [[-0.32, 0.22], [0.0, -0.28], [0.32, 0.22]],   // R, G, B die offsets in a clear package, mm
  reach: 4.5,                        // mm: how far one LED's light is drawn
  halo: { bare: 0.10, smoke: 0.05, s2: 3.2 },
  frosted: { face: 0.9, spot: 2.6, s2: 0.35 },
  clear: { face: 0.25, die: 9, s2: 0.05 },
  // GOB (glue on board) 1515: dies close together (dieScale x the 2020's
  // offsets) and blurred by the epoxy coat; its own small halo, reached
  // within `reach` mm. ASSUMED, tuned by eye like the others.
  gob: { face: 0.3, die: 7, s2: 0.07, dieScale: 0.45, halo: 0.08, haloS2: 0.9, reach: 2.6 },
  // opal: sheet = the diffuser's own blur, led = the emitter's size (mm), and
  // transmission = share of the light that gets through (opal acrylic is
  // typically 50-70%). All three ASSUMED, not measured.
  // meter: the opal look is exposed like a camera would, so a fully lit
  // area of the layout's brightest board at full white sits at `meter`
  opal: { sheet: 1.0, led: 1.0, cut: 3, transmission: 0.6, meter: 1.0 },
  tone: { k: 1.3, spillAt: 1, spill: 0.2 },
};

/**
 * The light one LED emits per channel at full duty in the bare look: the
 * integral of the package model below (face + spot or dies + halo). The opal
 * diffuser passes `transmission` of it, so both looks are lit consistently.
 */
export function emitted(kind) {
  if (kind === true) kind = 'frosted'; else if (kind === false) kind = 'clear';
  const halo = LIGHT.halo.bare * Math.PI * LIGHT.halo.s2;
  if (kind === 'frosted') { const F = LIGHT.frosted; return halo + F.face * 3.2 * 2.7 * (1 - 0.35 * 2 / 3) + F.spot * Math.PI * F.s2; }
  if (kind === 'gob') { const G = LIGHT.gob; return G.halo * Math.PI * G.haloS2 + G.face * 1.5 * 1.5 * (1 - 0.5 * 2 / 3) + G.die * Math.PI * G.s2; }
  const C = LIGHT.clear;
  return halo + C.face * 2 * 2 * (1 - 0.5 * 2 / 3) + C.die * Math.PI * C.s2;
}

/** Package kind as a number, for the GPU: 0 clear, 1 frosted, 2 gob. */
export const kindCode = (pk) => ({ clear: 0, frosted: 1, gob: 2 })[pk.kind ?? (pk.frosted ? 'frosted' : 'clear')];

/**
 * The opal diffuser's spot at `gap` mm: width a, cut-off radius R, and
 * psf(r2, frosted), the light at squared distance r2 mm^2 from an LED at
 * full duty (frosted: its package, which sets how much light it gives).
 */
export function opalSpot(gap) {
  const O = LIGHT.opal, a2 = gap * gap + O.sheet ** 2 + O.led ** 2, a = Math.sqrt(a2);
  const X2 = O.cut * O.cut, fR = 1 / (1 + X2) ** 2;
  // energy of max(0, f - fR) over the disc of radius cut * a, f = 1/(1 + r^2/a^2)^2
  const e = Math.PI * a2 * (X2 / (1 + X2) - fR * X2);
  const ampF = (O.transmission * emitted('frosted')) / e, ampC = (O.transmission * emitted('clear')) / e;
  const ampG = (O.transmission * emitted('gob')) / e, amp = [ampC, ampF, ampG];
  return {
    a, R: O.cut * a, fR, ampF, ampC, ampG,
    // code: kindCode() of the package (true/false accepted for frosted/clear)
    psf: (r2, code) => { const f = 1 / (1 + r2 / a2) ** 2; return f > fR ? amp[+code] * (f - fR) : 0; },
  };
}

/**
 * Gain on the LED light for a look. Bare and smoke: 1 (tuned against the
 * photos). Opal: metered, because spreading each LED's light over the sheet
 * makes it far dimmer than the bare dies, and an eye adapts to that. The
 * room (desk, board, the sheet's own colour) is not metered: it stays dark.
 */
export function exposureFor(L, look) {
  if (look !== 'opal') return 1;
  let level = 0;
  for (const p of L.panels) {
    const d = p.def, cell = d.lattice === 'tri' ? (d.pitch ** 2 * Math.sqrt(3)) / 2 : d.lattice === 'rhombic' ? d.pitch ** 2 * Math.sin(((d.angle ?? 90) * Math.PI) / 180) : d.pitch * (d.pitchY ?? d.pitch);
    level = Math.max(level, (LIGHT.opal.transmission * emitted(d.package.kind)) / cell);
  }
  return LIGHT.opal.meter / level;
}

/** Coarse grid for the opal light: cell size in mm (never finer than an output pixel). */
export const opalCell = (gap, scale) => Math.max(1 / scale, opalSpot(gap).a / 4);

export function frameSize(L, { scale = 10, margin = 4 } = {}) {
  return { width: Math.ceil((L.bbox.w + 2 * margin) * scale), height: Math.ceil((L.bbox.h + 2 * margin) * scale) };
}

const SRGB = new Uint8Array(4097);
for (let i = 0; i <= 4096; i++) {
  const c = i / 4096;
  SRGB[i] = Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
}

function fillPolygon(buf, W, H, poly, toPx, col) {
  const pts = poly.map(([x, y]) => toPx(x, y));
  const ys = pts.map((p) => p[1]);
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
  for (let py = y0; py <= y1; py++) {
    const yc = py + 0.5, xs = [];
    for (let k = 0; k < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % pts.length];
      if ((ay <= yc) !== (by <= yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // pixel centres inside the span, as the GPU rasterises
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(W, Math.ceil(xs[k + 1] - 0.5));
      for (let px = xa; px < xb; px++) buf.set(col, 3 * (py * W + px));
    }
  }
}

/** Visit the pixels within r mm (a square) of (x, y): fn(offset, dx, dy) with dx, dy in mm. */
function around(W, H, scale, ox, oy, x, y, r, fn) {
  const cx = (x - ox) * scale, cy = (y - oy) * scale, R = r * scale;
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.ceil(cy + R));
  for (let py = y0; py <= y1; py++) {
    const dy = (py + 0.5) / scale + oy - y;
    for (let px = x0; px <= x1; px++) fn(3 * (py * W + px), (px + 0.5) / scale + ox - x, dy);
  }
}

const baseCache = new Map();

/** The unlit scene: desk, boards, packages, lit by the room. Cached. */
function base(L, o, W, H, ox, oy) {
  const key = [L.key, L.n, o.scale, o.look, o.room, o.margin, W, H].join('|');
  if (baseCache.has(key)) return baseCache.get(key);
  const amb = LIGHT.room[o.room] ?? LIGHT.room.dark;
  const buf = new Float32Array(W * H * 3);
  const desk = LIGHT.desk.map((c) => c * amb);
  for (let i = 0; i < W * H; i++) buf.set(desk, 3 * i);
  const toPx = (x, y) => [(x - ox) * o.scale, (y - oy) * o.scale];
  const tint = o.look === 'smoke' ? LIGHT.smokeTint : 1;
  for (const p of L.panels) {
    const col = (o.look === 'opal' ? LIGHT.opalSheet : LIGHT.mask).map((c) => c * amb * (o.look === 'opal' ? 1 : tint));
    fillPolygon(buf, W, H, p.outline, toPx, col);
  }
  if (o.look !== 'opal') {
    for (const l of L.leds) {
      const pk = L.panels[l.panel].def.package;
      const c = Math.cos((-l.rot * Math.PI) / 180), s = Math.sin((-l.rot * Math.PI) / 180);
      const body = pk.body.map((v) => v * amb * tint);
      around(W, H, o.scale, ox, oy, l.x, l.y, Math.hypot(pk.w, pk.h) / 2 + 0.2, (k, dx, dy) => {
        const u = dx * c - dy * s, v = dx * s + dy * c;
        const cov = Math.min(1, Math.max(0, (pk.w / 2 - Math.abs(u)) * o.scale + 0.5)) * Math.min(1, Math.max(0, (pk.h / 2 - Math.abs(v)) * o.scale + 0.5));
        if (cov <= 0) return;
        buf[k] += (body[0] - buf[k]) * cov; buf[k + 1] += (body[1] - buf[k + 1]) * cov; buf[k + 2] += (body[2] - buf[k + 2]) * cov;
      });
    }
  }
  if (baseCache.size > 8) baseCache.delete(baseCache.keys().next().value);
  baseCache.set(key, buf);
  return buf;
}

/**
 * Render a frame. `duty` is the PWM duty of every channel, 0..1, in chain
 * order (values/255; or a time average of them, which is what the eye sees
 * of a temporally dithered frame).
 *
 * opts: scale (px/mm, default 10), margin (mm, 4), look ('bare'|'smoke'|'opal'),
 *       gap (mm, opal only, default 8), room ('dark'|'lit'),
 *       exposure (1; multiplies everything, on top of exposureFor's LED gain)
 * Returns { width, height, rgba } (Uint8ClampedArray).
 */
export function renderFrame(L, duty, opts = {}) {
  const o = { scale: 10, margin: 4, look: 'bare', gap: 8, room: 'dark', exposure: 1, ...opts };
  const { width: W, height: H } = frameSize(L, o);
  const ox = L.bbox.x0 - o.margin, oy = L.bbox.y0 - o.margin;
  const buf = Float32Array.from(base(L, o, W, H, ox, oy));
  const { halo: HA, frosted: FR, clear: CL, dies: D } = LIGHT;
  const opal = o.look === 'opal';
  const spot = opal ? opalSpot(o.gap) : null, cell = opal ? opalCell(o.gap, o.scale) : 0;
  const Wc = opal ? Math.ceil(W / o.scale / cell) + 1 : 0, Hc = opal ? Math.ceil(H / o.scale / cell) + 1 : 0;
  const coarse = opal ? new Float32Array(Wc * Hc * 3) : null;

  for (const l of L.leds) {
    const k3 = 3 * l.i;
    const E = [duty[k3], duty[k3 + 1], duty[k3 + 2]];
    if (E[0] + E[1] + E[2] <= 0) continue;
    const pk = L.panels[l.panel].def.package;

    if (opal) {
      const fr = kindCode(pk);
      // into the coarse grid: cells within R of the LED
      const ci = (l.x - ox) / cell - 0.5, cj = (l.y - oy) / cell - 0.5, rc = spot.R / cell;
      const i0 = Math.max(0, Math.ceil(ci - rc)), i1 = Math.min(Wc - 1, Math.floor(ci + rc));
      const j0 = Math.max(0, Math.ceil(cj - rc)), j1 = Math.min(Hc - 1, Math.floor(cj + rc));
      for (let j = j0; j <= j1; j++) {
        const dy = (j - cj) * cell;
        for (let i = i0; i <= i1; i++) {
          const dx = (i - ci) * cell, g = spot.psf(dx * dx + dy * dy, fr);
          if (g <= 0) continue;
          const k = 3 * (j * Wc + i);
          coarse[k] += E[0] * g; coarse[k + 1] += E[1] * g; coarse[k + 2] += E[2] * g;
        }
      }
      continue;
    }

    const c = Math.cos((-l.rot * Math.PI) / 180), s = Math.sin((-l.rot * Math.PI) / 180);
    const hw = pk.w / 2, hh = pk.h / 2;
    const halo = o.look === 'smoke' ? HA.smoke : HA.bare;
    if (pk.kind === 'gob') {
      const G = LIGHT.gob, gh = G.halo * halo / HA.bare, k2 = G.dieScale;
      around(W, H, o.scale, ox, oy, l.x, l.y, G.reach, (k, dx, dy) => {
        const d2 = dx * dx + dy * dy;
        let g0 = gh * Math.exp(-d2 / G.haloS2), g1 = g0, g2 = g0;
        const u = dx * c - dy * s, v = dx * s + dy * c;
        if (Math.abs(u) < hw && Math.abs(v) < hh) {
          const f = G.face * (1 - 0.5 * ((u / hw) ** 2 + (v / hh) ** 2));
          g0 += f + G.die * Math.exp(-((u - k2 * D[0][0]) ** 2 + (v - k2 * D[0][1]) ** 2) / G.s2);
          g1 += f + G.die * Math.exp(-((u - k2 * D[1][0]) ** 2 + (v - k2 * D[1][1]) ** 2) / G.s2);
          g2 += f + G.die * Math.exp(-((u - k2 * D[2][0]) ** 2 + (v - k2 * D[2][1]) ** 2) / G.s2);
        }
        buf[k] += E[0] * g0; buf[k + 1] += E[1] * g1; buf[k + 2] += E[2] * g2;
      });
      continue;
    }
    around(W, H, o.scale, ox, oy, l.x, l.y, LIGHT.reach, (k, dx, dy) => {
      const d2 = dx * dx + dy * dy;
      let g0 = halo * Math.exp(-d2 / HA.s2), g1 = g0, g2 = g0;
      const u = dx * c - dy * s, v = dx * s + dy * c;
      if (Math.abs(u) < hw && Math.abs(v) < hh) {
        if (pk.frosted) {
          const f = FR.face * (1 - 0.35 * ((u / hw) ** 2 + (v / hh) ** 2)) + FR.spot * Math.exp(-d2 / FR.s2);
          g0 += f; g1 += f; g2 += f;
        } else {
          const f = CL.face * (1 - 0.5 * ((u / hw) ** 2 + (v / hh) ** 2));
          g0 += f + CL.die * Math.exp(-((u - D[0][0]) ** 2 + (v - D[0][1]) ** 2) / CL.s2);
          g1 += f + CL.die * Math.exp(-((u - D[1][0]) ** 2 + (v - D[1][1]) ** 2) / CL.s2);
          g2 += f + CL.die * Math.exp(-((u - D[2][0]) ** 2 + (v - D[2][1]) ** 2) / CL.s2);
        }
      }
      buf[k] += E[0] * g0; buf[k + 1] += E[1] * g1; buf[k + 2] += E[2] * g2;
    });
  }

  if (opal) {
    // bilinear from the coarse grid (cell centres at (i + 0.5) * cell), metered
    const gain = exposureFor(L, 'opal');
    for (let i = 0; i < coarse.length; i++) coarse[i] *= gain;
    for (let py = 0; py < H; py++) {
      const v = (py + 0.5) / o.scale / cell - 0.5, j = Math.max(0, Math.min(Hc - 2, Math.floor(v))), fy = Math.max(0, Math.min(1, v - j));
      for (let px = 0; px < W; px++) {
        const u = (px + 0.5) / o.scale / cell - 0.5, i = Math.max(0, Math.min(Wc - 2, Math.floor(u))), fx = Math.max(0, Math.min(1, u - i));
        const a = 3 * (j * Wc + i), b = a + 3, c = a + 3 * Wc, d = c + 3, k = 3 * (py * W + px);
        for (let ch = 0; ch < 3; ch++)
          buf[k + ch] += (coarse[a + ch] * (1 - fx) + coarse[b + ch] * fx) * (1 - fy) + (coarse[c + ch] * (1 - fx) + coarse[d + ch] * fx) * fy;
      }
    }
  }

  // Tone map: a soft shoulder, and light past white bleeds into the other
  // channels, as it does in a camera and, near enough, the eye.
  const rgba = new Uint8ClampedArray(W * H * 4);
  const ex = o.exposure, T = LIGHT.tone;
  for (let i = 0, j = 0; i < buf.length; i += 3, j += 4) {
    let r = buf[i] * ex, g = buf[i + 1] * ex, b = buf[i + 2] * ex;
    const m = Math.max(r, g, b), spill = m > T.spillAt ? (m - T.spillAt) * T.spill : 0;
    r += spill; g += spill; b += spill;
    rgba[j] = SRGB[Math.round(4096 * (1 - Math.exp(-T.k * r)))];
    rgba[j + 1] = SRGB[Math.round(4096 * (1 - Math.exp(-T.k * g)))];
    rgba[j + 2] = SRGB[Math.round(4096 * (1 - Math.exp(-T.k * b)))];
    rgba[j + 3] = 255;
  }
  return { width: W, height: H, rgba };
}
