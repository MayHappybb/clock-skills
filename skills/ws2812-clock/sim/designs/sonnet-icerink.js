// Night Ice: a floodlit outdoor rink seen from directly above. The time is
// not printed on the ice, it is CARVED into it: a figure skater's blade
// traces each numeral in one continuous ice-script stroke (with a small
// flourish hook where the blade enters and exits, the way a skater curls
// out of a figure), cutting a bright double-edged groove into mirror-black
// ice. Floodlight reflections slide across the polish, snow sifts down and
// settles, and a lone skater is always circling the rink leaving a scratch
// that fades. At the minute turn a Zamboni drives one lap over the changing
// digit, its blade wiping the grooves to a steaming mirror sheen, then a
// skater carves the new numeral in a single performance pass (a spin and a
// small jump throw spray at the turns). On the hour the floodlights swing
// into a two-spot show, a pair glides a lap, the whole sheet is resurfaced,
// and the full time is re-carved while staying readable throughout.
import * as kit from '../js/kit.js';
import { iceSegs } from './sonnet-icerink-font.js';

const ICE_DEEP = [0.012, 0.022, 0.034];    // mirror-black ice at centre, faint blue
const ICE_LIFT = [0.05, 0.1, 0.16];        // ice near the rail, floodlit more
const GROOVE = [0.6, 0.82, 1.0];           // carved line, bright blue-white
const GROOVE_HOT = [0.97, 1.0, 1.0];       // groove core highlight
const BOARD = [0.16, 0.1, 0.045];          // rink boards, warm amber-lit wood
const AD = [0.22, 0.16, 0.05];             // ad stripe on boards, brighter amber
const RAIL_LIGHT = [0.3, 0.26, 0.16];      // bright cap along the top of the boards
const LINE_RED = [0.22, 0.02, 0.02];       // centre circle / goal line, dim red on ice
const LINE_BLUE = [0.025, 0.07, 0.22];     // blue line, dim
const FLOOD = [0.5, 0.6, 0.75];            // floodlight reflection pool
const SKATER_BODY = [0.62, 0.64, 0.72];    // lit jacket, bright enough to read as a figure, not a stray pixel
const SCARF = kit.hex('#e8502f');
const SPRAY = [0.85, 0.92, 1.0];
const STEAM = [0.35, 0.38, 0.44];
const SPOT = [0.75, 0.6, 0.9];

const pad = (n) => String(n).padStart(2, '0');
const timeDigits = (d) => [pad(d.getHours())[0], pad(d.getHours())[1], pad(d.getMinutes())[0], pad(d.getMinutes())[1]];

// --- layout: single row of 4 digits, centred, inside the rink's safe oval ---
const DW = 15, DH = 24, GAP = 4, COLON_GAP = 7; // mm-ish units but we use grid px directly
function digitPlan(W, H) {
  const totalW = DW * 4 + GAP * 2 + COLON_GAP;
  const x0 = (W - totalW) / 2, y0 = (H - DH) / 2;
  const xs = [x0, x0 + DW + GAP, x0 + DW * 2 + GAP + COLON_GAP, x0 + DW * 3 + GAP + COLON_GAP];
  return { xs, y0, dw: DW, dh: DH, cx: x0 + totalW / 2, cy: y0 + DH / 2 };
}

/** Resurface sweep: the Zamboni's X position across the rink at animation
 * fraction k (0..1 of its lap), and whether grid column gx is already wiped. */
function zamboniX(W, k) { return -14 + (W + 28) * kit.ease.inOut(k); }

