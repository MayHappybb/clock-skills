// Crossroads drawing: the frame's buffers and the top-down sprites.
// Everything is drawn by coverage in local coordinates (u along the heading,
// v to the right), so vehicles and people glide and turn between pixels.
// Buffers (192 x 192 grid, linear):
//   ALB  surface colour (what the light falls on), SH sun shadow 0..1,
//   LADD extra light on the ground (headlight beams), EM emitted light.
export const W = 192, N = W * W;
export const ALB = new Float32Array(3 * N), SH = new Float32Array(N);
export const LADD = new Float32Array(3 * N), EM = new Float32Array(3 * N);

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Signed distance to a rounded rectangle of half sizes a, b and corner r. */
function sdBox(u, v, a, b, r) {
  const qx = Math.abs(u) - a + r, qy = Math.abs(v) - b + r;
  const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0;
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Soft additive dot of radius r (px) into buffer B. */
export function dot(B, x, y, r, c0, c1, c2, a) {
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(W - 1, Math.ceil(y + r));
  const ir2 = 1 / (r * r);
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const dx = px + 0.5 - x, dy = py + 0.5 - y, q = 1 - (dx * dx + dy * dy) * ir2;
    if (q <= 0) continue;
    const f = a * q * q, p = 3 * (py * W + px);
    B[p] += c0 * f; B[p + 1] += c1 * f; B[p + 2] += c2 * f;
  }
}
/** Paint a soft disc over ALB (opacity a at the centre). */
export function blob(x, y, r, c0, c1, c2, a) {
  if (!(r > 0.2)) return;
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(W - 1, Math.ceil(y + r));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const d = Math.hypot(px + 0.5 - x, py + 0.5 - y);
    const k = a * clamp01(1 - d / r) * clamp01(r - d + 0.5);
    if (k <= 0) continue;
    const p = 3 * (py * W + px);
    ALB[p] += (c0 - ALB[p]) * k; ALB[p + 1] += (c1 - ALB[p + 1]) * k; ALB[p + 2] += (c2 - ALB[p + 2]) * k;
  }
}
/** A thin ring of emitted light (horn blasts). */
export function ring(x, y, r, w, c0, c1, c2, a) {
  const R = r + w + 1;
  const x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(W - 1, Math.ceil(x + R));
  const y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(W - 1, Math.ceil(y + R));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const d = Math.abs(Math.hypot(px + 0.5 - x, py + 0.5 - y) - r);
    const k = a * clamp01(1 - d / w);
    if (k <= 0) continue;
    const p = 3 * (py * W + px);
    EM[p] += c0 * k; EM[p + 1] += c1 * k; EM[p + 2] += c2 * k;
  }
}

// vehicle kinds: half length, half width, corner
export const KIND = {
  car: { hl: 10, hw: 5.5, rc: 2.6, id: 0 },
  taxi: { hl: 10, hw: 5.5, rc: 2.6, id: 1 },
  van: { hl: 12, hw: 6, rc: 2, id: 2 },
  bus: { hl: 20, hw: 6.6, rc: 1.8, id: 3 },
  bike: { hl: 4.5, hw: 2.4, rc: 1.5, id: 4 },
};

const GLASS = [0.012, 0.018, 0.03];
/**
 * A vehicle seen from above at (x, y), heading h (radians, screen coords).
 * col: body colour (linear). lights: 0 day, 1 night. brake 0..1.
 * shadow (sx, sy): sun-shadow offset in px, or sx = NaN for none.
 */
