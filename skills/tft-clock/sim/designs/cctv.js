// Night Shift: a security desk's monitor wall, and the time is a car.
//
// Every minute one car pulls up to the barrier of a car-park entrance, and
// its number plate is the time. The big monitor runs the ANPR software: the
// gate camera (CAM01) above, the plate the system has read below, cropped
// and magnified like a still from evidence: 10 [seals] 09, the two round
// registration seals between the groups standing in for the colon. Read the
// plate. Every feed also carries its burned-in OSD timestamp, seconds and
// all, like real CCTV.
//
// The minute turn is the car's: at :57 the barrier lifts, the car rolls at
// the camera and fills the lens as it passes under it, the plate read
// breaks up into blocks and is LOST before :00; the car that has been
// queueing behind since the half-minute rolls up, the reader hunts, locks
// and "enhances" the new plate out of coarse macroblocks after :00. The
// time is never wrong, only missing for about two seconds (the OSD carries
// it through).
//
// The two small monitors follow the car that just went in, so the people
// cross between cameras: CAM02 looks straight down on the car park, where
// it drives in, turns into a bay and parks, the driver gets out and walks
// to the stair door; then the sequencer monitor cuts to CAM03 (stairs, the
// driver climbs), CAM04 (lobby, crosses to the lift, doors open and close),
// CAM05 (a corridor, walks away into perspective and turns in at a door).
// The car stays parked for a few minutes and reverses out later, so the
// car park fills and empties with the last few minutes' plates.
//
// At the hour the plate hits the HOTLIST: the crop zooms to fill the whole
// monitor (ENHANCE), red banner, the wall goes to ALARM, and next minute the
// small cameras track that car and its driver in red boxes.
//
// Look: the medium is surveillance video, not illustration. Every feed is
// grey-scale with its monitor's own phosphor tint (cool, green, warm),
// grain re-rolled every video frame, scanlines, a dark vignette, and the
// feeds run at CCTV frame rates (gate camera 25 fps, the others 12.5 fps)
// while the software overlay runs at the panel's 60. At night (19:00-07:00)
// the gate camera is in IR mode: the near lane lit by the illuminator, the
// street black, headlights blown out with the CCD's vertical smear. The
// only colour is the software's: ANPR green, REC and ALARM red.
// Hard pixels everywhere: video and OSD type are pixels.
//
// Cost: rect, polygon and blit primitives only (no per-pixel code); grain is
// four precomputed sparse sprites blitted at random offsets, two per feed.

import { Gfx, font3x5, font5x7, hash, rand, rng, noise, clamp, lerp, mix, clockFields, ease, progress, from565, R, G, B, rgb } from '../js/kit.js';
import { PLATE_DIGITS, EU_D } from './cctv-glyphs.js';

// ------------------------------------------------------------ the wall

const MAIN = { x: 1, y: 1, w: 102, h: 55 };   // CAM01 video
const UI = { x: 1, y: 56, w: 102, h: 23 };    // the ANPR software strip
const C2 = { x: 105, y: 1, w: 54, h: 38 };    // car park, overhead
const C3 = { x: 105, y: 41, w: 54, h: 38 };   // sequencer: stairs / lobby / corridor

const WALL = 0x0b0c0e, BEZEL = 0x1d1f23, BEZEL_HI = 0x2c2f35;
const GREEN = 0x4fe680, GREEN_DIM = 0x2a7a48, RED = 0xff3a32, UI_BG = 0x0f1316, UI_TXT = 0x9aa8ae;

// Each monitor has its own phosphor tint; a scene draws in grey levels 0..1.
function makeLut(lo, hi) {
  return Array.from({ length: 65 }, (_, i) => mix(lo, hi, i / 64));
}
const LUTS = { a: makeLut(0x07090c, 0xe2ebf2), b: makeLut(0x060b07, 0xd6eada), c: makeLut(0x0d0a07, 0xf2e5d2) };
let LUT = LUTS.a;

/** Debug switch for out/cctv-dbg.mjs: draw the feeds without grain and scanlines. */
export const DEBUG = { clean: false };
const tn = (v) => LUT[v <= 0 ? 0 : v >= 1 ? 64 : (v * 64 + 0.5) | 0];

// ------------------------------------------------------------ video texture

function grainSprite(seed, dens) {
  const r = rng(seed), w = 128, h = 96, data = new Int32Array(w * h).fill(-1);
  for (let i = 0; i < data.length; i++) if (r() < dens) data[i] = 0xffffff;
  return { w, h, data };
}
const GRAIN = [0, 1, 2, 3].map((i) => grainSprite(311 + i, 0.09));

/** Grain over a feed, re-rolled on that feed's own frame number k. */
function grain(g, Rc, k, amt, sc = 1) {
  if (DEBUG.clean) return;
  const v = hash(k, Rc.x, 77);
  g.clip(Rc.x, Rc.y, Rc.w, Rc.h);
  g.blit(GRAIN[v & 3], Rc.x - ((v >>> 4) % 22), Rc.y - ((v >>> 9) % 22), { c: 0xffffff, a: amt, scale: sc });
  g.blit(GRAIN[(v >>> 2) & 3], Rc.x - ((v >>> 14) % 22), Rc.y - ((v >>> 19) % 22), { c: 0x000000, a: amt * 1.5, scale: sc });
  g.unclip();
}

function scanlines(g, Rc, a = 0.14) {
  if (DEBUG.clean) return;
  for (let y = Rc.y + 1; y < Rc.y + Rc.h; y += 2) g.fillRect(Rc.x, y, Rc.w, 1, 0x000000, { a });
}

function vignette(g, Rc) {
  g.rect(Rc.x, Rc.y, Rc.w, Rc.h, 0x000000, { a: 0.5 });
  g.rect(Rc.x + 1, Rc.y + 1, Rc.w - 2, Rc.h - 2, 0x000000, { a: 0.28 });
  g.rect(Rc.x + 2, Rc.y + 2, Rc.w - 4, Rc.h - 4, 0x000000, { a: 0.12 });
}

/** Burned-in OSD type: white with a hard black drop shadow. */
function osd(g, str, x, y, { font = font3x5, c = 0xf2f2f2 } = {}) {
  g.text(str, x + 1, y + 1, { font, c: 0x000000 });
  return g.text(str, x, y, { font, c });
}

// ------------------------------------------------------------ cars and people

const FIELD_CACHE = new Map();
function fieldsOf(mk) {
  let f = FIELD_CACHE.get(mk);
  if (!f) {
    f = clockFields(new Date(mk * 60000));
    if (FIELD_CACHE.size > 64) FIELD_CACHE.clear();
    FIELD_CACHE.set(mk, f);
  }
  return f;
}

const BODIES = [
  { w: 1.0, bon: 0.47, roof: 0.72 },   // saloon
  { w: 0.94, bon: 0.46, roof: 0.8 },   // hatchback
  { w: 1.04, bon: 0.53, roof: 1.0 },   // van
  { w: 1.06, bon: 0.56, roof: 0.9 },   // SUV
];
const SHADES = [0.16, 0.32, 0.5, 0.66, 0.84];