export default {
  name: 'Night Ice',
  blurb: 'an outdoor rink at night: a skater carves each numeral into mirror ice; a Zamboni resurfaces the change',
  layouts: ['hub-x2'], look: 'smoke', fps: 60, brightness: 0.32,
  frame(ctx) {
    const G = kit.grid(ctx);
    if (!G) return;
    const { w: W, h: H, idx } = G;
    const out = ctx.out;
    const now = ctx.date.getTime() / 1000;
    const M = Math.floor(now / 60) * 60, age = now - M;           // seconds since minute turn
    const Mprev = M - 60;
    const cur = timeDigits(ctx.date), prev = timeDigits(new Date(Mprev * 1000));
    const hourTurn = cur[2] === '0' && cur[3] === '0' && age < 8; // top of hour: bigger show, extend window
    const isHour = hourTurn && prev.join('') !== cur.join('');
    const night = ctx.night, dimAll = 1 - 0.35 * night;

    const P = digitPlan(W, H);
    // Real rink shape: a rounded rectangle, not an oval. Half-extents leave a
    // real board margin all round; CORNER is the rounding radius.
    const cx = W / 2, cy = H / 2;
    const HX = W * 0.46, HY = H * 0.40, CORNER = 10;
    // signed distance to the rounded rect (negative = inside the ice, in px)
    const rinkSD = (gx, gy) => {
      const qx = Math.abs(gx - cx) - (HX - CORNER), qy = Math.abs(gy - cy) - (HY - CORNER);
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      return Math.hypot(ox, oy) - CORNER + Math.min(Math.max(qx, qy), 0);
    };
    const RAIL_W = 1.4; // px either side of the boundary where the bright rail cap sits

    // ---------------- base ice + boards + rink markings ----------------
    for (let gy = 0; gy < H; gy++) {
      for (let gx = 0; gx < W; gx++) {
        const i = idx[gy * W + gx];
        if (i < 0) continue;
        const d = rinkSD(gx, gy); // <0 ice, >0 boards
        let c;
        if (d > 0) {
          // boards: amber-lit wall with ad stripes every ~10px
          const stripe = Math.floor((gx + gy * 0.3) / 10) % 2 === 0;
          c = stripe ? BOARD : kit.mix(BOARD, AD, 0.6);
          if (d < RAIL_W) c = kit.mix(c, RAIL_LIGHT, kit.smoothstep(RAIL_W, 0, d));
        } else {
          // ice: gradient brighter near the boards (floodlit rail), darker
          // toward the centre (mirror black), by distance-to-edge not radius
          const t = kit.clamp(1 + d / (Math.min(HX, HY) * 0.9));
          c = kit.mix(ICE_DEEP, ICE_LIFT, 0.2 + 0.8 * t);
          if (d > -RAIL_W) c = kit.mix(c, RAIL_LIGHT, 0.55 * kit.smoothstep(-RAIL_W, 0, d));
          // centre circle (red) at mid rink
          const dCentre = Math.hypot(gx - cx, gy - cy);
          const ring = Math.abs(dCentre - Math.min(HX, HY) * 0.42);
          if (ring < 1.0) c = kit.mix(c, LINE_RED, 0.65);
          else if (ring < 1.8) c = kit.mix(c, LINE_RED, 0.3);
          // two blue lines, vertical, at 30% and 70% width
          const bx1 = W * 0.32, bx2 = W * 0.68;
          const db = Math.min(Math.abs(gx - bx1), Math.abs(gx - bx2));
          if (db < 1.0) c = kit.mix(c, LINE_BLUE, 0.7);
          else if (db < 2.0) c = kit.mix(c, LINE_BLUE, 0.3);
        }
        out[3 * i] = c[0]; out[3 * i + 1] = c[1]; out[3 * i + 2] = c[2];
      }
    }

    // ---------------- floodlight reflections, sliding slowly ----------------
    const lights = [[0.22, 0.28], [0.78, 0.22], [0.5, 0.85]];
    for (const [lx, ly] of lights) {
      const px = Math.round((lx + 0.04 * Math.sin(now * 0.13 + lx * 7)) * W);
      const py = Math.round((ly + 0.03 * Math.cos(now * 0.11 + ly * 5)) * H);
      const rad = 20;
      for (let dy = -rad; dy <= rad; dy++) {
        const gy = py + dy; if (gy < 0 || gy >= H) continue;
        for (let dx = -rad; dx <= rad; dx++) {
          const gx = px + dx; if (gx < 0 || gx >= W) continue;
          const i = idx[gy * W + gx]; if (i < 0) continue;
          if (rinkSD(gx, gy) > 0) continue; // only on ice
          const d2 = dx * dx + dy * dy;
          const f = Math.exp(-d2 / (2 * 7 * 7)) * 0.3;
          if (f < 0.001) continue;
          out[3 * i] += FLOOD[0] * f; out[3 * i + 1] += FLOOD[1] * f; out[3 * i + 2] += FLOOD[2] * f;
        }
      }
    }

    // ---------------- snow: soft settled sprinkle + falling flakes ----------------
    const nFlakes = 26;
    for (let n = 0; n < nFlakes; n++) {
      const seed = n * 13.7;
      const speed = 6 + 4 * kit.hash(n, 1);
      const fy = ((now * speed + seed * 11) % (H + 10)) - 5;
      const fx = (kit.hash(n, 2) * W + 3 * Math.sin(now * 0.6 + seed)) % W;
      const gx = Math.round(fx), gy = Math.round(fy);
      if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
      if (rinkSD(gx, gy) > 0) continue;
      const i = idx[gy * W + gx]; if (i < 0) continue;
      const f = 0.14;
      out[3 * i] += f; out[3 * i + 1] += f; out[3 * i + 2] += f;
    }

    // ---------------- the resident skater, always circling ----------------
    // orbit path: an inner ellipse safely inside the rounded-rect ice, clear
    // of the boards and clear of the digits in the middle
    const ORX = HX * 0.78, ORY = HY * 0.72;
    const DIGIT_MARGIN = 7; // clear room for the ~16px skater figure + head reach
    const digitBox = {
      x0: P.xs[0] - DIGIT_MARGIN, x1: P.xs[3] + P.dw + DIGIT_MARGIN,
      y0: P.y0 - DIGIT_MARGIN, y1: P.y0 + P.dh + DIGIT_MARGIN,
    };
    drawSkater(ctx, G, out, idx, cx, cy, ORX, ORY, now, digitBox);

    // ---------------- digits: resting, minute-turn or hour show ----------------
    if (isHour) {
      drawHourShow(ctx, G, out, idx, W, H, cx, cy, HX * 0.9, HY * 0.85, age, prev, cur, P);
    } else if (age < 2.6 && prev.join('') !== cur.join('') ) {
      drawMinuteTurn(ctx, G, out, idx, W, cx, age, prev, cur, P, now);
    } else {
      drawRestingDigits(ctx, G, out, idx, cur, P, now, 1);
    }

    // night dim (applied last, multiplicatively, cheap)
    if (night > 0) {
      for (let p = 0; p < idx.length; p++) {
        const i = idx[p]; if (i < 0) continue;
        out[3 * i] *= dimAll; out[3 * i + 1] *= dimAll; out[3 * i + 2] *= dimAll;
      }
    }
  },
};