export function vehicle(K, x, y, h, col, lights, brake, sx, sy, shadowK) {
  const c = Math.cos(h), s = Math.sin(h), hl = K.hl, hw = K.hw, rc = K.rc, id = K.id;
  const R = hl + 2;
  // sun shadow first (onto the ground)
  if (shadowK > 0) {
    const X = x + sx, Y = y + sy;
    const x0 = Math.max(0, Math.floor(X - R)), x1 = Math.min(W - 1, Math.ceil(X + R));
    const y0 = Math.max(0, Math.floor(Y - R)), y1 = Math.min(W - 1, Math.ceil(Y + R));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - X, dy = py + 0.5 - Y;
      const u = dx * c + dy * s, v = -dx * s + dy * c;
      const k = clamp01(0.5 - sdBox(u, v, hl - 0.5, hw - 0.5, rc) * 0.6) * shadowK;
      const p = py * W + px;
      if (k > SH[p]) SH[p] = k;
    }
  }
  const x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(W - 1, Math.ceil(x + R));
  const y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(W - 1, Math.ceil(y + R));
  const r0 = col[0], g0 = col[1], b0 = col[2];
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const dx = px + 0.5 - x, dy = py + 0.5 - y;
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    if (id === 4) {                                     // bicycle + rider
      const kb = clamp01(0.9 - Math.abs(v)) * clamp01(hl + 0.5 - Math.abs(u));
      const kr = clamp01(1.9 - Math.hypot(u * 1.6 + 0.3, v * 0.75));
      const kh = clamp01(1.3 - Math.hypot(u - 0.2, v));
      if (kb + kr + kh <= 0) continue;
      const p = 3 * (py * W + px);
      let a = kb * 0.8;
      if (a > 0) { ALB[p] += (0.05 - ALB[p]) * a; ALB[p + 1] += (0.05 - ALB[p + 1]) * a; ALB[p + 2] += (0.06 - ALB[p + 2]) * a; }
      if (kr > 0) { ALB[p] += (r0 - ALB[p]) * kr; ALB[p + 1] += (g0 - ALB[p + 1]) * kr; ALB[p + 2] += (b0 - ALB[p + 2]) * kr; }
      if (kh > 0) { ALB[p] += (0.5 - ALB[p]) * kh; ALB[p + 1] += (0.42 - ALB[p + 1]) * kh; ALB[p + 2] += (0.3 - ALB[p + 2]) * kh; }
      continue;
    }
    const d = sdBox(u, v, hl, hw, rc);
    const k = clamp01(0.5 - d);
    if (k <= 0) continue;
    let cr = r0, cg = g0, cb = b0;
    const av = Math.abs(v);
    if (id === 3) {                                     // bus: roof, front screen, AC pods
      if (u > hl - 3.2 && av < hw - 1) { cr = GLASS[0]; cg = GLASS[1]; cb = GLASS[2]; }
      else if (av < hw - 1.4 && u < hl - 4) {
        const roof = 0.85; cr *= roof; cg *= roof; cb *= roof;
        if (av < 3 && ((u > 3 && u < 8) || (u > -12 && u < -7))) { cr = 0.28; cg = 0.29; cb = 0.3; }
      }
    } else {
      const ws0 = id === 2 ? hl - 7.5 : 2.4, ws1 = id === 2 ? hl - 4.2 : 5.6;
      if (u > ws0 && u < ws1 && av < hw - 0.9) { cr = GLASS[0]; cg = GLASS[1]; cb = GLASS[2]; }      // windscreen
      else if (id !== 2 && u > -8 && u < -5.2 && av < hw - 1.1) { cr = GLASS[0]; cg = GLASS[1]; cb = GLASS[2]; } // rear window
      else if (u <= ws0 && u >= (id === 2 ? -hl + 1 : -5.2) && av < hw - 1.2) {                    // roof catches light
        cr = Math.min(1, cr * 1.25 + 0.02); cg = Math.min(1, cg * 1.25 + 0.02); cb = Math.min(1, cb * 1.25 + 0.02);
        if (id === 1 && Math.abs(u + 1.2) < 1.2 && av < 2.6) { cr = 0.9; cg = 0.85; cb = 0.6; }     // taxi roof sign
      }
    }
    const p = 3 * (py * W + px);
    ALB[p] += (cr - ALB[p]) * k; ALB[p + 1] += (cg - ALB[p + 1]) * k; ALB[p + 2] += (cb - ALB[p + 2]) * k;
  }
  if (id === 4) {
    if (lights > 0) dot(EM, x + c * hl, y + s * hl, 1.3, 1, 0.9, 0.7, 0.5 * lights);
    return;
  }
  // lamps
  const fu = hl - 0.6, ru = -hl + 0.6, lv = hw - 1.6;
  const hx = x + c * fu, hy = y + s * fu, tx = x + c * ru, ty = y + s * ru, ox = -s * lv, oy = c * lv;
  const head = 0.12 + 0.88 * lights;
  dot(EM, hx + ox, hy + oy, 1.25, 1, 0.92, 0.75, 0.55 * head);
  dot(EM, hx - ox, hy - oy, 1.25, 1, 0.92, 0.75, 0.55 * head);
  const tail = 0.12 + 0.35 * lights + 0.6 * brake;
  dot(EM, tx + ox, ty + oy, 1.25, 1, 0.04, 0.02, 0.6 * tail);
  dot(EM, tx - ox, ty - oy, 1.25, 1, 0.04, 0.02, 0.6 * tail);
  if (id === 1 && lights > 0) dot(EM, x - c * 1.2, y - s * 1.2, 1.6, 1, 0.8, 0.3, 0.25 * lights);
  // headlight beams on the road ahead
  if (lights > 0.02) {
    const L = 30, x0b = Math.max(0, Math.floor(hx - L)), x1b = Math.min(W - 1, Math.ceil(hx + L));
    const y0b = Math.max(0, Math.floor(hy - L)), y1b = Math.min(W - 1, Math.ceil(hy + L));
    for (let py = y0b; py <= y1b; py++) for (let px = x0b; px <= x1b; px++) {
      const dx = px + 0.5 - hx, dy = py + 0.5 - hy;
      const u = dx * c + dy * s;
      if (u <= 0 || u > L) continue;
      const v = Math.abs(-dx * s + dy * c), wdt = hw * 0.8 + u * 0.42;
      if (v > wdt + 1) continue;
      const f = lights * 2.4 * clamp01(wdt + 1 - v) * (1 - u / L) * Math.min(1, u / 3) * (1 - 0.5 * v / (wdt + 1));
      const p = 3 * (py * W + px);
      LADD[p] += f; LADD[p + 1] += f * 0.92; LADD[p + 2] += f * 0.78;
    }
  }
}