/** The car whose plate is minute `mk`. */
function carOf(mk) {
  const f = fieldsOf(mk), r = hash(mk, 31);
  const hour = f.m === 0;
  return {
    mk, hour, plate: f.hh + f.mm,
    body: hour ? BODIES[3] : BODIES[r % 4],
    shade: hour ? 0.1 : SHADES[(r >>> 4) % 5],
    coat: [0.12, 0.22, 0.6, 0.78][(r >>> 8) % 4],
    bay: ((mk % 12) + 12) % 12,
    stay: 3 + ((r >>> 12) % 8),               // minutes parked
    leave: 26 + ((r >>> 16) % 16),            // second it reverses out
  };
}

/**
 * A walking figure, procedural so it scales with perspective.
 * x: centre, yf: feet, h: height px, ph: stride phase, dir: +1 right / -1 left / 0 walking away.
 */
function person(g, x, yf, h, ph, dir, shade) {
  const body = tn(shade), skin = tn(Math.min(0.9, shade + 0.35)), legs = tn(Math.max(0.04, shade - 0.08));
  const sw = Math.sin(ph * Math.PI * 2);
  const lw = Math.max(1, h * 0.1);
  const hipY = yf - h * 0.46, shY = yf - h * 0.8;
  if (dir === 0) {
    // from behind: legs alternate lifting
    const lift = Math.abs(sw) * h * 0.06;
    g.fillRect(x - h * 0.12, hipY, lw, h * 0.46 - (sw > 0 ? lift : 0), legs);
    g.fillRect(x + h * 0.12 - lw, hipY, lw, h * 0.46 - (sw < 0 ? lift : 0), legs);
  } else {
    g.thickLine(x, hipY, x + sw * h * 0.17, yf - 0.5, lw, legs);
    g.thickLine(x, hipY, x - sw * h * 0.17, yf - 0.5, lw, legs);
  }
  g.fillRoundRect(x - h * 0.14, shY, h * 0.28, h * 0.4, h * 0.06, body);
  if (dir !== 0) g.thickLine(x, shY + 1, x - sw * h * 0.12, yf - h * 0.42, Math.max(1, lw * 0.8), body);
  g.fillCircle(x + dir * h * 0.02, yf - h * 0.9, Math.max(1.1, h * 0.1), dir === 0 ? tn(Math.max(0.05, shade - 0.05)) : skin);
}

// ------------------------------------------------------------ the plate

const PW = 59, PH = 21;

/** The plate at integer scale `sc`, top-left (x, y): EU band, FE digits, seals as the colon. */
function drawPlate(g, x, y, sc, plate, ir) {
  const bg = tn(ir ? 0.98 : 0.88), ink = tn(0.06);
  g.fillRect(x, y, PW * sc, PH * sc, tn(0.22));
  g.fillRect(x + sc, y + sc, (PW - 2) * sc, (PH - 2) * sc, bg);
  g.fillRect(x + sc, y + sc, 5 * sc, (PH - 2) * sc, tn(0.26));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.fillRect(x + (3.5 + 1.6 * Math.cos(a)) * sc, y + (6.5 + 1.6 * Math.sin(a)) * sc, sc, sc, tn(0.7));
  }
  g.blit(EU_D, x + 2 * sc, y + 13 * sc, { c: tn(0.82), scale: sc });
  const xs = [8, 19, 36, 47];
  for (let i = 0; i < 4; i++) g.blit(PLATE_DIGITS[plate[i]], x + xs[i] * sc, y + 2 * sc, { c: ink, scale: sc });
  for (const cy of [6.5, 14.5]) {
    g.fillCircle(x + 32 * sc, y + cy * sc, 2.6 * sc, tn(0.5));
    g.fillCircle(x + 32 * sc, y + cy * sc, 1.3 * sc, tn(0.78));
  }
}

const PBUF = new Gfx(PW, PH);

/** The plate as macroblocks of `blk` pixels (the read resolving or breaking up). */
function plateBlocks(g, x, y, sc, blk, plate, ir, a = 1) {
  PBUF.clear(0);
  drawPlate(PBUF, 0, 0, 1, plate, ir);
  for (let by = 0; by < PH; by += blk)
    for (let bx = 0; bx < PW; bx += blk) {
      let r = 0, gg = 0, b = 0, n = 0;
      for (let j = by; j < Math.min(PH, by + blk); j++)
        for (let i = bx; i < Math.min(PW, bx + blk); i++) {
          const c = from565(PBUF.buf[j * PW + i]);
          r += R(c); gg += G(c); b += B(c); n++;
        }
      const x0 = Math.round(x + bx * sc), y0 = Math.round(y + by * sc);
      const x1 = Math.round(x + Math.min(PW, bx + blk) * sc), y1 = Math.round(y + Math.min(PH, by + blk) * sc);
      g.fillRect(x0, y0, x1 - x0, y1 - y0, rgb(r / n, gg / n, b / n), { a });
    }
}

// ------------------------------------------------------------ CAM01: the gate

const HZ = 6, FOC = 44;
const ybOf = (z) => MAIN.y + HZ + FOC / z;
const kOf = (z) => 60 / z;
const xOf = (z, u) => MAIN.x + 51 + (u * 60) / z;

const SKYLINE = [[0, 9, 6], [9, 6, 9], [15, 12, 5], [27, 7, 10], [34, 10, 7], [44, 5, 4], [49, 14, 8], [63, 8, 11], [71, 11, 6], [82, 7, 9], [89, 13, 5]];

function gateBackground(g, D, ir) {
  const ox = MAIN.x, oy = MAIN.y;
  g.fillRect(ox, oy, 102, 12, tn(ir ? 0.03 : 0.76));
  const win = Math.floor(D / 600);
  for (const [x, w, h] of SKYLINE) {
    g.fillRect(ox + x, oy + 11 - h, w, h, tn(ir ? 0.07 : 0.52));
    for (let wy = oy + 12 - h; wy < oy + 10; wy += 2)
      for (let wx = ox + x + 1; wx < ox + x + w - 1; wx += 2) {
        const r = rand(wx, wy, win);
        if (ir ? r < 0.22 : r < 0.5) g.pixel(wx, wy, tn(ir ? 0.62 : 0.42));
      }
  }
  // the street beyond the entrance, and its traffic
  g.fillRect(ox, oy + 10, 102, 5, tn(ir ? 0.1 : 0.4));
  for (let x = ox + ((Math.floor(D * 0) % 6)); x < ox + 102; x += 7) g.fillRect(x, oy + 12, 3, 1, tn(ir ? 0.3 : 0.72));
  traffic(g, D, ir);
  g.fillRect(ox, oy + 15, 102, 2, tn(ir ? 0.17 : 0.62));
  // the entry lane, lit by the IR illuminator at night (bright near, dark far)
  g.gradient(ox, oy + 17, 102, 38, ir ? [tn(0.14), tn(0.5)] : [tn(0.5), tn(0.42)]);
  const lx = xOf(5, -0.85), rx = xOf(5, 0.85), y5 = ybOf(5);
  const lb = xOf(0.85, -0.85), rb = xOf(0.85, 0.85), yb = ybOf(0.85);
  g.fillPolygon([[ox, y5], [lx, y5], [lb, yb], [ox, yb]], tn(0), { a: ir ? 0.45 : 0.22 });
  g.fillPolygon([[ox + 102, y5], [rx, y5], [rb, yb], [ox + 102, yb]], tn(0), { a: ir ? 0.45 : 0.22 });
  g.thickLine(lx, y5, lb, yb, 1.3, tn(ir ? 0.55 : 0.78));
  g.thickLine(rx, y5, rb, yb, 1.3, tn(ir ? 0.55 : 0.78));
  // lane markings: centre dashes and the stop line
  for (const z of [4.2, 3.0, 2.2, 1.6]) {
    const y0 = ybOf(z), y1 = ybOf(z * 0.84);
    g.fillPolygon([[xOf(z, -0.025), y0], [xOf(z, 0.025), y0], [xOf(z * 0.84, 0.025), y1], [xOf(z * 0.84, -0.025), y1]], tn(ir ? 0.6 : 0.74));
  }
  g.fillRect(xOf(0.95, -0.85), ybOf(0.95), xOf(0.95, 0.85) - xOf(0.95, -0.85), 2, tn(ir ? 0.8 : 0.82));
  // lamp post on the left verge
  const px = xOf(2.2, -1.25), py = ybOf(2.2);
  if (ir) g.fillEllipse(px + 8, py + 1, 14, 3, tn(0.7), { a: 0.18 });
  g.fillRect(px, oy, 2, py - oy, tn(ir ? 0.2 : 0.3));
  g.fillRect(px, oy + 1, 7, 1, tn(ir ? 0.2 : 0.3));
  g.fillRect(px + 5, oy + 2, 3, 1, tn(ir ? 1 : 0.6));
  if (ir) g.fillCircle(px + 6.5, oy + 3, 3, tn(1), { a: 0.25 });
}