/** Draw the groove for one already-settled digit pair (both chars). t = carve
 * progress 0..1 per char (1 = fully carved); used both at rest (1,1) and
 * mid-carve during the performance pass. */
function drawDigitPair(out, idx, W, H, cx0, cx1, y0, dw, dh, ch0, ch1, t0, t1, shimmerPhase) {
  for (const [ch, x, t] of [[ch0, cx0, t0], [ch1, cx1, t1]]) {
    if (t <= 0) continue;
    const segs = iceSegs(ch, x, y0, dw, dh);
    const total = segs.length || 1;
    const upto = Math.max(1, Math.round(total * kit.clamp(t)));
    for (let si = 0; si < upto; si++) {
      const [ax, ay, bx, by] = segs[si];
      drawGrooveSeg(out, idx, W, H, ax, ay, bx, by, shimmerPhase);
    }
  }
}

function drawGrooveSeg(out, idx, W, H, ax, ay, bx, by, shimmerPhase) {
  // A carved groove: a dark channel cut into the ice with ONE bright rail
  // lit by the floodlights and a dim far wall — not a filled stroke. We
  // scan the pixels in the segment's own bounding box and shade each by its
  // exact signed distance from the centreline (coverage-based AA, no
  // sub-pixel-offset sampling, so the two rails never alias into ghosts).
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;      // along-stroke unit
  const nx = -uy, ny = ux;                 // across-stroke unit
  const HALF = 1.1;                        // half-width of the groove, in px
  const x0 = Math.floor(Math.min(ax, bx) - HALF - 1), x1 = Math.ceil(Math.max(ax, bx) + HALF + 1);
  const y0 = Math.floor(Math.min(ay, by) - HALF - 1), y1 = Math.ceil(Math.max(ay, by) + HALF + 1);
  for (let gy = Math.max(0, y0); gy <= Math.min(H - 1, y1); gy++) {
    for (let gx = Math.max(0, x0); gx <= Math.min(W - 1, x1); gx++) {
      const i = idx[gy * W + gx]; if (i < 0) continue;
      const px = gx + 0.5, py = gy + 0.5;
      // project onto the segment, clamped, to get along/across coords
      const rx = px - ax, ry = py - ay;
      const tRaw = (rx * ux + ry * uy) / len;
      const t = kit.clamp(tRaw);
      const cxp = ax + ux * len * t, cyp = ay + uy * len * t; // closest point on centreline
      const ddx = px - cxp, ddy = py - cyp;
      const across = ddx * nx + ddy * ny; // signed distance across the groove
      // round cap: fade by how far past the segment's own end the true
      // projection falls, so endpoints taper instead of haloing in all
      // directions (which was scattering stray dots at every joint)
      const overshoot = Math.max(0, (tRaw < 0 ? -tRaw : tRaw > 1 ? tRaw - 1 : 0) * len);
      const capFade = kit.smoothstep(HALF + 0.6, HALF - 0.3, overshoot);
      if (capFade <= 0.01) continue;
      const u = kit.clamp(across / HALF, -1.4, 1.4);
      let col, amt;
      if (u < -0.3) { col = GROOVE_HOT; amt = kit.smoothstep(-1.3, -0.3, u); }        // lit rail: bright edge
      else if (u > 0.3) { col = GROOVE; amt = 0.4 * kit.smoothstep(1.3, 0.3, u); }    // shadow rail: dim edge
      else { col = ICE_DEEP; amt = kit.smoothstep(1.0, 0.3, Math.abs(u)); }           // channel floor: darker than ice
      amt *= capFade;
      if (amt <= 0.01) continue;
      const shimmer = 0.9 + 0.1 * Math.sin(shimmerPhase + cxp * 0.5 + cyp * 0.5);
      const f = kit.clamp(amt * shimmer);
      // blend toward the groove colour (not purely additive) so the dark
      // floor reads darker than the surrounding ice
      out[3 * i] = out[3 * i] + (col[0] - out[3 * i]) * f;
      out[3 * i + 1] = out[3 * i + 1] + (col[1] - out[3 * i + 1]) * f;
      out[3 * i + 2] = out[3 * i + 2] + (col[2] - out[3 * i + 2]) * f;
    }
  }
}