/**
 * A person seen from above: shoulders, head, legs scissoring with `step`
 * (radians). sc scales (1 = pedestrian, 1.3 = road crew). hat: hair or hat colour.
 */
export function person(x, y, h, sc, shirt, hat, step, sx, sy, shadowK) {
  const c = Math.cos(h), s = Math.sin(h), R = 4.5 * sc;
  const sw = Math.sin(step) * 1.9 * sc;
  if (shadowK > 0) {
    const X = x + sx * 0.8, Y = y + sy * 0.8;
    const x0 = Math.max(0, Math.floor(X - R)), x1 = Math.min(W - 1, Math.ceil(X + R));
    const y0 = Math.max(0, Math.floor(Y - R)), y1 = Math.min(W - 1, Math.ceil(Y + R));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - X, dy = py + 0.5 - Y;
      const u = dx * c + dy * s, v = -dx * s + dy * c;
      const k = clamp01(1.2 - Math.hypot(u / (1.5 * sc), v / (2.6 * sc))) * shadowK * 0.8;
      const p = py * W + px;
      if (k > SH[p]) SH[p] = k;
    }
  }
  const x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(W - 1, Math.ceil(x + R));
  const y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(W - 1, Math.ceil(y + R));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const dx = px + 0.5 - x, dy = py + 0.5 - y;
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    const p = 3 * (py * W + px);
    // legs: two dark dots fore and aft, scissoring
    const kl = Math.max(clamp01(1.0 - Math.hypot(u - sw, v - 1 * sc)), clamp01(1.0 - Math.hypot(u + sw, v + 1 * sc)));
    if (kl > 0) { const a = kl * 0.9; ALB[p] += (0.03 - ALB[p]) * a; ALB[p + 1] += (0.03 - ALB[p + 1]) * a; ALB[p + 2] += (0.04 - ALB[p + 2]) * a; }
    const ks = clamp01(1.3 - Math.hypot(u / (1.35 * sc), v / (2.5 * sc)) * 1.3);
    if (ks > 0) { ALB[p] += (shirt[0] - ALB[p]) * ks; ALB[p + 1] += (shirt[1] - ALB[p + 1]) * ks; ALB[p + 2] += (shirt[2] - ALB[p + 2]) * ks; }
    const kh = clamp01(1.25 * sc + 0.3 - Math.hypot(u - 0.2 * sc, v));
    if (kh > 0) { ALB[p] += (hat[0] - ALB[p]) * kh; ALB[p + 1] += (hat[1] - ALB[p + 1]) * kh; ALB[p + 2] += (hat[2] - ALB[p + 2]) * kh; }
  }
}

/**
 * A ride-on road-crew machine from above: body (hl x hw, colour col), a
 * driver in a white hard hat at the back, an amber beacon on a mast whose
 * rotating beam sweeps the asphalt. kind 0 grinder (dark drum in front),
 * 1 line painter (white paint tank). t drives the beacon.
 */
