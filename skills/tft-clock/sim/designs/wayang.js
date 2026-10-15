// Wayang: a wayang kulit shadow play, and the four numerals are its puppets.
// Each digit is a carved leather puppet whose body IS the numeral
// (wayang-glyphs.js): swelling brush strokes with curled ukel terminals, a
// row of punched bubukan holes down every thick stroke, a profile head on
// its top (Semar's round head, a ksatria's long nose and bun, a king's
// tiered crown, an ogre's curls), one jointed arm on a buffalo-horn rod and
// the main gapit rod under the foot. Hours face right, minutes face left:
// two pairs in dialogue across the middle of the screen, under the lamp.
//
// The time is never still. The gamelan beat is once a second, hours on the
// beat and minutes on the off-beat: on each beat the dalang presses every
// puppet to the cloth (its shadow snaps sharp, the holes open, and the
// painted side glows through, gold rims and a red or indigo core) and lets
// it drift back (the shadow softens and grows); the arm flicks up and
// quivers. A two-second "line" passes from puppet to puppet: the speaker
// leans and nods toward its partner, arm raised high, while the others
// sway. The lamp is alive too: the blencong's light flickers, its pool sways
// across the cloth (the rods' shadows slide with it), and soot smoke rises
// through it as a faint wavering shade. Every 15 s a gong flourish: the
// geter (all four tremble on the cloth, arms up), a hop rolling left to
// right along the line, or the flame gutters, the puppets fall back soft,
// then all slap onto the cloth at once.
//
// Minute turn: the leaving puppet waves farewell, then is drawn back toward
// the lamp: its shadow swells, blurs (the holes fill in by themselves) and
// fades by :59.6; from :00 the new one comes out of the glare, a big faint
// shade shrinking and sharpening onto the cloth by :00.8. The old shape
// never turns into a part of itself, it only softens; the new one is whole
// from its first frame. Hour: the gunungan (tree-of-life puppet) sweeps the
// screen right to left from :57, a translucent shade the puppets show
// through, and behind it the cloth takes the new hour's light; it returns
// on its red fire side, twirls to its face (never edge-on) and is planted in
// the middle in full paint, trembling, while the four make way to either
// side; then it is drawn back into the lamp. The digits stay on the screen
// throughout (only the changing ones swap, on the minute's schedule).
//
// Palette: what a kelir shows and nothing else: cotton lit by an oil lamp
// (pale by day, amber in the evening, a low orange at night, cool at dawn),
// the near-black of leather shadow, and the three paint colours of a puppet
// (gold prada, red, indigo) glimpsed as stained colour only where leather
// touches the cloth. Every pixel is a lookup of (lamp light, shadow density,
// paint) in a 16 KB table per tone (wayang-light.js); the light is ordered
// dithered. The shadows are the strongest contrast on the glass. Night dims
// the backlight and uses the orange tone with a wider lamp pool, so the
// outer digits never sit on near-black.
//
// Cost: digit bodies, heads and the gunungan are Int8 distance tables
// (flash) sampled bilinear into a density buffer through a per-puppet ramp
// (blur is just a different ramp), then one table lookup per pixel. Arms
// and rods are a few AA kit lines. No per-minute caches; every frame cold.
// RAM: two 12.8 KB byte buffers (density, paint) and a 256-byte ramp.
import { clockFields, hash, sin, cos, clamp } from '../js/kit.js';
import { BODIES, HEAD, TW, TH, M, Q, HM, PAINT_GOLD, PAINT_RED } from './wayang-glyphs.js';
import { GSDF, GPAINT, GTW, GTH } from './wayang-gunungan.js';
import { W, H, LUTS, GLOW, GW, BAYER, LAMP_X, toneOf, leatherRGB } from './wayang-light.js';

const N = W * H;
const DEN = new Uint8Array(N);     // shadow density 0..255
const PT = new Uint8Array(N);      // paint: colour << 2 | level
const RAMP = new Uint8Array(256);  // distance -> density, rebuilt per stamp