function drawRestingDigits(ctx, G, out, idx, cur, P, now, amt) {
  const shimmer = now * 1.3;
  drawDigitPair(out, idx, G.w, G.h, P.xs[0], P.xs[1], P.y0, P.dw, P.dh, cur[0], cur[1], amt, amt, shimmer);
  drawDigitPair(out, idx, G.w, G.h, P.xs[2], P.xs[3], P.y0, P.dw, P.dh, cur[2], cur[3], amt, amt, shimmer + 1.7);
  // colon: two carved dots between hh and mm
  const colonX = (P.xs[1] + P.dw + P.xs[2]) / 2;
  for (const dy of [0.32, 0.68]) {
    const py = P.y0 + P.dh * dy, px = colonX;
    const gx0 = Math.round(px), gy0 = Math.round(py);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const gx = gx0 + ox, gy = gy0 + oy;
      if (gx < 0 || gx >= G.w || gy < 0 || gy >= G.h) continue;
      const i = idx[gy * G.w + gx]; if (i < 0) continue;
      const d = Math.hypot(gx - px, gy - py);
      const f = kit.smoothstep(1.4, 0.2, d);
      out[3 * i] += GROOVE[0] * f * 0.8; out[3 * i + 1] += GROOVE[1] * f * 0.8; out[3 * i + 2] += GROOVE[2] * f * 0.8;
    }
  }
}

/** Minute turn: 0-0.9s Zamboni erases the changed pair, 0.9-2.6s a skater
 * carves the new pair stroke-by-stroke with spray at the end. The
 * unchanged pair (hour, usually) stays fully carved throughout. */
