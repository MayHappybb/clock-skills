// Su Song's astronomical clock tower (水运仪象台, Kaifeng, 1092) in cutaway,
// on three stacked HUB75 panels (64 x 192). A water wheel at the base turns
// one scoop at a time by its escapement: one gold scoop goes round once a
// minute. Through the vertical shaft it steps the celestial globe, the
// armillary sphere on the roof and four puppet carousels behind the pagoda
// doors. The time is the four puppets standing in the doors, each holding a
// red-lacquer placard with a gilt numeral carved in a Song-dynasty type
// face (hours in purple robes, minutes in green).
//
// Minute turn: the puppet whose number is out of date bows, its carousel
// turns a third of a revolution, it is carried away behind the jamb and the
// next puppet arrives with the new placard, settles and lifts it. On the
// quarters the drummer on the roof beats; on the hour the bell rings the
// count, the armillary sphere sweeps round, lanterns flare up the tower and
// a procession of musicians and banner bearers circles the globe.
import * as kit from '../js/kit.js';
import { puppet, drawSprite, PH } from './sustower-glyphs.js';
import {
  W, H, Y, DOORS, WHEEL, GLOBE, ARM, C, background, armillary, globe, wheel,
  put, add, glow, dot, line,
} from './sustower-scene.js';

const img = new Float32Array(3 * W * H);
let WARM = false;
const pad = (n) => String(n).padStart(2, '0');
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const TAU = Math.PI * 2, STEP = 3, NS = WHEEL.n, SA = TAU / NS;
const R_CAR = 29, PHI = (TAU / 3);
const DELAY = [0.55, 0.45, 0.25, 0.15]; // bows follow the trip pulse up the shaft
const TURN = 1.35;
const POUR = 0.44;               // where the spout meets the wheel (rad from top)

/** Wheel position in scoops, with the escapement's jerk and recoil. */
function wheelPos(T) {
  const n = Math.floor(T / STEP), f = T - n * STEP;
  const u = sat(f / 0.42);
  return { pos: n + (u < 1 ? kit.ease.outBack(u) : 1), f, n };
}

/** Disc angle and bow for a slot at `age` seconds after its minute turn. */
function carousel(age, t0) {
  const a = age - t0;
  if (a < 0) return { psi: 0, bow: age > -0.6 ? 0 : 0, lift: 0 };
  const u = a / TURN;
  let psi;
  if (u < 1) psi = PHI * kit.ease.inOut(u);
  else psi = PHI + 0.09 * Math.sin((u - 1) * 14) * Math.exp(-(u - 1) * 5);
  const lift = u > 1 ? Math.sin(Math.min(1, (u - 1) / 0.45) * Math.PI) : 0;
  return { psi, lift };
}