const SLOT_X = [5, 43, 93, 131], BODY_Y = 20;
const MAKE_WAY = [-4, -10, 10, 4];  // where the puppets shuffle while the gunungan stands in the middle
const FACE = [1, 1, -1, -1];
const LX = LAMP_X, LY = 24;        // where the flame's light comes from (shadows grow about it)
const D2R = Math.PI / 180;

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const frac = (x) => x - Math.floor(x);
const lerp = (a, b, u) => a + (b - a) * u;

/** The beat's shape: a quick press (0.1 s) and a slow release through the rest of the beat. */
function bump(p) {
  if (p < 0.1) { const u = p / 0.1; return 1 - (1 - u) * (1 - u); }
  return 1 - sm((p - 0.1) / 0.8);
}

let costBox = 0;

/** Fill RAMP for a shadow of blur `w` px at scale `S`, peak density `dm` (0..1). */
function ramp(S, w, dm) {
  const k = S / Q / w, top = dm * 255;
  for (let j = 0; j < 256; j++) {
    const v = 0.5 - (j - 128) * k;
    RAMP[j] = v <= 0 ? 0 : v >= 1 ? top : v * top;
  }
  costBox += 256 * 3;
}

/**
 * Stamp a distance table into the density and paint buffers through RAMP:
 * screen = centre + R(ang) * diag(S * sx, S) * (table - table centre).
 * `paintAll` >= 0 paints every leather pixel that colour (the gunungan's fire side).
 */
function stamp(sdf, paint, tw, th, cx, cy, S, sx, ang, k, paintAll = -1) {
  const ca = cos(ang), sa = sin(ang), ax = Math.abs(sx) * S;
  const rx = (Math.abs(ca) * tw * ax + Math.abs(sa) * th * S) / 2 + 1, ry = (Math.abs(sa) * tw * ax + Math.abs(ca) * th * S) / 2 + 1;
  const x0 = Math.max(0, (cx - rx) | 0), x1 = Math.min(W, Math.ceil(cx + rx));
  const y0 = Math.max(0, (cy - ry) | 0), y1 = Math.min(H, Math.ceil(cy + ry));
  if (x1 <= x0 || y1 <= y0 || ax < 0.02) return;
  // inverse map, incremental per pixel
  const iux = ca / (S * sx), iuy = sa / (S * sx), ivx = -sa / S, ivy = ca / S;
  const hc = tw / 2 - 0.5, vc = th / 2 - 0.5;
  for (let y = y0; y < y1; y++) {
    const dy = y + 0.5 - cy, dx0 = x0 + 0.5 - cx;
    let U = hc + dx0 * iux + dy * iuy, V = vc + dx0 * ivx + dy * ivy;
    for (let x = x0; x < x1; x++, U += iux, V += ivx) {
      if (U < 0 || V < 0) continue;
      const iu = U | 0, iv = V | 0;
      if (iu >= tw - 1 || iv >= th - 1) continue;
      const fu = U - iu, fv = V - iv, a = iv * tw + iu;
      const t0 = sdf[a] + (sdf[a + 1] - sdf[a]) * fu, t1 = sdf[a + tw] + (sdf[a + tw + 1] - sdf[a + tw]) * fu;
      const den = RAMP[(t0 + (t1 - t0) * fv + 128.5) | 0];
      const i = y * W + x;
      if (den > DEN[i]) {
        DEN[i] = den;
        const pc = paintAll >= 0 ? paintAll : paint[a + (fu > 0.5 ? 1 : 0) + (fv > 0.5 ? tw : 0)];
        PT[i] = den > 90 && pc ? (pc << 2) | k : 0;
      }
    }
  }
  costBox += (x1 - x0) * (y1 - y0) * 12;
}

// ------------------------------------------------------------ the cast

const GONGS = ['geter', 'wave', 'lamp'];
function gongAt(s, mk) {
  const q = Math.floor(s / 15);
  if (q < 1) return null;
  const t = s - q * 15;
  if (t > 3) return null;
  return { kind: GONGS[(q + hash(mk, 11)) % 3], t };
}