function drawMinuteTurn(ctx, G, out, idx, W, cx, age, prev, cur, P, now) {
  const shimmer = now * 1.3;
  const hoursChanged = prev[0] !== cur[0] || prev[1] !== cur[1];
  // hours pair: draw resting (carved) unless it is itself the one changing
  if (!hoursChanged) {
    drawDigitPair(out, idx, G.w, G.h, P.xs[0], P.xs[1], P.y0, P.dw, P.dh, cur[0], cur[1], 1, 1, shimmer);
  }
  // minutes pair handled below as "the changing pair" when hours unchanged;
  // if hours changed, minutes already settled to :00 and shown resting too.
  const pairXs = hoursChanged ? [P.xs[0], P.xs[1]] : [P.xs[2], P.xs[3]];
  const pairPrev = hoursChanged ? [prev[0], prev[1]] : [prev[2], prev[3]];
  const pairCur = hoursChanged ? [cur[0], cur[1]] : [cur[2], cur[3]];
  if (hoursChanged) {
    // minutes pair (now 00) draws resting immediately since it's not the changer
    drawDigitPair(out, idx, G.w, G.h, P.xs[2], P.xs[3], P.y0, P.dw, P.dh, cur[2], cur[3], 1, 1, shimmer);
  } else {
    drawDigitPair(out, idx, G.w, G.h, P.xs[0], P.xs[1], P.y0, P.dw, P.dh, cur[0], cur[1], hoursChanged ? 0 : 1, hoursChanged ? 0 : 1, shimmer);
  }

  const ERASE = 0.9, CARVE_START = 0.95, CARVE_END = 2.6;
  if (age < ERASE) {
    // old pair still fully visible under the sweep, then wiped by the blade
    const k = kit.clamp(age / ERASE);
    const bx = zamboniX(pairXs[1] + P.dw - pairXs[0], k) + pairXs[0] - 14;
    drawDigitPair(out, idx, G.w, G.h, pairXs[0], pairXs[1], P.y0, P.dw, P.dh, pairPrev[0], pairPrev[1], 1, 1, shimmer);
    eraseBand(out, idx, G.w, G.h, bx, P.y0 - 6, P.dh + 12);
    steamBand(out, idx, G.w, G.h, bx, P.y0 - 6, P.dh + 12, age);
  } else if (age < CARVE_END) {
    // mirror sheen (nothing carved) then skater carves stroke by stroke
    const k = kit.clamp((age - CARVE_START) / (CARVE_END - CARVE_START));
    drawDigitPair(out, idx, G.w, G.h, pairXs[0], pairXs[1], P.y0, P.dw, P.dh, pairCur[0], pairCur[1], k, k, shimmer);
    drawCarveSkater(ctx, out, idx, G.w, G.h, pairXs, P, k, pairCur, now);
  } else {
    drawDigitPair(out, idx, G.w, G.h, pairXs[0], pairXs[1], P.y0, P.dw, P.dh, pairCur[0], pairCur[1], 1, 1, shimmer);
  }
  // colon always on (never part of the change)
  const colonX = (P.xs[1] + P.dw + P.xs[2]) / 2;
  for (const dy of [0.32, 0.68]) {
    const py = P.y0 + P.dh * dy, px = colonX;
    const gx0 = Math.round(px), gy0 = Math.round(py);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const gx = gx0 + ox, gy = gy0 + oy;
      if (gx < 0 || gx >= G.w || gy < 0 || gy >= G.h) continue;
      const i = idx[gy * G.w + gx]; if (i < 0) continue;
      const d = Math.hypot(gx - px, gy - py);
      const f = kit.smoothstep(1.4, 0.2, d);
      out[3 * i] += GROOVE[0] * f * 0.8; out[3 * i + 1] += GROOVE[1] * f * 0.8; out[3 * i + 2] += GROOVE[2] * f * 0.8;
    }
  }
}

function eraseBand(out, idx, W, H, bx, y0, h, half = 10) {
  for (let gy = Math.max(0, Math.floor(y0)); gy < Math.min(H, y0 + h); gy++) {
    for (let gx = Math.max(0, Math.floor(bx - half)); gx < Math.min(W, bx + half); gx++) {
      const i = idx[gy * W + gx]; if (i < 0) continue;
      const d = Math.abs(gx - bx);
      const f = kit.smoothstep(half, 0, d);
      if (f <= 0) continue;
      // wipe toward mirror sheen (slightly brighter flat black-blue, no groove)
      const sheen = [0.08, 0.1, 0.13];
      out[3 * i] = out[3 * i] + (sheen[0] - out[3 * i]) * f;
      out[3 * i + 1] = out[3 * i + 1] + (sheen[1] - out[3 * i + 1]) * f;
      out[3 * i + 2] = out[3 * i + 2] + (sheen[2] - out[3 * i + 2]) * f;
    }
  }
}

function steamBand(out, idx, W, H, bx, y0, h, age) {
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const sx = bx - 6 + r * 5 + 2 * Math.sin(age * 6 + r);
    const sy = y0 - 2 - (age * 5) % 8;
    const gx = Math.round(sx), gy = Math.round(sy);
    if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
    const i = idx[gy * W + gx]; if (i < 0) continue;
    const f = 0.12 * (1 - ((age * 5) % 8) / 8);
    out[3 * i] += STEAM[0] * f; out[3 * i + 1] += STEAM[1] * f; out[3 * i + 2] += STEAM[2] * f;
  }
}

/** The skater carving the new pair: a bold dot+scarf travelling along the
 * groove tip, with a spray burst at corners. */