// ---------------------------------------------------------- small figures
/** A little Song figure, ~11 px tall, feet at (x, y), scale s; kind: 0 drum, 1 banner, 2 lantern, 3 cymbal. */
function walker(x, y, s, kind, ph, k, mask) {
  const P = (px, py, c, a) => { if (!mask || !mask(px, py)) put(img, px, py, c, a); };
  const robe = [[0.2, 0.03, 0.02], [0.03, 0.14, 0.08], [0.15, 0.04, 0.22], [0.2, 0.12, 0.02]][kind];
  const step = Math.sin(ph) * 0.8 * s, bob = Math.abs(Math.cos(ph)) * 0.4 * s;
  const top = y - 11 * s - bob;
  for (let j = Math.floor(top); j <= Math.ceil(y); j++) for (let i = Math.floor(x - 4 * s); i <= Math.ceil(x + 4 * s); i++) {
    const px = i + 0.5 - x, py = j + 0.5 - top, u = py / s;
    let c = null;
    if (u >= 1.6 && u < 2.6 && Math.abs(px) < 3.6 * s) c = [0.1, 0.1, 0.13];        // hat wings
    else if (u >= 0 && u < 2.2 && Math.abs(px) < 1.6 * s) c = [0.12, 0.12, 0.16];   // crown
    else if (u >= 2.2 && u < 4.6 && Math.abs(px) < 1.5 * s) c = [0.55, 0.35, 0.2];  // face
    else if (u >= 4.6 && u < 10.4 && Math.abs(px) < (1.6 + (u - 4.6) * 0.32) * s) c = robe;
    else if (u >= 10.4 && u < 11.4 && (Math.abs(px - step) < 0.8 * s || Math.abs(px + step) < 0.8 * s)) c = [0.04, 0.03, 0.03];
    if (c) P(i, j, c, k);
  }
  const hx = x + 2.4 * s, hy = top + 6 * s;
  if (kind === 1) {      // banner on a pole, cloth waving
    line(img, hx, hy + 2 * s, hx, top - 6 * s, 0.9, C.woodHi, k);
    for (let q = 0; q < 5; q++) {
      const fx = hx + 0.8 + q * 0.9 * s, wv = Math.sin(ph * 1.3 - q * 0.9) * 0.6;
      line(img, fx, top - 6 * s + wv, fx, top - 1.5 * s + wv, 1, q % 2 ? [0.6, 0.06, 0.02] : [0.85, 0.5, 0.1], k);
    }
  } else if (kind === 2) { // a lantern on a staff
    line(img, hx, hy, hx + 2 * s, top - 2 * s, 0.8, C.woodHi, k);
    glow(img, hx + 2 * s, top - 0.5 * s, 2.2 * s, [1, 0.35, 0.06], 0.9 * k);
    glow(img, hx + 2 * s, top - 0.5 * s, 5 * s, [1, 0.4, 0.1], 0.08 * k);
  } else if (kind === 0) { // a hand drum
    glow(img, x, top + 7 * s, 2.2 * s, [0.6, 0.08, 0.03], 0.9 * k);
    dot(img, x + 2 * s * Math.sin(ph * 2), top + 5.5 * s, [0.9, 0.7, 0.4], 0.8 * k);
  } else {                 // cymbals clashing
    const o = (1 + Math.cos(ph * 2)) * 1.2 * s;
    glow(img, x - 1 - o, top + 6 * s, 1.5 * s, C.gold, 0.8 * k);
    glow(img, x + 1 + o, top + 6 * s, 1.5 * s, C.gold, 0.8 * k);
  }
}