/** Where puppet i is and what it is doing at second s. */
function pose(i, d, s, mk, job, gong, mw) {
  const ph = i < 2 ? 0 : 0.5;
  const b = s - ph, p = frac(b);
  const line = Math.floor(s / 2);
  const speaker = [1, 2, 0, 2, 1, 3][(line + (hash(mk, 7) % 6)) % 6];
  const amp = speaker === i ? 1 : 0.55;
  const bp = bump(p) * amp;
  let z = 0.55 * (1 - bp);
  // the speaker leans in toward the one it addresses over its line; the others sway
  const lt = s - line * 2, lean = speaker === i ? sin(Math.PI * clamp(lt / 2, 0, 1)) : 0;
  let dx = 0.9 * sin(s * 1.31 + i * 1.3) + FACE[i] * 1.8 * lean + MAKE_WAY[i] * mw, dy = -1.6 * bp;
  // the arm: a lift on the beat, then a quiver
  const q = Math.exp(-6 * p) * sin(p * 44);
  const big = speaker === i ? 1 : 0.3;
  const reach = i === 0 || i === 3 ? 1 - 0.6 * mw : 1;      // the outer puppets keep their arms in while squeezed
  let a1 = 12 + 22 * big * bump(p) * reach, a2 = 18 + 70 * big * bump(p) * reach + 14 * big * q;
  let dm = 1;
  if (gong) {
    const t = gong.t;
    if (gong.kind === 'geter') {
      // the dalang shakes every puppet: arms up, trembling, pressed to the cloth
      const e = sm(t / 0.15) * (1 - sm((t - 1.7) / 0.6));
      dx += e * 0.8 * sin(t * 56 + i * 2);
      z *= 1 - e;
      a1 = lerp(a1, 34 * reach, e); a2 = lerp(a2, 105 * reach, e) + e * 9 * sin(t * 69 + i * 2);
    } else if (gong.kind === 'wave') {
      // a hop rolls left to right across the four
      const lt = t - i * 0.22;
      if (lt > 0 && lt < 0.9) {
        const u = clamp(lt / 0.6, 0, 1);
        dy -= 5 * sin(Math.PI * u);
        const e = sin(Math.PI * clamp(lt / 0.9, 0, 1));
        a1 = lerp(a1, 30 * reach, e); a2 = lerp(a2, 110 * reach, e);
        if (lt > 0.55) z *= 1 - sin(Math.PI * clamp((lt - 0.55) / 0.35, 0, 1));
      }
    } else {
      // the flame gutters: the puppets drift back from the cloth, then all slap onto it at once
      const back = sm(t / 0.9) * (1 - sm((t - 1.5) / 0.12));
      z += 0.7 * back;
      const slap = t > 1.5 ? Math.exp(-(t - 1.5) * 4) : 0;
      z *= 1 - slap;
      a2 += slap * 50 * reach * (1 + 0.3 * sin((t - 1.5) * 50));
    }
  }
  if (job && job.exit !== undefined) {
    // a farewell flick of the arm, then the puppet is drawn back to the lamp: it swells, blurs and fades
    const t = job.exit;
    const wave = sm(t / 0.4);
    a1 = Math.max(a1, 10 + 30 * wave * reach); a2 = Math.max(a2, 20 + 100 * wave * reach);
    const u = clamp((t - 0.75) / 0.8, 0, 1);
    z += 3.6 * Math.pow(u, 1.6);
    dy -= 5 * sm(u);
    dm = 1 - u * u;
  } else if (job && job.enter !== undefined) {
    // the new puppet comes out of the lamp's glare: a big faint shade that shrinks and sharpens onto the cloth
    const t = job.enter;
    const u = clamp((t - 0.02) / 0.78, 0, 1);
    z = 3.6 * Math.pow(1 - u, 1.6) + z * sm((t - 0.6) / 0.6);
    dy -= 5 * (1 - sm(u));
    dm = 1 - (1 - u) * (1 - u);
  }
  const S = 1 + 0.035 * z + 0.05 * Math.max(0, z - 0.6);
  const w = 0.9 + 2.2 * z + 1.6 * Math.max(0, z - 0.6);
  const kk = Math.round(3 * clamp(1 - z / 0.4, 0, 1));
  // the puppet pivots on its rod: the speaker leans in over its line and nods on each beat
  const rot = FACE[i] * D2R * (3.2 * lean + 1.6 * bp) + D2R * 0.8 * sin(s * 0.9 + i * 2.1);
  return { d, i, bx: SLOT_X[i] + dx, by: BODY_Y + dy, S, w, dm: dm * (1 - 0.1 * clamp(z, 0, 1)), k: kk, a1, a2, face: FACE[i], rot, c: cos(rot), sn: sin(rot) };
}