function traffic(g, D, ir) {
  const slot = Math.floor(D / 5);
  for (let k = slot - 1; k <= slot; k++) {
    if (rand(k, 3) > 0.6) continue;
    const u = (D - (k * 5 + rand(k, 4) * 2.4)) / 2.6;
    if (u < 0 || u > 1) continue;
    const dir = rand(k, 5) < 0.5 ? 1 : -1;
    const x = MAIN.x + (dir > 0 ? lerp(-18, 120, u) : lerp(120, -18, u)), y = MAIN.y + (dir > 0 ? 14 : 13);
    const sh = SHADES[hash(k, 6) % 5];
    g.fillRect(x - 7, y - 3, 15, 3, tn(ir ? sh * 0.4 : sh));
    g.fillRect(x - 4, y - 5, 8, 2, tn(ir ? 0.05 : sh * 0.6));
    g.fillRect(x - 5, y, 2, 1, tn(0.04)); g.fillRect(x + 4, y, 2, 1, tn(0.04));
    if (ir) {
      g.fillRect(x + dir * 7, y - 2, 1, 1, tn(1));
      g.fillPolygon([[x + dir * 8, y - 2], [x + dir * 20, y - 4], [x + dir * 20, y + 1]], tn(1), { a: 0.22 });
      g.fillRect(x - dir * 7, y - 2, 1, 1, tn(0.6));
    }
  }
  // people on the pavement
  const ps = Math.floor(D / 9);
  for (let k = ps - 1; k <= ps; k++) {
    if (rand(k, 13) > 0.45) continue;
    const u = (D - (k * 9 + rand(k, 14) * 3)) / 8;
    if (u < 0 || u > 1) continue;
    const dir = rand(k, 15) < 0.5 ? 1 : -1;
    const x = MAIN.x + (dir > 0 ? lerp(-6, 108, u) : lerp(108, -6, u));
    person(g, x, MAIN.y + 16.5, 9, u * 9, dir, ir ? 0.3 : [0.15, 0.3, 0.7][hash(k, 16) % 3]);
  }
}

/** A car seen from the gate camera, nose on, at depth z. */
function carFront(g, z, u, car, ir, live = null) {
  const k = kOf(z), X = xOf(z, u), yb = ybOf(z), wk = car.body.w * k, h = wk / 2;
  const lum = ir ? clamp(1.8 / z - 0.25, 0.25, 1.05) : 1;
  const T = (v) => tn(v * lum);
  const sh = car.shade, bon = car.body.bon, roof = car.body.roof;
  g.fillEllipse(X, yb - 0.01 * k, h * 1.12, 0.05 * k, tn(0.02), { a: 0.7 });
  g.fillRect(X - h * 0.95, yb - 0.1 * k, 0.15 * k, 0.1 * k, tn(0.04));
  g.fillRect(X + h * 0.95 - 0.15 * k, yb - 0.1 * k, 0.15 * k, 0.1 * k, tn(0.04));
  g.fillRoundRect(X - h, yb - 0.42 * k, wk, 0.33 * k, 0.06 * k, T(sh));
  g.fillRect(X - h, yb - 0.13 * k, wk, 0.04 * k, T(sh * 0.5));
  // bonnet (catches the sky), cabin, windscreen
  g.fillPolygon([[X - h * 0.98, yb - 0.42 * k], [X + h * 0.98, yb - 0.42 * k], [X + h * 0.84, yb - bon * k], [X - h * 0.84, yb - bon * k]], T(Math.min(0.95, sh + 0.14)));
  g.fillPolygon([[X - h * 0.84, yb - bon * k], [X + h * 0.84, yb - bon * k], [X + h * 0.64, yb - roof * k], [X - h * 0.64, yb - roof * k]], T(sh * 0.75));
  const wy0 = yb - (bon + 0.015) * k, wy1 = yb - (roof - 0.03) * k;
  g.fillPolygon([[X - h * 0.76, wy0], [X + h * 0.76, wy0], [X + h * 0.6, wy1], [X - h * 0.6, wy1]], T(ir ? 0.05 : 0.17));
  // the driver behind the glass (left-hand drive)
  if (k > 14) {
    const dy = lerp(wy0, wy1, 0.5);
    // waiting drivers fidget: the head turns, leans to the window
    const hx = live ? (noise(live.D / 2.5, car.mk & 1023) - 0.5) * 0.16 * k : 0;
    g.fillRect(X - h * 0.32 - 0.12 * k, dy + 0.06 * k, 0.24 * k, wy0 - dy - 0.06 * k, T(ir ? 0.02 : 0.08));
    g.fillEllipse(X - h * 0.32 + hx, dy, 0.065 * k, 0.08 * k, T(ir ? 0.02 : 0.07));
  }
  if (!ir) g.fillPolygon([[X + h * 0.1, wy0], [X + h * 0.32, wy0], [X + h * 0.12, wy1], [X - h * 0.02, wy1]], tn(0.45), { a: 0.5 });
  // in the rain the wipers run, both arms parked low and sweeping together
  if (live && live.rain && k > 20) {
    const ph = (live.D / 1.7) % 1, sw = ph < 0.5 ? ease.inOutQuad(ph * 2) : ease.inOutQuad(2 - ph * 2);
    const a = lerp(0.12, 1.75, sw), len = h * 0.74, ly = Math.min(len * 0.62, (wy0 - wy1) * 0.9);
    for (const px of [X - h * 0.6, X + h * 0.04]) {
      g.thickLine(px, wy0 - 1, px + Math.cos(a) * len, wy0 - 1 - Math.sin(a) * ly, 1.2, tn(0.04));
    }
  }
  g.fillRect(X - h * 0.64, yb - roof * k - 0.035 * k, h * 1.28, 0.035 * k, T(Math.min(0.95, sh + 0.2)));
  g.fillRect(X - h - 0.05 * k, yb - bon * k - 0.04 * k, 0.08 * k, 0.05 * k, T(sh));
  g.fillRect(X + h - 0.03 * k, yb - bon * k - 0.04 * k, 0.08 * k, 0.05 * k, T(sh));
  // grille, headlights, plate
  g.fillRoundRect(X - 0.17 * k, yb - 0.34 * k, 0.34 * k, 0.09 * k, 0.02 * k, T(0.08));
  if (k > 40) for (let i = 1; i < 3; i++) g.fillRect(X - 0.15 * k, yb - 0.34 * k + i * 0.03 * k, 0.3 * k, 1, T(0.22));
  const hlY = yb - 0.37 * k, hlW = 0.14 * wk, hlH = Math.max(1, 0.07 * k);
  const lights = [X - h * 0.86, X + h * 0.86 - hlW];
  for (const lx of lights) g.fillRoundRect(lx, hlY, hlW, hlH, hlH * 0.4, ir ? tn(1) : tn(0.76));
  const pw = 0.3 * k, ph = Math.max(1.5, 0.085 * k), plx = X - pw / 2, ply = yb - 0.245 * k;
  g.fillRect(plx, ply, pw, ph, tn(ir ? 0.98 : 0.86));
  if (pw > 12) {
    // the plate's characters, far too small to read here: that is the crop's job
    for (const f of [0.18, 0.34, 0.66, 0.82]) g.fillRect(plx + pw * f - 0.5, ply + ph * 0.25, Math.max(1, pw * 0.08), Math.max(1, ph * 0.55), tn(0.15));
  }
  // IR night: headlights blow out, the CCD smears them into vertical lines
  if (ir) for (const lx of lights) {
    const cx = lx + hlW / 2;
    g.fillCircle(cx, hlY + hlH / 2, 0.12 * k + 1.5, tn(1), { a: 0.3 });
    g.fillRect(cx - 0.5, MAIN.y, k > 50 ? 2 : 1, MAIN.h, tn(1), { a: z > 2 ? 0.18 : 0.32 });
  }
  return { plx, ply, pw, ph };
}