// --------------------------------------------------------------- the roof
function drumAndBell(hit, ring, beat, bellSwing, light) {
  // drum on a stand, left of the armillary
  const dx = 8.5, dy = 19.5;
  line(img, dx - 3, dy + 3, dx - 4.5, Y.deck - 1, 0.9, C.wood, light);
  line(img, dx + 3, dy + 3, dx + 4.5, Y.deck - 1, 0.9, C.wood, light);
  for (let j = 14; j < 26; j++) for (let i = 3; i < 15; i++) {
    const u = (i + 0.5 - dx) / 4.6, v = (j + 0.5 - dy) / 4.2, d = u * u + v * v;
    if (d > 1) continue;
    const skin = Math.abs(u) < 0.35, c = skin ? [0.42, 0.16, 0.05] : [0.2, 0.012, 0.006];
    put(img, i, j, c, light * sat((1 - d) * 4));
    if (!skin && Math.abs(Math.abs(u) - 0.5) < 0.1 && (j % 2 === 0)) put(img, i, j, C.gold, 0.7 * light);
  }
  glow(img, dx, dy, 6, [1, 0.35, 0.08], 0.5 * hit * light);
  // the drummer with his stick
  const fx = 16.5, fy = Y.deck - 1;
  walker(fx, fy, 0.95, 3, 0, light * 0.95);
  const sa = -0.9 + 1.5 * beat, sl = 6;
  line(img, fx - 1.2, fy - 6, fx - 1.2 - sl * Math.cos(sa), fy - 6 - sl * Math.sin(-sa) * 0.8, 0.9, C.woodHi, light);
  // bell in a frame, right of the armillary, struck by a swinging log
  const bx = 55.5, by = 12;
  line(img, 49, 6, 62, 6, 1.2, C.wood, light); line(img, 50, 6, 50, Y.deck - 1, 1, C.wood, light); line(img, 61.5, 6, 61.5, Y.deck - 1, 1, C.wood, light);
  for (let j = 7; j < 21; j++) for (let i = 50; i < 62; i++) {
    const v = (j + 0.5 - 7) / 12, hw = v < 0.08 ? 1 : 2.2 + 2.6 * v * v + (v > 0.85 ? 0.6 : 0);
    const u = Math.abs(i + 0.5 - bx) / hw;
    if (v > 1 || u > 1) continue;
    const shade = 0.6 + 0.6 * (1 - u) * (i < bx ? 1.3 : 0.7);
    put(img, i, j, [C.bronze[0] * shade, C.bronze[1] * shade, C.bronze[2] * shade], light * sat((1 - u) * 3));
  }
  for (let q = 0; q < 3; q++) {
    const rr = 3 + ((ring * 2.2 + q * 0.8) % 2.4) * 4;
    const ra = ring > 0 ? ring * (1 - ((ring * 2.2 + q * 0.8) % 2.4) / 2.4) : 0;
    if (ra > 0.01) for (let k = 0; k < 40; k++) { const t = (k / 40) * TAU; dot(img, bx + rr * Math.cos(t), by + 4 + rr * 0.8 * Math.sin(t), C.gold, 0.25 * ra * light); }
  }
  glow(img, bx, by + 5, 5, [1, 0.75, 0.35], 0.35 * ring * light);
  const lx = bx - 7 + bellSwing * 3;
  line(img, lx - 4, 15.5, lx, 15.5, 1.6, C.woodHi, light);
  line(img, lx - 2, 15.5, lx - 2 - bellSwing * 2, 6, 0.6, C.wood, 0.7 * light);
}

function lantern(x, y0, sw, k, flick) {
  const bx = x + Math.sin(sw) * 3.5, by = y0 + Math.cos(sw) * 3.5;
  line(img, x, y0, bx, by - 1.6, 0.5, C.goldDim, 0.8);
  for (let j = Math.floor(by - 2); j <= Math.ceil(by + 2); j++) for (let i = Math.floor(bx - 2); i <= Math.ceil(bx + 2); i++) {
    const u = (i + 0.5 - bx) / 1.7, v = (j + 0.5 - by) / 2.1, d = u * u + v * v;
    if (d < 1) put(img, i, j, [0.95 * flick, 0.28 * flick, 0.05 * flick], k * sat((1 - d) * 3));
  }
  put(img, Math.floor(bx), Math.floor(by + 2.2), C.gold, 0.6);
  glow(img, bx, by, 7, [1, 0.4, 0.1], 0.035 * k * flick);
}