/**
 * Shadow position of body point (x, y) of a puppet: turned about the foot of
 * the body (where the rod holds it), then projected from the lamp.
 */
const PIV_Y = 44;
function proj(P, x, y) {
  const fx = BODIES[P.d].footX, dx = x - fx, dy = y - PIV_Y;
  const wx = P.bx + fx + dx * P.c - dy * P.sn, wy = P.by + PIV_Y + dx * P.sn + dy * P.c;
  PX = LX + (wx - LX) * P.S; PY = LY + (wy - LY) * P.S;
}
let PX = 0, PY = 0;

function stampPuppet(P) {
  if (P.dm <= 0.01) return;
  const b = BODIES[P.d], hd = HEAD[P.d];
  ramp(P.S, P.w, P.dm);
  proj(P, TW / 2 - M, TH / 2 - M);
  stamp(b.sdf, b.paint, TW, TH, PX, PY, P.S, 1, P.rot, P.k);
  // the head sits on the neck at the top of the digit; mirrored when the puppet faces left
  const left = P.face > 0 ? b.neck - (hd.nx + HM) : b.neck - (hd.w - hd.nx - HM);
  const top = 2.5 - (hd.ny + HM);
  proj(P, left + hd.w / 2, top + hd.h / 2);
  stamp(hd.sdf, hd.paint, hd.w, hd.h, PX, PY, P.S, P.face, P.rot, P.k);
}

function limbs(g, P, tone, Fm, sway) {
  if (P.dm <= 0.02) return;
  const b = BODIES[P.d], f = P.face, S = P.S;
  const a = clamp(P.dm * (1.15 - 0.15 * P.w), 0, 1);
  const sx = f > 0 ? b.shoulderR - 1.6 : b.shoulderL + 1.6, sy = 14;
  proj(P, sx, sy);
  const gx = clamp(Math.round(PX), 0, W - 1), gy = clamp(Math.round(PY), 0, H - 1);
  const L = Math.min(31, (GLOW[gy * GW + gx + 8] * Fm) >> 11);
  const col = leatherRGB(tone, L, (PAINT_GOLD << 2) | P.k);
  const rodc = leatherRGB(tone, L, 0, 9);
  const A1 = P.a1 * D2R, A2 = (P.a1 + P.a2) * D2R;
  const ex = sx + f * 10 * sin(A1), ey = sy + 10 * cos(A1);
  const hx = ex + f * 9 * sin(A2), hy = ey + 9 * cos(A2);
  const fx = hx + f * 3 * sin(A2 + 0.5), fy = hy + 3 * cos(A2 + 0.5);
  const pts = [sx, sy, ex, ey, hx, hy, fx, fy, b.footX, b.footY - 1];
  for (let j = 0; j < 10; j += 2) { proj(P, pts[j], pts[j + 1]); pts[j] = PX; pts[j + 1] = PY; }
  // the rods are held far from the cloth: fainter, and they slide as the flame sways
  g.thickLine(pts[4], pts[5], pts[4] + f * 3 - sway * 1.5, 80, 1.0 * S, rodc, { aa: true, a: a * 0.75 });
  g.thickLine(pts[8], pts[9], pts[8] + f * 1.5 - sway * 1.5, 80, 1.8 * S, rodc, { aa: true, a: a * 0.9 });
  g.thickLine(pts[0], pts[1], pts[2], pts[3], 2.3 * S, col, { aa: true, a });
  g.thickLine(pts[2], pts[3], pts[4], pts[5], 1.9 * S, col, { aa: true, a });
  g.fillCircle(pts[2], pts[3], 1.3 * S, col, { aa: true, a });
  g.thickLine(pts[4], pts[5], pts[6], pts[7], 1.4 * S, col, { aa: true, a });
}

// ------------------------------------------------------------ the lamp's smoke