function drawCarveSkater(ctx, out, idx, W, H, pairXs, P, k, pairCur, now) {
  // locate the tip: whichever char is currently drawing, find its last seg endpoint
  for (let slot = 0; slot < 2; slot++) {
    const ch = pairCur[slot];
    const segs = iceSegs(ch, pairXs[slot], P.y0, P.dw, P.dh);
    if (!segs.length) continue;
    const per = 1 / 2;
    const localK = kit.clamp((k - slot * per) / per);
    if (localK <= 0 || localK >= 1) continue; // only draw head on the actively-carving half
    const upto = localK * segs.length;
    const si = Math.min(segs.length - 1, Math.floor(upto));
    const frac = upto - si;
    const [ax, ay, bx, by] = segs[si];
    const px = ax + (bx - ax) * frac, py = ay + (by - ay) * frac;
    paintSkaterDot(out, idx, W, H, px, py, Math.atan2(by - ay, bx - ax), now);
    // spray at sharp turns: approximate by sampling direction change
    if (si > 0) {
      const [pax, pay, pbx, pby] = segs[si - 1];
      const prevDir = Math.atan2(pby - pay, pbx - pax), curDir = Math.atan2(by - ay, bx - ax);
      let dAng = Math.abs(curDir - prevDir); if (dAng > Math.PI) dAng = 2 * Math.PI - dAng;
      if (dAng > 0.6) sprayAt(out, idx, W, H, ax, ay, now);
    }
  }
}

function paintSkaterDot(out, idx, W, H, px, py, heading, now) {
  const gx0 = Math.round(px), gy0 = Math.round(py);
  for (let oy = -2; oy <= 2; oy++) {
    const gy = gy0 + oy; if (gy < 0 || gy >= H) continue;
    for (let ox = -2; ox <= 2; ox++) {
      const gx = gx0 + ox; if (gx < 0 || gx >= W) continue;
      const i = idx[gy * W + gx]; if (i < 0) continue;
      const d = Math.hypot(ox, oy);
      const f = kit.smoothstep(2.1, 0, d);
      if (f <= 0) continue;
      out[3 * i] += SPRAY[0] * f * 0.5; out[3 * i + 1] += SPRAY[1] * f * 0.5; out[3 * i + 2] += SPRAY[2] * f * 0.5;
    }
  }
}

function sprayAt(out, idx, W, H, px, py, now) {
  for (let n = 0; n < 6; n++) {
    const a = kit.hash(Math.floor(now * 10), n) * Math.PI * 2;
    const r = 1.5 + 2 * kit.hash(n, Math.floor(now * 10));
    const gx = Math.round(px + Math.cos(a) * r), gy = Math.round(py + Math.sin(a) * r);
    if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
    const i = idx[gy * W + gx]; if (i < 0) continue;
    out[3 * i] += SPRAY[0] * 0.3; out[3 * i + 1] += SPRAY[1] * 0.3; out[3 * i + 2] += SPRAY[2] * 0.3;
  }
}

/** The resident skater: a bold figure gliding an elliptical path round the
 * rink forever, scarf trailing, leaving a thin scratch that fades over ~4s. */
// Keep the orbit point clear of the time text: if it would land inside the
// digit box (plus the skater's own figure radius as margin), push it
// radially outward from rink centre until it clears. This bends the near
// side of the lap out and around the time instead of skating through it.
function clearDigitBox(px, py, cx, cy, box) {
  const { x0, x1, y0, y1 } = box;
  if (px <= x0 || px >= x1 || py <= y0 || py >= y1) return [px, py];
  const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  // march outward along the radial direction until outside the box
  let t = d;
  for (let step = 0; step < 60; step++) {
    t += 1;
    const nx = cx + ux * t, ny = cy + uy * t;
    if (nx <= x0 || nx >= x1 || ny <= y0 || ny >= y1) return [nx, ny];
  }
  return [px, py];
}