function barrier(g, angle, ir) {
  const ox = MAIN.x, oy = MAIN.y, pvx = ox + 94, pvy = oy + 26;
  const L = 88, c = Math.cos(angle), s = Math.sin(angle);
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * L, b = ((i + 1) / n) * L;
    g.thickLine(pvx - c * a, pvy - s * a, pvx - c * b, pvy - s * b, 3, tn(i % 2 ? (ir ? 1 : 0.92) : 0.2));
  }
  g.fillRect(ox + 91, oy + 24, 6, 29, tn(ir ? 0.62 : 0.72));
  g.fillRect(ox + 96, oy + 24, 2, 29, tn(ir ? 0.35 : 0.45));
  g.fillRect(ox + 92, oy + 30, 4, 3, tn(0.12));
  g.fillCircle(pvx, pvy, 1.6, tn(0.3));
}

function camGate(g, f, s1, D1, ir, rain) {
  LUT = LUTS.a;
  g.clip(MAIN.x, MAIN.y, MAIN.w, MAIN.h);
  gateBackground(g, D1, ir);
  const M = f.minuteKey, items = [];
  // the next car: turns in from the street and queues, then rolls up at :58.8
  if (s1 >= 58.8) items.push({ z: lerp(2.6, 1, ease.outCubic(progress(s1, 58.8, 60.8))), u: 0, car: carOf(M + 1) });
  else {
    const ta = 16 + 22 * rand(M + 1, 11);
    if (s1 >= ta) {
      const e = ease.inOutQuad(progress(s1, ta, ta + 4.5));
      items.push({ z: lerp(6.4, 2.6, e), u: 2.2 * (1 - e) * (1 - e), car: carOf(M + 1) });
    }
  }
  // this minute's car: arriving, waiting at the barrier, or leaving under the camera
  if (s1 < 0.8) items.push({ z: lerp(2.6, 1, ease.outCubic(progress(s1 + 60, 58.8, 60.8))), u: 0, car: carOf(M), cur: true });
  else if (s1 < 57.6) items.push({ z: 1, u: 0, car: carOf(M), cur: true });
  else if (s1 < 59.3) items.push({ z: 1 - 0.76 * ease.inQuad(progress(s1, 57.6, 59.3)), u: 0, car: carOf(M) });
  items.sort((a, b) => b.z - a.z);
  // barrier: opens 57.0-57.7, closes 59.3-60.0
  const ang = s1 < 57 ? 0 : s1 < 59.3 ? (Math.PI * 0.47) * ease.inOutQuad(progress(s1, 57, 57.7)) : (Math.PI * 0.47) * (1 - ease.inOutQuad(progress(s1, 59.3, 60)));
  let plate = null, armDone = false;
  for (const it of items) {
    if (!armDone && it.z < 0.93) { barrier(g, ang, ir); armDone = true; }
    const p = carFront(g, it.z, it.u, it.car, ir, it.z <= 1.6 ? { D: D1, rain } : null);
    if (it.cur && it.z === 1) plate = p;
  }
  if (!armDone) barrier(g, ang, ir);
  if (rain) {
    // streaks in the illuminator, drops sitting on the housing window
    const k = Math.floor(D1 * 25);
    for (let i = 0; i < 46; i++) {
      const v = hash(k, i, 5), x = MAIN.x + (v % 104), y = MAIN.y + ((v >>> 8) % 58) - 3;
      g.line(x, y, x - 1, y + 3 + ((v >>> 16) & 1), tn(ir ? 0.95 : 0.85), { a: ir ? 0.45 : 0.3 });
    }
    for (let i = 0; i < 5; i++) {
      const v = hash(Math.floor(D1 / 40), i, 6);
      g.fillCircle(MAIN.x + (v % 100), MAIN.y + ((v >>> 8) % 52), 2 + ((v >>> 16) % 3), tn(0.9), { a: 0.1 });
    }
  }
  if (ir && rand(f.minuteKey, 71) < 0.55) {
    // a moth at the IR lens: a blurred bright blob that flits and lands
    const t = D1 * 1.3, mx = MAIN.x + 20 + 66 * noise(t, 81), my = MAIN.y + 6 + 40 * noise(t, 82);
    const r = 3 + 2 * noise(t * 3, 83);
    g.fillCircle(mx, my, r + 2, tn(1), { a: 0.12 });
    g.fillCircle(mx, my, r, tn(1), { a: 0.28 });
    g.fillCircle(mx, my, r * 0.45, tn(1), { a: 0.4 });
  }
  g.unclip();
  return plate;
}

// ------------------------------------------------------------ the ANPR strip