const SMOKE = new Uint8Array(512);   // a puff's density by squared radius
for (let j = 0; j < 512; j++) { const q = j / 511; SMOKE[j] = Math.round(255 * Math.pow(Math.max(0, 1 - q), 2)); }
/**
 * The blencong smokes: a soft plume of soot rising off the flame drifts
 * between lamp and cloth, its shade a faint wavering column climbing out of
 * the top of the screen. A few soft puffs on a closed-form path.
 */
function smoke(T, amt) {
  for (let k = 0; k < 7; k++) {
    const age = frac(T / 9 + k / 7), y = LY - 4 - age * 46;
    const x = LX + 5 * sin(T * 0.37 + k * 0.9) * age + 7 * sin(age * 5 + T * 0.21) * age;
    const r = 4 + age * 9, a = amt * 0.3 * sin(Math.PI * age) * (0.7 + 0.3 * sin(T * 1.7 + k));
    if (a <= 0.01) continue;
    const x0 = Math.max(0, (x - r) | 0), x1 = Math.min(W, Math.ceil(x + r)), y0 = Math.max(0, (y - r) | 0), y1 = Math.min(H, Math.ceil(y + r));
    const ir2 = 511 / (r * r), A = (a * 256) | 0;
    for (let yy = y0; yy < y1; yy++) {
      const dy = yy + 0.5 - y;
      for (let xx = x0; xx < x1; xx++) {
        const dx = xx + 0.5 - x, q = ((dx * dx + dy * dy) * ir2) | 0;
        if (q >= 511) continue;
        const i = yy * W + xx, v = DEN[i] + ((SMOKE[q] * A) >> 8);
        DEN[i] = v > 255 ? 255 : v;
      }
    }
    costBox += Math.max(0, x1 - x0) * Math.max(0, y1 - y0) * 8;
  }
}

// ------------------------------------------------------------ the gunungan at the hour

/** The kayon's flight at hs seconds from the hour (-3 .. 8): null when it is not on the screen. */
function kayon(hs) {
  if (hs < -3 || hs > 7.6) return null;
  const G = { x: 0, y: 44, S: 1.12, w: 2.2, dm: 0.55, ang: 0, sx: 1, k: 0, fire: false };
  if (hs < 0) {
    // the first sweep, right to left, held back by the lamp: a big soft shade the puppets show through
    const u = (hs + 3) / 3;
    G.x = lerp(212, -50, 0.8 * u + 0.2 * sm(u));
    G.ang = -9 * D2R + 6 * D2R * sin(hs * 13.8);
    G.y = 42 + 2.5 * sin(hs * 6.9);
    return G;
  }
  if (hs < 0.25) return null;
  if (hs < 3) {
    // back again on its fire side, twirling to its face, coming forward to plant itself in the middle
    const u = (hs - 0.25) / 2.75, e = 1 - (1 - u) * (1 - u), near = sm((u - 0.55) / 0.45);
    G.x = lerp(-50, 80, e);
    G.S = lerp(1.12, 1, near); G.w = lerp(2.2, 0.9, near); G.dm = lerp(0.55, 1, near);
    G.ang = 9 * D2R * (1 - e) + 5 * D2R * (1 - e) * sin(hs * 13.8);
    G.y = lerp(42 + 2.5 * sin(hs * 6.9), 42, e);
    // the twirl: never edge-on (a thin dark bar beside a digit would read as a 1)
    const tw = clamp((hs - 0.9) / 0.6, 0, 1);
    G.sx = Math.max(0.4, Math.abs(cos(Math.PI * tw)));
    G.fire = tw < 0.5;
    G.k = Math.round(3 * sm((u - 0.6) / 0.4));
    return G;
  }
  G.x = 80; G.y = 42;
  if (hs < 6) {
    // planted: pressed to the cloth in full paint, trembling like a tree in the wind
    const t = hs - 3;
    G.S = 1; G.w = 0.9; G.dm = 1; G.k = 3;
    G.ang = 4 * D2R * sin(t * 28) * (0.35 + 0.65 * Math.exp(-t * 1.5));
    return G;
  }
  // gone back into the lamp
  const u = (hs - 6) / 1.6;
  G.S = 1 + 0.6 * u; G.w = 0.9 + 12 * u; G.dm = Math.pow(1 - u, 1.5); G.y = 42 - 10 * sm(u); G.k = Math.round(3 * (1 - u));
  return G;
}