function drawSkater(ctx, G, out, idx, cx, cy, rx, ry, now, digitBox) {
  const period = 14; // seconds per lap
  const speed = (2 * Math.PI) / period;
  const pos = (theta, wob) => {
    let px = cx + (rx * (1 + wob)) * Math.cos(theta);
    let py = cy + (ry * (1 + wob)) * Math.sin(theta);
    if (digitBox) [px, py] = clearDigitBox(px, py, cx, cy, digitBox);
    return [px, py];
  };
  // trail: sample recent positions analytically (no simulation state needed)
  const TAIL = 4.0, STEPS = 40;
  for (let s = STEPS; s >= 0; s--) {
    const dt = (s / STEPS) * TAIL;
    const age = dt;
    const theta = -now * speed + age * speed + Math.PI * 0.5;
    // slight gait wobble (crossover glide): radius breathes, speed pulses
    const wob = 0.06 * Math.sin(theta * 6);
    const [px, py] = pos(theta, wob);
    const gx = Math.round(px), gy = Math.round(py);
    if (gx < 1 || gx >= G.w - 1 || gy < 1 || gy >= G.h - 1) continue;
    const i = idx[gy * G.w + gx]; if (i < 0) continue;
    const f = 1 - age / TAIL;
    if (f <= 0) continue;
    out[3 * i] += GROOVE[0] * f * 0.6; out[3 * i + 1] += GROOVE[1] * f * 0.6; out[3 * i + 2] += GROOVE[2] * f * 0.6;
  }
  // the skater himself, at age 0
  const theta = -now * speed + Math.PI * 0.5;
  const wob = 0.06 * Math.sin(theta * 6);
  const [px, py] = pos(theta, wob);
  const heading = theta + Math.PI / 2;
  const stride = Math.sin(now * speed * 6);
  paintSkaterFigure(out, idx, G.w, G.h, px, py, heading, stride, 1);
}

/** A small top-down skater figure, ~16px head-to-toe along the heading:
 * head, shoulder bar, two swinging arms, trailing scarf. `heading` is the
 * direction of travel (radians); `stride` -1..1 drives the arm swing;
 * `scale` lets the hour-show pair skaters be drawn slightly smaller. */
function paintSkaterFigure(out, idx, W, H, px, py, heading, stride, scale) {
  const fx = Math.cos(heading), fy = Math.sin(heading); // forward unit
  const sx = -fy, sy = fx;                               // sideways (shoulder) unit
  const s = scale;
  // head: out front, small and bright
  paintDot(out, idx, W, H, px + fx * 3.2 * s, py + fy * 3.2 * s, SKATER_BODY, 1.0, 1.1 * s);
  // shoulders / torso: a short bar across the direction of travel
  for (const u of [-1.6, -0.8, 0, 0.8, 1.6]) {
    paintDot(out, idx, W, H, px + sx * u * s, py + sy * u * s, SKATER_BODY, 0.95, 1.0 * s);
  }
  // two arms, swinging opposite the stride, reaching out past the shoulders
  const swing = stride * 2.4 * s;
  paintDot(out, idx, W, H, px + sx * 2.4 * s + fx * swing, py + sy * 2.4 * s + fy * swing, SKATER_BODY, 0.85, 0.75 * s);
  paintDot(out, idx, W, H, px - sx * 2.4 * s - fx * swing, py - sy * 2.4 * s - fy * swing, SKATER_BODY, 0.85, 0.75 * s);
  // scarf: trailing behind the head, the warm accent that catches the eye
  paintDot(out, idx, W, H, px - fx * 1.6 * s, py - fy * 1.6 * s, SCARF, 1.0, 0.95 * s);
  paintDot(out, idx, W, H, px - fx * 2.9 * s + sx * 0.6 * s, py - fy * 2.9 * s + sy * 0.6 * s, SCARF, 0.7, 0.65 * s);
}

function paintDot(out, idx, W, H, px, py, col, a, rad) {
  const gx0 = Math.round(px), gy0 = Math.round(py);
  const r = rad + 1;
  for (let oy = -r; oy <= r; oy++) {
    const gy = gy0 + oy; if (gy < 0 || gy >= H) continue;
    for (let ox = -r; ox <= r; ox++) {
      const gx = gx0 + ox; if (gx < 0 || gx >= W) continue;
      const i = idx[gy * W + gx]; if (i < 0) continue;
      const d = Math.hypot(ox, oy);
      const f = kit.smoothstep(rad + 0.8, rad - 0.4, d) * a;
      if (f <= 0) continue;
      out[3 * i] += col[0] * f; out[3 * i + 1] += col[1] * f; out[3 * i + 2] += col[2] * f;
    }
  }
}

/** Hour show: spotlights swing, a pair glides a slow lap, full resurface,
 * then the whole time re-carves in sequence while the previous time stays
 * legible until each pair's own carve starts. */