function anpr(g, f, sec, s1, ir, lockBox) {
  const x = UI.x, y = UI.y, cx = x + 1, cy = y + 1;
  g.fillRect(x, y, UI.w, UI.h, UI_BG);
  g.fillRect(x, y, UI.w, 1, 0x232a2f);
  LUT = LUTS.a;
  const car = carOf(f.minuteKey);
  let state;
  if (s1 < 0.9) state = 'SEARCH';
  else if (s1 < 1.9) state = 'ENHANCE';
  else if (s1 < 57.6) state = 'READ';
  else if (s1 < 58.4) state = 'BREAK';
  else state = 'LOST';
  if (state === 'READ') drawPlate(g, cx, cy, 1, car.plate, ir);
  else if (state === 'ENHANCE') plateBlocks(g, cx, cy, 1, [8, 4, 2, 1][Math.min(3, Math.floor((s1 - 0.9) / 0.25))], car.plate, ir);
  else if (state === 'BREAK') plateBlocks(g, cx, cy, 1, [2, 4, 8, 8][Math.min(3, Math.floor((s1 - 57.6) / 0.2))], car.plate, ir, 1 - 0.8 * progress(s1, 58.0, 58.4));
  if (state !== 'READ' && state !== 'ENHANCE') {
    if (state === 'LOST' || state === 'SEARCH') g.fillRect(cx, cy, PW, PH, tn(0.08));
    // the reader hunting: a scan bar sweeping the empty crop
    const sy = cy + Math.floor(((sec * 1.6) % 1) * PH);
    g.fillRect(cx, sy, PW, 1, GREEN, { a: 0.5 });
  }
  grain(g, { x: cx, y: cy, w: PW, h: PH }, Math.floor((f.minuteKey * 60 + sec) * 25), state === 'READ' ? 0.22 : 0.3, 1);
  // lock corners round the crop
  const locked = state === 'READ' || state === 'ENHANCE';
  const lc = car.hour && locked && s1 > 1.9 ? RED : locked ? GREEN : GREEN_DIM;
  corners(g, cx - 1, cy - 1, PW + 2, PH + 2, 3, lc);
  // the readout
  const tx = x + 63;
  g.text('ANPR', tx, y + 3, { font: font3x5, c: GREEN });
  if (Math.floor(sec * 2) % 2 === 0) g.fillCircle(tx + 35, y + 5.5, 1.6, RED);
  g.text('REC', tx + 20, y + 3, { font: font3x5, c: 0xb04040 });
  let msg;
  if (state === 'READ') msg = car.hour && s1 < 20 && Math.floor(sec * 3) % 2 ? 'HOTLIST' : `CONF ${92 + (hash(f.minuteKey, Math.floor(sec / 4)) % 8)}`;
  else if (state === 'ENHANCE') msg = 'ENHANCE';
  else if (s1 >= 57) msg = 'GATE UP';
  else msg = 'SEARCH';
  g.text(msg, tx, y + 10, { font: font3x5, c: msg === 'HOTLIST' ? RED : UI_TXT });
  g.text(`${f.dow} ${f.dd}`, tx, y + 17, { font: font3x5, c: 0x5e6a70 });
  // a live tracking box round the plate in the video
  if (lockBox && locked) corners(g, lockBox.plx - 2, lockBox.ply - 2, lockBox.pw + 4, lockBox.ph + 4, 2, lc);
}

function corners(g, x, y, w, h, l, c) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  g.fillRect(x, y, l, 1, c); g.fillRect(x, y, 1, l, c);
  g.fillRect(x + w - l, y, l, 1, c); g.fillRect(x + w - 1, y, 1, l, c);
  g.fillRect(x, y + h - 1, l, 1, c); g.fillRect(x, y + h - l, 1, l, c);
  g.fillRect(x + w - l, y + h - 1, l, 1, c); g.fillRect(x + w - 1, y + h - l, 1, l, c);
}

/** The hour: the crop zooms out of its slot to fill the monitor. */
function hotlist(g, f, sec, ir) {
  const s = sec;
  if (f.m !== 0 || s < 1.9 || s > 9.6) return;
  LUT = LUTS.a;
  const car = carOf(f.minuteKey);
  const grow = ease.inOutCubic(progress(s, 1.9, 2.6)) * (1 - ease.inOutCubic(progress(s, 8.9, 9.6)));
  const from = { x: UI.x + 1, y: UI.y + 1, w: PW, h: PH }, to = { x: 1, y: 1, w: 102, h: 78 };
  const bx = Math.round(lerp(from.x, to.x, grow)), by = Math.round(lerp(from.y, to.y, grow));
  const bw = Math.round(lerp(from.w, to.w, grow)), bh = Math.round(lerp(from.h, to.h, grow));
  g.clip(bx, by, bw, bh);
  g.fillRect(bx, by, bw, bh, tn(0.1));
  if (grow > 0.98) {
    // full zoom: the plate at 2x, the digits centred, the EU band cropped off
    drawPlate(g, -12, 19, 2, car.plate, ir);
    grain(g, { x: bx, y: by, w: bw, h: bh }, Math.floor((f.minuteKey * 60 + s) * 25), 0.25, 2);
    scanlines(g, { x: bx, y: by, w: bw, h: bh }, 0.12);
    const blink = Math.floor(s * 3) % 3 !== 2;
    g.fillRect(bx, by, bw, 11, 0x000000, { a: 0.55 });
    if (blink) g.text('HOTLIST MATCH', bx + 12, by + 2, { font: font5x7, c: RED });
    g.fillRect(bx, by + bh - 9, bw, 9, 0x000000, { a: 0.55 });
    g.text('ENHANCE X2  LANE 1', bx + 3, by + bh - 7, { font: font3x5, c: GREEN });
  } else {
    // mid-zoom: the crop is upscaled blocks until the enhance catches up
    const sc = lerp(1, 2, grow);
    plateBlocks(g, lerp(UI.x + 1, -12, grow), lerp(UI.y + 1, 19, grow), sc, grow < 0.6 ? 4 : 2, car.plate, ir);
  }
  g.unclip();
  g.rect(bx, by, bw, bh, RED);
  corners(g, bx - 1, by - 1, bw + 2, bh + 2, 4, RED);
}

// ------------------------------------------------------------ CAM02: car park from above

const BAY_W = 8, AISLE = 19;
function bayPos(i) {
  const col = i % 6, top = i < 6;
  return { x: C2.x + 3 + col * BAY_W + BAY_W / 2, y: C2.y + (top ? 7 : 31), top };
}

/** Distance-parameterised path through line and arc segments. */
function pathAt(segs, d) {
  for (const s of segs) {
    if (d <= s.len || s === segs[segs.length - 1]) {
      const u = clamp(d / s.len, 0, 1);
      if (s.arc) {
        const a = lerp(s.a0, s.a1, u);
        return [s.cx + s.r * Math.cos(a), s.cy + s.r * Math.sin(a)];
      }
      return [lerp(s.x0, s.x1, u), lerp(s.y0, s.y1, u)];
    }
    d -= s.len;
  }
  return [0, 0];
}
const pathLen = (segs) => segs.reduce((a, s) => a + s.len, 0);
const lineSeg = (x0, y0, x1, y1) => ({ x0, y0, x1, y1, len: Math.hypot(x1 - x0, y1 - y0) });
const arcSeg = (cx, cy, r, a0, a1) => ({ arc: true, cx, cy, r, a0, a1, len: Math.abs(a1 - a0) * r });

function arrivePath(bay) {
  const p = bayPos(bay), ay = C2.y + AISLE, ey = p.top ? ay - 5 : ay + 5;
  return [lineSeg(C2.x - 9, ay, p.x - 5, ay),
    p.top ? arcSeg(p.x - 5, ey, 5, Math.PI / 2, 0) : arcSeg(p.x - 5, ey, 5, -Math.PI / 2, 0),
    lineSeg(p.x, ey, p.x, p.y)];
}
function leavePath(bay) {
  const p = bayPos(bay), ay = C2.y + AISLE, ey = p.top ? ay - 5 : ay + 5;
  return [lineSeg(p.x, p.y, p.x, ey),
    p.top ? arcSeg(p.x + 5, ey, 5, Math.PI, Math.PI / 2) : arcSeg(p.x + 5, ey, 5, Math.PI, Math.PI * 1.5),
    lineSeg(p.x + 5, ay, C2.x - 10, ay)];
}