export function machine(x, y, h, kind, t, sx, sy, shK, night) {
  const c = Math.cos(h), s = Math.sin(h), hl = kind ? 6.5 : 7.5, hw = kind ? 4.2 : 5.2, R = hl + 4;
  if (shK > 0) {
    const X = x + sx, Y = y + sy;
    for (let py = Math.max(0, Math.floor(Y - R)); py <= Math.min(W - 1, Math.ceil(Y + R)); py++) for (let px = Math.max(0, Math.floor(X - R)); px <= Math.min(W - 1, Math.ceil(X + R)); px++) {
      const dx = px + 0.5 - X, dy = py + 0.5 - Y, u = dx * c + dy * s, v = -dx * s + dy * c;
      const k = clamp01(0.5 - sdBox(u, v, hl, hw, 1.5) * 0.6) * shK, p = py * W + px;
      if (k > SH[p]) SH[p] = k;
    }
  }
  for (let py = Math.max(0, Math.floor(y - R)); py <= Math.min(W - 1, Math.ceil(y + R)); py++) for (let px = Math.max(0, Math.floor(x - R)); px <= Math.min(W - 1, Math.ceil(x + R)); px++) {
    const dx = px + 0.5 - x, dy = py + 0.5 - y, u = dx * c + dy * s, v = -dx * s + dy * c;
    let k = clamp01(0.5 - sdBox(u, v, hl, hw, 1.5)), cr = 0.85, cg = 0.42, cb = 0.02;
    // front: the grinder's drum, or the painter's paint tank
    const kf = kind ? clamp01(1.4 - Math.hypot(u - 2.2, v) / 1.0 * 0.5) : clamp01(0.5 - sdBox(u - hl - 1.5, v, 2, hw + 0.6, 1));
    // black-and-yellow chevrons on the rear bumper
    if (u < -hl + 2) { const st = ((Math.floor(v + u + 20) % 3) + 3) % 3; if (st === 0) { cr = 0.04; cg = 0.04; cb = 0.04; } }
    // the driver's white hard hat
    const kh = clamp01(2.4 - Math.hypot(u + 2.2, v));
    if (k <= 0 && kf <= 0) continue;
    const p = 3 * (py * W + px);
    if (k > 0) { ALB[p] += (cr - ALB[p]) * k; ALB[p + 1] += (cg - ALB[p + 1]) * k; ALB[p + 2] += (cb - ALB[p + 2]) * k; }
    if (kf > 0) {
      const fc = kind ? 0.9 : 0.06;
      ALB[p] += (fc - ALB[p]) * kf; ALB[p + 1] += (fc - ALB[p + 1]) * kf; ALB[p + 2] += (fc * 0.95 - ALB[p + 2]) * kf;
    }
    if (kh > 0) { ALB[p] += (0.95 - ALB[p]) * kh; ALB[p + 1] += (0.95 - ALB[p + 1]) * kh; ALB[p + 2] += (0.9 - ALB[p + 2]) * kh; }
  }
  // beacon: a flashing amber lamp on the mast and its beam turning on the road
  const bx = x - c * (hl - 2.2) + s * (hw - 1.4), by = y - s * (hl - 2.2) - c * (hw - 1.4);
  const ang = t * 7.5, fl = 0.55 + 0.45 * Math.cos(t * 7.5 * 2);
  dot(EM, bx, by, 1.8, 1, 0.5, 0.02, 0.9 * fl);
  const L = 22, ca = Math.cos(ang), sa = Math.sin(ang), gain = 0.35 + 1.4 * night;
  for (let py = Math.max(0, Math.floor(by - L)); py <= Math.min(W - 1, Math.ceil(by + L)); py++) for (let px = Math.max(0, Math.floor(bx - L)); px <= Math.min(W - 1, Math.ceil(bx + L)); px++) {
    const dx = px + 0.5 - bx, dy = py + 0.5 - by, d = Math.hypot(dx, dy);
    if (d > L || d < 1) continue;
    const cos = (dx * ca + dy * sa) / d;
    if (cos < 0.8) continue;
    const f = gain * (cos - 0.8) * 5 * (1 - d / L), p = 3 * (py * W + px);
    LADD[p] += f; LADD[p + 1] += f * 0.48; LADD[p + 2] += f * 0.02;
  }
}