// ------------------------------------------------------------ the frame

export default {
  name: 'Wayang Kulit',
  blurb: 'Wayang kulit: the four numerals are carved leather shadow puppets in dialogue on a lamp-lit screen, pressed to the cloth on every gamelan beat; each minute a puppet withdraws into the lamp, and at the hour the gunungan crosses the screen.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    costBox = 0;
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const T = (ctx.date.getTime() % 86400000) / 1000;

    // the hour: seconds from the turn, and the scene's new tone wiping in behind the kayon
    const hs = nxt.h !== f.h && s >= 56 ? s - 60 : prv.h !== f.h && s < 10 ? s : 99;
    const G = hs < 99 ? kayon(hs) : null;
    const mw = hs < 99 ? sm((hs - 0.8) / 1.7) * (1 - sm((hs - 6.4) / 1.6)) : 0;
    let toneA = toneOf(f.h), toneB = toneA, wipe = -1;
    if (hs < 0) { toneB = toneOf(nxt.h); wipe = G ? Math.round(G.x) : hs < -2.9 ? W : 0; }

    const gong = hs < 99 ? null : gongAt(s, mk);
    DEN.fill(0); PT.fill(0); costBox += N;
    const cast = [];
    for (let i = 0; i < 4; i++) {
      let job = null;
      if (s >= 58.2 && cur[i] !== nw[i]) job = { exit: s - 58.2 };
      else if (s < 2 && old[i] !== cur[i]) job = { enter: s };
      const P = pose(i, +cur[i], s, mk, job, gong, mw);
      cast.push(P);
      stampPuppet(P);
    }
    smoke(T, 1);
    if (G) {
      ramp(G.S, G.w, G.dm);
      stamp(GSDF, GPAINT, GTW, GTH, G.x, G.y, G.S, G.sx, G.ang, G.k, G.fire ? PAINT_RED : -1);
    }

    // the lamp: a flicker, and a slow sway of the flame that slides the pool
    let fl = 0.9 + 0.06 * sin(T * 7.3) + 0.04 * sin(T * 17.9 + 1);
    let sw = 3 * sin(T * 0.7) + 2.5 * sin(T * 0.23 + 1);
    if (gong) {
      fl += 0.08 * Math.exp(-gong.t * 3);
      if (gong.kind === 'lamp') {
        const e = sm(gong.t / 0.3) * (1 - sm((gong.t - 1.3) / 0.3));
        fl += e * (0.12 * sin(T * 31) - 0.1); sw += e * 7 * sin(T * 4.4);
      }
    }
    if (G && hs >= 3 && hs < 6.5) fl += 0.1 * sm((hs - 3) / 0.3) * (1 - sm((hs - 6) / 0.5));
    const Fm = Math.round(fl * 256), sway = Math.round(sw);
    const lutA = LUTS[toneA], lutB = LUTS[toneB], buf = g.buf;
    for (let y = 0, i = 0; y < H; y++) {
      const grow = y * GW + 8 - sway, br = (y & 3) << 2;
      for (let x = 0; x < W; x++, i++) {
        const bb = BAYER[br | (x & 3)];
        let L = (((GLOW[grow + x] * Fm) >> 8) + (bb >> 1)) >> 3; if (L > 31) L = 31;
        let D = (DEN[i] + bb) >> 4; if (D > 15) D = 15;
        buf[i] = (x > wipe ? lutB : lutA)[(L << 8) | (D << 4) | PT[i]];
      }
    }
    g.cost.px += N; costBox += N * 7;
    for (const P of cast) limbs(g, P, toneA, Fm, sw);
    if (G && G.dm > 0.05) {
      const c = leatherRGB(toneA, 24, 0, 10);
      g.thickLine(G.x, G.y + 31 * G.S, G.x - sw, 80, 2 * G.S, c, { aa: true, a: G.dm * 0.85 });
    }
    g.cost.box += costBox;
  },
};