function carTop(g, x, y, ang, shade, lights) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const P = (u, v) => [x + u * c - v * s, y + u * s + v * c];
  const quad = (u0, u1, v) => [P(u0, v), P(u0, -v), P(u1, -v), P(u1, v)];
  if (lights) g.fillPolygon([P(5.5, 2.5), P(15, 6), P(15, -6), P(5.5, -2.5)], tn(1), { a: 0.16 });
  g.fillPolygon(quad(5.5, -5.5, 3.1), tn(shade));
  g.fillPolygon(quad(2.8, 0.9, 2.4), tn(0.08));
  g.fillPolygon(quad(0.9, -2.7, 2.4), tn(Math.min(0.95, shade + 0.13)));
  g.fillPolygon(quad(-2.7, -4.0, 2.2), tn(0.1));
  if (lights) { const [hx, hy] = P(5, 2), [jx, jy] = P(5, -2); g.pixel(hx, hy, tn(1)); g.pixel(jx, jy, tn(1)); }
}

/** Where a car is in the car park at second s of minute M, or null. */
function parkState(car, M, s) {
  const A = car.mk + 1, Dm = A + car.stay, p = bayPos(car.bay);
  const parked = { x: p.x, y: p.y, ang: p.top ? -Math.PI / 2 : Math.PI / 2, moving: false };
  if (M < A || M > Dm) return null;
  if (M === A) {
    const segs = arrivePath(car.bay), L = pathLen(segs), T = 2 + L / 11;
    const u = progress(s, 0.6, 0.6 + T);
    if (s < 0.6) return null;
    if (u >= 1) return { ...parked, parkedAt: 0.6 + T };
    const d = L * ease.inOutQuad(u);
    const [x, y] = pathAt(segs, d), [x2, y2] = pathAt(segs, Math.min(L, d + 0.6));
    const ang = d + 0.6 < L ? Math.atan2(y2 - y, x2 - x) : parked.ang;
    return { x, y, ang, moving: true };
  }
  if (M === Dm && s >= car.leave) {
    const segs = leavePath(car.bay), L = pathLen(segs), T = 2 + L / 11;
    const u = progress(s, car.leave, car.leave + T);
    if (u >= 1) return null;
    const d = L * ease.inOutQuad(u);
    const [x, y] = pathAt(segs, d), [x2, y2] = pathAt(segs, Math.min(L, d + 0.6));
    const L1 = segs[0].len + segs[1].len;
    let ang = Math.atan2(y2 - y, x2 - x);
    if (d < L1) ang += Math.PI; // reversing out: nose points back along the motion
    return { x, y, ang, moving: true, reversing: d < L1 };
  }
  return { ...parked, parkedAt: -1 };
}

function camPark(g, f, s2, ir) {
  LUT = LUTS.b;
  const Rc = C2, M = f.minuteKey;
  g.clip(Rc.x, Rc.y, Rc.w, Rc.h);
  g.fillRect(Rc.x, Rc.y, Rc.w, Rc.h, tn(0.4));
  // fluorescent pools along the aisle, the back walls
  for (let i = 0; i < 3; i++) g.fillEllipse(Rc.x + 9 + i * 18, Rc.y + AISLE, 9, 13, tn(0.75), { a: 0.13 });
  g.fillRect(Rc.x, Rc.y, Rc.w, 1, tn(0.18));
  g.fillRect(Rc.x, Rc.y + Rc.h - 1, Rc.w, 1, tn(0.18));
  for (let i = 0; i <= 6; i++) {
    g.fillRect(Rc.x + 3 + i * BAY_W, Rc.y + 1, 1, 12, tn(0.78));
    g.fillRect(Rc.x + 3 + i * BAY_W, Rc.y + 25, 1, 12, tn(0.78));
  }
  for (let x = Rc.x + 2; x < Rc.x + Rc.w; x += 6) g.fillRect(x, Rc.y + AISLE, 3, 1, tn(0.62));
  g.fillPolygon([[Rc.x + 26, Rc.y + 21], [Rc.x + 31, Rc.y + 21], [Rc.x + 31, Rc.y + 22], [Rc.x + 26, Rc.y + 22]], tn(0.7));
  g.fillPolygon([[Rc.x + 31, Rc.y + 20], [Rc.x + 33, Rc.y + 21.5], [Rc.x + 31, Rc.y + 23]], tn(0.7));
  // pillars
  for (const px of [Rc.x + 2, Rc.x + 26, Rc.x + 50]) { g.fillRect(px, Rc.y + 13, 3, 3, tn(0.24)); g.fillRect(px, Rc.y + 22, 3, 3, tn(0.24)); }
  // stair door, lit EXIT sign
  g.fillRect(Rc.x + Rc.w - 2, Rc.y + 15, 2, 8, tn(0.16));
  g.fillRect(Rc.x + Rc.w - 5, Rc.y + 14, 3, 1, tn(1));
  // cars: anything that arrived in the last eleven minutes and has not left
  let tracked = null;
  for (let j = 11; j >= 1; j--) {
    const car = carOf(M - j), st = parkState(car, M, s2);
    if (!st) continue;
    carTop(g, st.x, st.y, st.ang, car.shade, st.moving && !st.reversing);
    if (st.reversing) {
      const c = Math.cos(st.ang), s = Math.sin(st.ang);
      g.pixel(st.x - 5 * c - 2 * s, st.y - 5 * s + 2 * c, tn(1));
      g.pixel(st.x - 5 * c + 2 * s, st.y - 5 * s - 2 * c, tn(1));
    }
    if (j === 1) tracked = { car, st };
  }
  // the driver of the car that just came in walks to the stair door
  let walker = null;
  if (tracked && tracked.st.parkedAt > 0) {
    const t0 = tracked.st.parkedAt + 0.8, t1 = 16.6;
    if (s2 >= t0 && s2 < t1) {
      const p = bayPos(tracked.car.bay), ay = Rc.y + AISLE;
      const segs = [lineSeg(p.x + 4.5, p.y, p.x + 4.5, ay), lineSeg(p.x + 4.5, ay, Rc.x + Rc.w, ay - 0.5)];
      const L = pathLen(segs), d = L * progress(s2, t0, t1);
      const [x, y] = pathAt(segs, d);
      const step = Math.floor(d / 1.6) % 2;
      g.fillEllipse(x, y, step ? 1.2 : 1.6, 2.2, tn(tracked.car.coat));
      g.fillCircle(x, y, 1.1, tn(Math.min(0.9, tracked.car.coat + 0.25)));
      walker = { x, y };
    }
  }
  g.unclip();
  if (tracked && tracked.car.hour) {
    const st = tracked.st;
    if (walker) g.rect(Math.round(walker.x) - 3, Math.round(walker.y) - 4, 7, 8, RED);
    else g.rect(Math.round(st.x) - 7, Math.round(st.y) - 7, 14, 14, RED);
  }
}

// ------------------------------------------------------------ CAM03-05: the sequencer