export default {
  name: 'Su Song tower',
  blurb: 'the 1092 water-driven astronomical clock tower in cutaway: puppets in the pagoda doors hold the time on lacquer placards, a water wheel steps everything by its escapement',
  layouts: ['hub-tall3'], look: 'smoke', fps: 60, brightness: 0.35, dither: true,
  frame(ctx) {
    const d = ctx.date, ms = d.getTime(), T = ms / 1000;
    const night = ctx.night, lit = 1 - 0.45 * night;
    const sec = kit.secOf(d), min = d.getMinutes(), hr = d.getHours();
    const cur = pad(hr) + pad(min);
    const pd = new Date(ms - 60000), prev = pad(pd.getHours()) + pad(pd.getMinutes());
    const isHour = min === 0, hourAge = isHour ? sec : 99;

    if (!WARM) { for (let dg = 0; dg < 10; dg++) { puppet(dg, 0); puppet(dg, 1); } WARM = true; }
    img.set(background());

    // ---- the sky over the roof platform: stars at night
    if (night > 0) for (let k = 0; k < 26; k++) {
      const sx = kit.hash(k, 3) * 64, sy = kit.hash(k, 7) * 24;
      const tw = 0.5 + 0.5 * Math.sin(T * (0.8 + kit.hash(k, 9) * 2) + k);
      dot(img, sx, sy, [0.5, 0.55, 0.7], 0.12 * night * (0.4 + 0.6 * tw));
    }

    // ---- the escapement drives everything
    const wp = wheelPos(T), pos = wp.pos;
    const flick = 1 + 0.05 * Math.sin(T * 7.1) * Math.sin(T * 3.3 + 1) + 0.03 * Math.sin(T * 17.3);
    const kickAge = wp.f;                          // time since the last tick
    const jolt = Math.exp(-kickAge * 1.6) * Math.sin(kickAge * 6);

    // roof: armillary sphere, drum, bell
    const spin = isHour ? TAU * kit.ease.inOut(sat(hourAge / 6)) : 0;
    armillary(img, pos * 0.06, spin, lit);
    // drum beats: quarters 3 beats, the hour a roll of 6
    let hit = 0, beat = 0;
    const qAge = sec + (min % 15) * 60;
    const nBeats = min % 15 === 0 ? (isHour ? 6 : 3) : 0;
    for (let b = 0; b < nBeats; b++) {
      const bt = qAge - (isHour ? 0.3 + b * 0.32 : 0.2 + b * 0.6);
      if (bt >= 0 && bt < 0.6) { hit = Math.max(hit, Math.exp(-bt * 7)); beat = Math.max(beat, bt < 0.08 ? bt / 0.08 : Math.exp(-(bt - 0.08) * 9)); }
    }
    // the bell rings the hour count
    let ring = 0, bellSwing = 0;
    if (isHour) {
      const n = hr % 12 || 12;
      for (let b = 0; b < n; b++) {
        const bt = hourAge - (2.4 + b * 0.55);
        if (bt >= 0 && bt < 1.2) ring = Math.max(ring, Math.exp(-bt * 2.6));
        if (bt > -0.25 && bt < 0.25) bellSwing = Math.max(bellSwing, 1 - Math.abs(bt) / 0.25);
      }
    }
    drumAndBell(hit, ring, beat, bellSwing, lit);

    // ---- globe storey: the globe, and on the hour the procession round it
    const procT = isHour ? hourAge - 0.8 : -1;
    const walkers = [];
    if (procT > 0 && procT < 9) for (let q = 0; q < 6; q++) {
      const th = -1.75 + procT * 0.75 - q * 0.62;
      if (th < -Math.PI * 0.62 || th > Math.PI * 1.62) continue;
      const fade = sat((th + Math.PI * 0.62) * 2) * sat((Math.PI * 1.62 - th) * 2);
      walkers.push([th, q, fade]);
    }
    const behindMask = (i, j) => (j >= GLOBE.cy && i >= 17 && i < 47) || ((i + 0.5 - GLOBE.cx) ** 2 + (j + 0.5 - GLOBE.cy) ** 2 < GLOBE.r * GLOBE.r);
    for (const [th, q, f] of walkers) if (Math.cos(th) < 0) {
      const s = 0.82 + 0.1 * Math.cos(th);
      walker(GLOBE.cx + 24 * Math.sin(th), Y.eave1 - 3.5 + 1.2 * Math.cos(th), s, q % 4, procT * 7 + q, lit * f * 0.7, behindMask);
    }
    globe(img, pos * 0.09, lit, night);
    for (const [th, q, f] of walkers) if (Math.cos(th) >= 0) {
      const s = 0.82 + 0.12 * Math.cos(th);
      walker(GLOBE.cx + 24 * Math.sin(th), Y.eave1 - 3.5 + 1.2 * Math.cos(th), s, q % 4, procT * 7 + q, lit * f, null);
    }

    // ---- the vertical shaft in the centre posts, turning step by step
    for (let y = Y.globe0 + 2; y < Y.beam; y++) {
      if (y >= GLOBE.cy - 12 && y < Y.eave1) continue;
      for (let x = 31; x < 33; x++) {
        const st = 0.5 + 0.5 * Math.cos((y * 0.9 + (x - 31) * 1.4 - pos * 2.2) * 1.4);
        put(img, x, y, [C.bronze[0] * (0.35 + 0.65 * st), C.bronze[1] * (0.35 + 0.65 * st), C.bronze[2] * (0.35 + 0.65 * st)], 0.9 * lit);
      }
    }
    // the escapement's trip, a glint running up the shaft at every minute
    {
      const reach = isHour ? 4 : Y.hour + 8, pt = sec / 0.65;
      if (pt < 1.3) {
        const py = Y.beam - (Y.beam - reach) * Math.min(1, pt), fade = pt < 1 ? 1 : 1 - (pt - 1) / 0.3;
        for (let k = 0; k < 7; k++) glow(img, 32, py + k * 1.6, 2.2 - k * 0.2, [1, 0.7, 0.3], 0.5 * fade * (1 - k / 7) * lit);
      }
    }
    // the crown gear on the base beam
    for (let x = 4; x < 60; x++) {
      const tooth = 0.5 + 0.5 * Math.cos(((x + 0.5 + pos * 1.6) / 3) * TAU);
      put(img, x, Y.beam + 1, [C.gold[0] * 0.5 * tooth, C.gold[1] * 0.5 * tooth, C.gold[2] * 0.5 * tooth], lit);
    }

    // ---- the four doors: carousels of puppets
    const minAge = sec;
    let lastDelay = 0;
    for (let k = 0; k < 4; k++) if (prev[k] !== cur[k]) lastDelay = Math.max(lastDelay, DELAY[k]);
    const t0 = lastDelay + 0.5;    // the escapement trips the turn once every bow is done
    for (let k = 0; k < 4; k++) {
      const [x0, x1, y0] = DOORS[k], cx = (x0 + x1) / 2, by = y0 + PH, robe = k < 2 ? 0 : 1;
      const changed = prev[k] !== cur[k] && minAge < 4;
      const lamp = lit * (0.97 + 0.03 * flick) * (1 + (isHour ? 0.25 * Math.exp(-((hourAge - 0.4 - (3 - k) * 0.3) ** 2) * 6) : 0));
      // the carousel floor rim turning
      const cs = changed ? carousel(minAge, t0) : { psi: 0, lift: 0 };
      for (let m = 0; m < 12; m++) {
        const ph = m * (TAU / 12) + 0.26 - cs.psi, c = Math.cos(ph);
        if (c > 0.2) dot(img, cx + R_CAR * 0.55 * Math.sin(ph), by - 0.6, C.goldDim, 0.6 * c * lamp);
      }
      const glintP = ((T + k * 1.9) % 9) / 1.4;
      const glint = glintP < 1 ? 0.35 * Math.sin(glintP * Math.PI) : 0;
      const figs = changed ? [[+prev[k], -cs.psi, 1], [+cur[k], PHI - cs.psi, 0]] : [[+cur[k], 0, 0]];
      for (const [dg, phi, isOld] of figs) {
        const c = Math.cos(phi);
        if (c < 0.49) continue;
        const s = 0.88 + 0.12 * c, x = cx + R_CAR * Math.sin(phi);
        const shade = (0.35 + 0.65 * ((c - 0.49) / 0.51) ** 0.6) * lamp;
        // body + placard, then the head on top: a bow dips the head and tips the placard
        let sy = 1, lift = 0, dip = 0, hs = 1;
        if (isOld && changed) { const b = kit.ease.inOut(sat((minAge - DELAY[k]) / 0.45)); sy = 1 - 0.07 * b; dip = 3.2 * b; hs = 1 + 0.06 * b; }
        if (!isOld && changed) lift = 1.3 * cs.lift;
        const spr = puppet(dg, robe), sway = 0;
        const bb = by - 0.0001 - lift;
        drawSprite(img, W, spr, x, bb, s, sy, shade, changed ? 0 : glint, glintP * 1.4 - 0.2, x0, y0, x1, by, 14, PH);
        const neck = bb - (PH - 14) * s * sy;               // where the body part ends
        drawSprite(img, W, spr, x + sway, neck + dip + lift * 0.7 + (PH - 14) * s * hs, s * hs, 1, shade, 0, 0, x0, y0, x1, by, 0, 14);
      }
      if (!changed) {  // blink now and then
        const bp = (T + kit.hash(k, 5) * 7) % (4.3 + k * 0.7);
        if (bp < 0.14) for (const ex of [x0 + 10, x0 + 15]) for (const ey of [y0 + 8, y0 + 9]) put(img, ex, ey, [0.42 * lamp, 0.25 * lamp, 0.14 * lamp], ey === y0 + 9 ? 0.6 : 1);
      }
    }

    // ---- lanterns under the eaves, jolted by every tick
    const flare = (y) => (isHour ? 0.9 * Math.exp(-((hourAge - 0.3 - (192 - y) / 120) ** 2) * 5) : 0);
    for (const [lx, ly, k] of [[2.2, 55.5, 0], [61.8, 55.5, 1], [2.2, 103.5, 2], [61.8, 103.5, 3]]) {
      const sw = 0.1 * Math.sin(T * 1.9 + k * 1.3) + 0.12 * jolt;
      lantern(lx, ly, sw, 1, (1 + 0.15 * night) * flick * (1 + flare(ly)) * (0.9 + 0.1 * Math.sin(T * 5 + k)));
    }

    // ---- on the hour: sky lanterns, one per stroke, rise up the whole tower
    if (isHour && hourAge < 16) {
      const n = hr % 12 || 12, cols = [2.5, 61.5, 32];
      for (let q = 0; q < n; q++) {
        const age = hourAge - 1.2 - q * 0.45;
        if (age <= 0) continue;
        const yy = 150 - age * (17 + 3 * kit.hash(q, 1)) - age * age * 0.6;
        if (yy < -6) continue;
        const col = cols[q % 3], up = sat((27 - yy) / 30);
        const xx = col + 1.1 * Math.sin(age * 1.4 + q) + (col < 32 ? 1 : col > 32 ? -1 : 0) * 0 + (col - 32) * -0.25 * up + (kit.hash(q, 2) - 0.5) * 18 * up;
        const fade = sat(age * 2) * sat((yy + 6) / 10), fl = 0.85 + 0.15 * Math.sin(T * 13 + q * 3);
        // a paper lantern 5 wide, 6 tall, wider at the top, the flame at its mouth
        for (let j = Math.floor(yy - 3.4); j <= Math.ceil(yy + 3); j++) for (let i = Math.floor(xx - 3); i <= Math.ceil(xx + 3); i++) {
          const v = (j + 0.5 - yy) / 3, u = Math.abs(i + 0.5 - xx) / (2.6 - 0.5 * v);
          if (v < -1 || v > 1 || u > 1) continue;
          const core = 1 - u * 0.6 + 0.4 * v;
          put(img, i, j, [0.95 * fl * core, 0.4 * fl * core, 0.08 * fl * core], fade * sat((1 - u) * 2.2) * sat((1 - Math.abs(v)) * 3));
        }
        glow(img, xx, yy + 2.6, 1.4, [1, 0.85, 0.5], 0.8 * fade * fl);
        glow(img, xx, yy, 9, [1, 0.45, 0.1], 0.07 * fade);
      }
    }

    // ---- the water wheel and its water
    const fillNow = wp.f < 0.42 ? 0 : sat((wp.f - 0.42) / 2.45);
    const fill = (sa) => {
      let dd = sa - POUR; if (dd > Math.PI) dd -= TAU; if (dd < -Math.PI) dd += TAU;
      if (dd < -SA * 0.5) return 0;
      if (dd <= SA * 0.5) return wp.f < 0.42 ? (dd > 0.02 ? 1 : 0) : fillNow;
      return sat((Math.PI + 0.55 - sa) / 0.45);
    };
    const wAng = pos * SA;
    wheel(img, wAng, fill, lit, T);
    // the spout's stream into the scoop under it
    const sx0 = 36.4, sy0 = 153.4;
    const tx = WHEEL.cx + (WHEEL.r + 2.6) * Math.sin(POUR), ty = WHEEL.cy - (WHEEL.r + 2.6) * Math.cos(POUR);
    for (let q = 0; q <= 12; q++) {
      const u = q / 12, x = sx0 + (tx - sx0) * u - 0.6 * u * (1 - u), y = sy0 + (ty - sy0) * u;
      const shimmer = 0.6 + 0.4 * Math.sin(y * 2.3 - T * 22);
      dot(img, x, y, C.waterHi, 0.55 * shimmer * lit);
    }
    for (let q = 0; q < 3; q++) {
      const ph = (T * 2.5 + q / 3) % 1;
      dot(img, tx + (q - 1) * 1.6 * ph, ty - 1.4 * Math.sin(ph * Math.PI), C.waterHi, 0.35 * (1 - ph) * lit);
    }
    // tank water level
    for (let x = 48; x < 59; x++) put(img, x, 156, C.water, 0.8 * lit), add(img, x, 155, C.waterHi, (0.05 + 0.05 * Math.sin(x * 1.3 + T * 3)) * lit);
    // the weighing lever under the filling scoop and the upper lock
    const tipY = 162.2 + 1.6 * fillNow - (wp.f < 0.42 ? 1.2 * Math.sin((wp.f / 0.42) * Math.PI) : 0);
    line(img, 44.5, 166, 36.5, tipY, 1.2, C.bronze, lit);
    glow(img, 45.5, 166.5, 1.6, C.gold, 0.5 * lit);
    const lockLift = wp.f < 0.42 ? Math.sin((wp.f / 0.42) * Math.PI) : 0;
    line(img, 12, 156.5, 19, 160.5 - 2.2 * lockLift, 1.1, C.bronze, lit);
    // the reservoir: the spill from the bottom scoops, ripples
    const surf = 187.6;
    for (let x = 2; x < 62; x++) {
      const wv = 0.35 * Math.sin(x * 0.7 - T * 2.1) + 0.25 * Math.sin(x * 1.9 + T * 3.3);
      for (let y = Math.floor(surf + wv); y < H; y++) {
        const a = sat(surf + wv + 1 - y);
        put(img, x, y, [C.water[0] * 0.7, C.water[1] * 0.7, C.water[2] * 0.7], 0.8 * a * lit);
      }
      const hl = Math.max(0, Math.sin(x * 0.9 + T * 1.7) * Math.sin(x * 0.31 - T * 0.6));
      add(img, x, Math.floor(surf + wv), C.waterHi, 0.18 * hl * lit);
    }
    const spill = wp.f < 1 ? Math.exp(-wp.f * 3) : 0;
    for (let q = 0; q < 4; q++) {
      const ph = (wp.f * 1.6 + q * 0.25) % 1;
      dot(img, WHEEL.cx - 3 - q * 1.3, 180 + ph * 8, C.waterHi, 0.5 * spill * (1 - ph) * lit);
    }
    glow(img, WHEEL.cx - 5, surf, 3, C.waterHi, 0.1 * spill * lit);

    kit.blitGrid(ctx, img);
  },
};