function drawHourShow(ctx, G, out, idx, W, H, cx, cy, rx, ry, age, prev, cur, P) {
  const shimmer = ctx.date.getTime() / 1000 * 1.3;
  // spotlights: two beams sweeping, brighter and more saturated than ambient floods
  for (const [phase, hue] of [[0, SPOT], [Math.PI, [0.55, 0.75, 0.7]]]) {
    const a = age * 0.9 + phase;
    const px = cx + rx * 0.8 * Math.cos(a), py = cy + ry * 0.8 * Math.sin(a);
    const rad = 16;
    const gx0 = Math.round(px), gy0 = Math.round(py);
    for (let dy = -rad; dy <= rad; dy++) {
      const gy = gy0 + dy; if (gy < 0 || gy >= H) continue;
      for (let dx = -rad; dx <= rad; dx++) {
        const gx = gx0 + dx; if (gx < 0 || gx >= W) continue;
        const i = idx[gy * W + gx]; if (i < 0) continue;
        const d2 = dx * dx + dy * dy;
        const f = Math.exp(-d2 / (2 * 8 * 8)) * 0.28;
        if (f < 0.002) continue;
        out[3 * i] += hue[0] * f; out[3 * i + 1] += hue[1] * f; out[3 * i + 2] += hue[2] * f;
      }
    }
  }
  // pair skaters: two small figures gliding together, slower lap, opposite side from resurface
  const pairTheta = age * 0.5 + Math.PI;
  const pairHeading = pairTheta + Math.PI / 2;
  const pStride = Math.sin(age * 3);
  const p1x = cx + rx * 0.5 * Math.cos(pairTheta), p1y = cy + ry * 0.5 * Math.sin(pairTheta);
  const p2x = cx + rx * 0.5 * Math.cos(pairTheta + 0.25), p2y = cy + ry * 0.5 * Math.sin(pairTheta + 0.25);
  paintSkaterFigure(out, idx, W, H, p1x, p1y, pairHeading, pStride, 0.85);
  paintSkaterFigure(out, idx, W, H, p2x, p2y, pairHeading, -pStride, 0.85);

  // Each pair gets its own fixed, non-overlapping time window: wiped by the
  // Zamboni band, then carved by the skater. Hours goes first, minutes
  // second, with a hold gap between them so one pair is always at least
  // mostly readable (never both erasing at once). The visual band position
  // is computed from these same windows so the picture matches the state.
  const WIN = [
    { x0: P.xs[0], x1: P.xs[1], chp: [prev[0], prev[1]], chc: [cur[0], cur[1]], wipeFrom: 0.4, wipeTo: 1.1, carveTo: 2.6 },
    { x0: P.xs[2], x1: P.xs[3], chp: [prev[2], prev[3]], chc: [cur[2], cur[3]], wipeFrom: 2.9, wipeTo: 3.6, carveTo: 5.1 },
  ];
  let bandX = -20;
  for (const win of WIN) {
    if (age < win.wipeFrom) {
      drawDigitPair(out, idx, W, H, win.x0, win.x1, P.y0, P.dw, P.dh, win.chp[0], win.chp[1], 1, 1, shimmer);
    } else if (age < win.wipeTo) {
      const k = kit.clamp((age - win.wipeFrom) / (win.wipeTo - win.wipeFrom));
      bandX = win.x0 - 4 + (win.x1 + P.dw - win.x0 + 8) * k;
      drawDigitPair(out, idx, W, H, win.x0, win.x1, P.y0, P.dw, P.dh, win.chp[0], win.chp[1], 1, 1, shimmer);
      steamBand(out, idx, W, H, bandX, P.y0 - 6, P.dh + 12, age);
      eraseBand(out, idx, W, H, bandX, P.y0 - 6, P.dh + 12, 5);
    } else {
      const k = kit.clamp((age - win.wipeTo) / (win.carveTo - win.wipeTo));
      drawDigitPair(out, idx, W, H, win.x0, win.x1, P.y0, P.dw, P.dh, win.chc[0], win.chc[1], k, k, shimmer);
      if (k > 0 && k < 1) drawCarveSkater(ctx, out, idx, W, H, [win.x0, win.x1], P, k, win.chc, age);
    }
  }
  const colonX = (P.xs[1] + P.dw + P.xs[2]) / 2;
  for (const dy of [0.32, 0.68]) {
    const py = P.y0 + P.dh * dy, px = colonX;
    const gx0 = Math.round(px), gy0 = Math.round(py);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const gx = gx0 + ox, gy = gy0 + oy;
      if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
      const i = idx[gy * W + gx]; if (i < 0) continue;
      const d = Math.hypot(gx - px, gy - py);
      const f = kit.smoothstep(1.4, 0.2, d);
      out[3 * i] += GROOVE[0] * f * 0.8; out[3 * i + 1] += GROOVE[1] * f * 0.8; out[3 * i + 2] += GROOVE[2] * f * 0.8;
    }
  }
}