function camSeq(g, f, s2, ir) {
  LUT = LUTS.c;
  const Rc = C3, M = f.minuteKey;
  const car = carOf(M - 1);
  let cam, from, to, walker = false;
  if (s2 >= 16.6 && s2 < 27) { cam = 'STAIRS'; from = 16.6; to = 27; walker = true; }
  else if (s2 >= 27 && s2 < 41) { cam = 'LOBBY'; from = 27; to = 41; walker = true; }
  else if (s2 >= 41 && s2 < 55) { cam = 'CORRIDOR'; from = 41; to = 55; walker = true; }
  else if (s2 >= 55 || s2 < 2.3) { cam = 'LOBBY'; from = 55; to = 62.3; }
  else if (s2 < 9.6) { cam = 'CORRIDOR'; from = 2.3; to = 9.6; }
  else { cam = 'STAIRS'; from = 9.6; to = 16.6; }
  const local = s2 >= from ? s2 - from : s2 + 60 - from;
  const u = local / (to - from);
  const night = f.h >= 19 || f.h < 7;
  g.clip(Rc.x, Rc.y, Rc.w, Rc.h);
  let box = null;
  if (cam === 'STAIRS') box = stairs(g, Rc, walker ? u : -1, car, night, s2);
  else if (cam === 'LOBBY') box = lobby(g, Rc, walker ? u : -1, car, night, s2, M);
  else box = corridor(g, Rc, walker ? u : -1, car, night, s2);
  // a cut between cameras: the picture rolls in out of black
  if (cam !== 'STAIRS' || !walker) {
    if (local < 0.25) {
      g.fillRect(Rc.x, Rc.y, Rc.w, Rc.h, 0x000000, { a: 1 - local / 0.25 });
      for (let i = 0; i < 3; i++) g.fillRect(Rc.x, Rc.y + (hash(Math.floor(s2 * 12.5), i) % Rc.h), Rc.w, 1, tn(0.8), { a: 0.6 });
    }
  }
  // a slow hum bar rolling down this monitor
  const hb = ((s2 / 7) % 1) * (Rc.h + 10) - 5;
  g.fillRect(Rc.x, Rc.y + hb, Rc.w, 4, 0xffffff, { a: 0.05 });
  g.unclip();
  if (box && car.hour) g.rect(box[0], box[1], box[2], box[3], RED);
  const id = { STAIRS: 'CAM03 STAIR', LOBBY: 'CAM04 LOBBY', CORRIDOR: 'CAM05 HALL' }[cam];
  return { id };
}

function stairs(g, Rc, u, car, night, s2) {
  const ox = Rc.x, oy = Rc.y;
  g.fillRect(ox, oy, Rc.w, Rc.h, tn(night ? 0.44 : 0.56));
  g.fillRect(ox, oy + 30, Rc.w, 8, tn(night ? 0.3 : 0.4));
  // a fluorescent fitting, flickering at night
  const flick = night && rand(Math.floor(s2 * 12.5), 41) < 0.12;
  g.fillRect(ox + 8, oy + 2, 14, 1, tn(flick ? 0.5 : 1));
  g.fillEllipse(ox + 15, oy + 6, 14, 6, tn(1), { a: flick ? 0.02 : 0.08 });
  // the flight: 9 steps up to a landing on the right
  const pts = [[ox, oy + 34]];
  for (let i = 0; i < 9; i++) { const x = ox + 6 + i * 4, y = oy + 34 - i * 3; pts.push([x, y], [x, y - 3]); }
  pts.push([ox + 42, oy + 7], [ox + Rc.w, oy + 7], [ox + Rc.w, oy + 38], [ox, oy + 38]);
  g.fillPolygon(pts, tn(night ? 0.26 : 0.34));
  for (let i = 0; i < 9; i++) g.fillRect(ox + 6 + i * 4, oy + 31 - i * 3, 4, 1, tn(night ? 0.55 : 0.7));
  g.fillRect(ox + 42, oy + 7, Rc.w - 42, 1, tn(0.7));
  // handrail and posts
  g.thickLine(ox + 2, oy + 26, ox + 42, oy - 1, 1, tn(0.82));
  for (let i = 0; i < 4; i++) { const x = ox + 8 + i * 10; g.fillRect(x, oy + 26 - (x - ox - 2) * 0.68 + 1, 1, 7, tn(0.62)); }
  // the stair door to the landing, a running-man sign
  g.fillRect(ox + 46, oy - 1, 7, 8, tn(night ? 0.2 : 0.28));
  g.fillRect(ox + 44, oy + 1, 1, 2, tn(1));
  if (u < 0) return null;
  // the driver climbs: in at the bottom left, out through the landing door
  const climb = progress(u, 0.05, 0.85);
  const x = lerp(ox - 2, ox + 46, climb);
  const yf = x < ox + 6 ? oy + 34 : x < ox + 42 ? oy + 34 - ((x - ox - 6) / 4) * 3 : oy + 7;
  const fade = 1 - progress(u, 0.88, 0.96);
  if (fade > 0) {
    person(g, x, yf, 12, climb * 9, 1, car.coat);
    return [Math.round(x) - 5, Math.round(yf) - 14, 11, 16];
  }
  return null;
}

function lobby(g, Rc, u, car, night, s2, M) {
  const ox = Rc.x, oy = Rc.y, w = Rc.w;
  // windows on the back wall: daylight, or black glass with reflections
  g.fillRect(ox, oy, w, 18, tn(night ? 0.08 : 0.86));
  if (!night) { g.fillRect(ox, oy + 11, w, 7, tn(0.62)); for (let i = 0; i < 5; i++) g.fillCircle(ox + 6 + i * 11, oy + 10, 4, tn(0.5)); }
  else for (let i = 0; i < 4; i++) g.fillRect(ox + 4 + i * 13, oy + 3, 5, 1, tn(0.5));
  for (let x = ox; x < ox + w; x += 9) g.fillRect(x, oy, 1, 18, tn(0.22));
  // the floor, polished: the windows reflect in it
  g.fillRect(ox, oy + 18, w, 20, tn(night ? 0.38 : 0.55));
  g.fillRect(ox, oy + 19, w, 3, tn(night ? 0.42 : 0.72), { a: 0.5 });
  for (const y of [23, 28, 34]) g.fillRect(ox, oy + y, w, 1, tn(night ? 0.32 : 0.48));
  // reception desk, a plant, the lift
  g.fillRect(ox + 2, oy + 16, 15, 9, tn(0.24));
  g.fillRect(ox + 2, oy + 16, 15, 1, tn(0.7));
  if (!night) { g.fillCircle(ox + 9, oy + 13, 1.6, tn(0.3)); g.fillRect(ox + 7, oy + 15, 5, 1, tn(0.3)); }
  g.fillEllipse(ox + 26, oy + 15, 3, 4, tn(0.15));
  g.fillRect(ox + 25, oy + 18, 3, 3, tn(0.3));
  const lift = w - 13;
  g.fillRect(ox + lift - 1, oy + 4, 12, 19, tn(0.3));
  // lift doors: open 0.62-0.70, closed again by 0.86
  const open = u < 0 ? 0 : progress(u, 0.62, 0.7) * (1 - progress(u, 0.78, 0.86));
  const dw = Math.round(5 * (1 - open));
  g.fillRect(ox + lift, oy + 5, 10, 18, tn(0.12));
  g.fillRect(ox + lift, oy + 5, dw, 18, tn(0.7));
  g.fillRect(ox + lift + 10 - dw, oy + 5, dw, 18, tn(0.66));
  g.fillRect(ox + lift + 4, oy + 2, 2, 1, tn(open > 0 ? 1 : 0.55));
  // somebody else crossing now and then, by day
  if (!night) {
    const k = Math.floor((M * 60 + s2) / 13);
    if (rand(k, 51) < 0.5) {
      const v = ((M * 60 + s2) - k * 13) / 9;
      if (v >= 0 && v <= 1) person(g, lerp(ox + w + 4, ox - 4, v), oy + 36, 15, v * 6, -1, [0.15, 0.7][hash(k, 52) % 2]);
    }
  }
  if (u < 0) return null;
  // the driver: in from the left, across to the lift, in, doors close
  const walk = progress(u, 0.02, 0.6);
  const into = progress(u, 0.7, 0.78);
  const x = lerp(lerp(ox - 4, ox + lift + 5, walk), ox + lift + 5, into);
  const yf = lerp(oy + 34, oy + 24.5, walk) - into * 1.5;
  const h = lerp(16, 12, walk);
  if (into < 1) {
    person(g, x, yf, h, walk * 8 + into * 1.5, walk < 1 ? 1 : 0, car.coat);
    return [Math.round(x - h * 0.45), Math.round(yf - h - 2), Math.round(h * 0.9), Math.round(h + 4)];
  }
  return null;
}

function corridor(g, Rc, u, car, night, s2) {
  const ox = Rc.x, oy = Rc.y, w = Rc.w, h = Rc.h;
  const vx = ox + 27, vy = oy + 15, F = 14;
  const P = (X, Y, z) => [vx + (X * F) / z, vy + (Y * F) / z];
  const HW = 1.7, FL = 1.6, CE = -1.2, Z0 = 0.6, Z1 = 9;
  const quad = (a, b, c, d, v) => g.fillPolygon([a, b, c, d], tn(v));
  quad(P(-HW, CE, Z0), P(HW, CE, Z0), P(HW, CE, Z1), P(-HW, CE, Z1), night ? 0.3 : 0.52);
  quad(P(-HW, FL, Z0), P(HW, FL, Z0), P(HW, FL, Z1), P(-HW, FL, Z1), night ? 0.36 : 0.6);
  quad(P(-HW, CE, Z0), P(-HW, FL, Z0), P(-HW, FL, Z1), P(-HW, CE, Z1), night ? 0.4 : 0.68);
  quad(P(HW, CE, Z0), P(HW, FL, Z0), P(HW, FL, Z1), P(HW, CE, Z1), night ? 0.34 : 0.6);
  const [ex0, ey0] = P(-HW, CE, Z1), [ex1, ey1] = P(HW, FL, Z1);
  g.fillRect(ex0, ey0, ex1 - ex0, ey1 - ey0, tn(night ? 0.18 : 0.3));
  g.fillRect(vx - 1, ey0 + 1, 2, ey1 - ey0 - 1, tn(0.12));
  // ceiling lights, reflected in the floor; one tube flickers at night
  const fl = night && rand(Math.floor(s2 * 12.5), 61) < 0.2;
  for (const z of [1.2, 2.2, 3.6, 6]) {
    const on = !(fl && z === 2.2);
    quad(P(-0.35, CE, z), P(0.35, CE, z), P(0.35, CE, z + 0.35), P(-0.35, CE, z + 0.35), on ? 1 : 0.4);
    if (on) quad(P(-0.35, FL, z), P(0.35, FL, z), P(0.35, FL, z + 0.35), P(-0.35, FL, z + 0.35), night ? 0.5 : 0.75);
  }
  // doors along both walls
  for (const z of [1.5, 3, 4.8]) {
    quad(P(-HW, -0.4, z), P(-HW, FL, z), P(-HW, FL, z + 0.7), P(-HW, -0.4, z + 0.7), 0.24);
    quad(P(HW, -0.4, z + 0.4), P(HW, FL, z + 0.4), P(HW, FL, z + 1.1), P(HW, -0.4, z + 1.1), 0.22);
  }
  if (u < 0) return null;
  // the driver walks away from the camera and turns in at the far right door
  const walk = progress(u, 0.02, 0.82);
  const z = lerp(0.9, 5.4, ease.inOutQuad(walk) * 0.3 + walk * 0.7);
  const side = progress(u, 0.82, 0.92);
  const [px, py] = P(lerp(0.2, HW - 0.2, side), FL, z);
  const hh = (1.75 * F) / z;
  if (u < 0.93) {
    person(g, px, py, hh, walk * 14, side > 0 ? 1 : 0, car.coat);
    return [Math.round(px - hh * 0.4), Math.round(py - hh - 2), Math.round(hh * 0.8), Math.round(hh + 4)];
  }
  return null;
}

// ------------------------------------------------------------ the frame

export default {
  name: 'Night Shift',
  blurb: 'A security monitor wall: each minute a car pulls up to the barrier and the ANPR camera reads its plate, which is the time; the other feeds follow its driver through the building.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const ir = f.h >= 19 || f.h < 7;
    const s1 = Math.floor(sec * 25) / 25, s2 = Math.floor(sec * 12.5) / 12.5;
    const D1 = f.minuteKey * 60 + s1;
    const k1 = Math.floor(D1 * 25), k2 = Math.floor((f.minuteKey * 60 + s2) * 12.5);

    g.clear(WALL);
    for (const Rc of [{ x: 0, y: 0, w: 104, h: 80 }, { x: 104, y: 0, w: 56, h: 40 }, { x: 104, y: 40, w: 56, h: 40 }]) {
      g.fillRect(Rc.x, Rc.y, Rc.w, Rc.h, BEZEL);
      g.fillRect(Rc.x, Rc.y, Rc.w, 1, BEZEL_HI);
    }

    // CAM01, the gate
    const rain = rand(Math.floor(f.minuteKey / 60), 99) < 0.3;
    const lockBox = camGate(g, f, s1, D1, ir, rain);
    LUT = LUTS.a;
    grain(g, MAIN, k1, ir ? 0.26 : 0.18);
    scanlines(g, MAIN);
    vignette(g, MAIN);
    osd(g, 'CAM01 ENTRY', MAIN.x + 3, MAIN.y + 3);
    if (ir) osd(g, 'IR', MAIN.x + 3, MAIN.y + 10);
    osd(g, `${f.hh}:${f.mm}:${f.ss}`, MAIN.x + MAIN.w - 50, MAIN.y + 3, { font: font5x7 });

    // CAM02, the car park
    camPark(g, f, s2, ir);
    LUT = LUTS.b;
    grain(g, C2, k2, 0.2);
    scanlines(g, C2);
    vignette(g, C2);
    osd(g, 'CAM02 P1', C2.x + 3, C2.y + 3);
    osd(g, `${f.hh}:${f.mm}:${f.ss}`, C2.x + 3, C2.y + C2.h - 8);

    // CAM03-05, the sequencer following the driver
    const seq = camSeq(g, f, s2, ir);
    LUT = LUTS.c;
    grain(g, C3, k2 + 7, 0.2);
    scanlines(g, C3);
    vignette(g, C3);
    osd(g, seq.id, C3.x + 3, C3.y + 3);
    osd(g, `${f.hh}:${f.mm}:${f.ss}`, C3.x + 3, C3.y + C3.h - 8);

    // the ANPR strip under the gate video, and the hour's hotlist zoom
    anpr(g, f, sec, s1, ir, lockBox);
    hotlist(g, f, sec, ir);

    // ALARM on the wall in the hour's first minute and the next
    const alarm = (f.m === 0 && sec >= 1.9) || (f.m === 1 && sec < 56);
    if (alarm && Math.floor(sec * 2) % 2 === 0) {
      osd(g, 'ALARM', C2.x + C2.w - 23, C2.y + 10, { c: RED });
      osd(g, 'ALARM', C3.x + C3.w - 23, C3.y + 10, { c: RED });
    }
  },
};
