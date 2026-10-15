// Water Clock Tower: a 64x192 cutaway of Su Song's 11th-century astronomical
// clock tower (水运仪象台, Kaifeng, 1092). Three storeys, one per panel:
//   roof    - a bronze armillary sphere, its rings turning once a day,
//             catching a raking lamplight.
//   middle  - a celestial globe behind a timber lattice window, turning
//             with the stars.
//   base    - a two-tier pagoda of little doors. Puppets in Song dress step
//             out holding carved, lacquered placards: gold on red lacquer,
//             the carver's own numeral set (sonnet-sustower-glyphs.js). The
//             upper tier shows the hour, the lower the minute. Below them,
//             a scoop-wheel driven by falling water, tripped one scoop at a
//             time by an escapement linkage: the wheel only turns in jerky
//             physical steps, in time with the real escapement that also
//             drives the puppets.
//
// The time is the mechanism: a minute change is a puppet changing shift
// (bow, withdraw into the door, the next puppet's door opens, it steps out
// with the new placard already carved) timed to one escapement trip of the
// waterwheel below. The hour is a bigger show: both doors on the hour tier
// open together, drums and bells (two extra puppets strike them), the whole
// wheel takes a slower, heavier stepping lap, lanterns flare.
import * as kit from '../js/kit.js';
import {
  W, H, img, over, ellipse, capsule, rect, placardDigit, BOX_W, BOX_H,
} from './sonnet-sustower-paint.js';

const hx = kit.hex;

// ---------------------------------------------------------------- palette
// (sRGB hex in, converted to linear by kit.hex: pick bolder sRGB values than
// feel natural, since linear halves apparent brightness at the dark end)
const NIGHT_SKY = hx('#141c30'), DAY_SKY = hx('#2e3c58');
const TIMBER = hx('#6e4228'), TIMBER_LIT = hx('#a4683c'), TIMBER_DARK = hx('#36200f');
const BRONZE = hx('#b08c4e'), BRONZE_LIT = hx('#f0cf80'), BRONZE_DARK = hx('#6a4e26');
const LACQUER = hx('#b8362a'), LACQUER_LIT = hx('#e85a3e'), LACQUER_DARK = hx('#5c1510');
const GOLD = hx('#ffcf52'), GOLD_HOT = hx('#fff0b0');
const GROOVE = hx('#3a0f0a');
const GLOBE_SEA = hx('#2a5a74'), GLOBE_LAND = hx('#7a6236'), GLOBE_LIT = hx('#9c8248');
const WATER = hx('#3f8ab0'), WATER_LIT = hx('#bdeaff'), FOAM = hx('#eafbff');
const LANTERN = hx('#ffa83e');
const ROBE = [hx('#c4433a'), hx('#3f74b0'), hx('#519e5e'), hx('#c49a3e')];
const SKIN = hx('#eac290'), SKIN_DARK = hx('#b98a5c');

// ---------------------------------------------------------------- geometry
// three 64x64 panels stacked: roof 0-64, globe storey 64-128, pagoda 128-192
const CX = 32;
const ROOF_Y = 32, GLOBE_Y = 96;
const DOOR_TIER_H = 28;              // each door tier (hour, then minute)
const DOOR_TIER_Y0 = 129;            // hour tier top
const MIN_TIER_Y0 = DOOR_TIER_Y0 + DOOR_TIER_H;  // minute tier top (157)
const PLACARD_S = 0.78;              // placard scale: fits a 20px-tall digit in a 28px tier
// the water wheel sits low, mostly tucked behind/below the pagoda's base
// platform: only its lower arc is glimpsed under the structure, so it never
// competes with the door tiers for vertical room.
// drawn before the door tiers, so the tiers' own opaque rects naturally
// occlude everything above WHEEL_CY - WHEEL_R - 10 (the falling-water
// stream's top): only the wheel's lower arc and base pool show, under the
// pagoda's floor.
const WHEEL_CY = 199, WHEEL_R = 15;

const pad = (n) => String(n).padStart(2, '0');

// ----------------------------------------------------- static architecture
// Pre-rendered once: the tower's timber frame, roof eaves, lattice windows,
// pagoda doorframes. frame() only overlays what moves.
const BG = new Float32Array(W * H * 3);
function bgOver(x, y, c, a) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const p = 3 * (y * W + x);
  if (a > 1) a = 1;
  BG[p] += (c[0] - BG[p]) * a; BG[p + 1] += (c[1] - BG[p + 1]) * a; BG[p + 2] += (c[2] - BG[p + 2]) * a;
}
function bgRect(x0, y0, x1, y1, c, a = 1) {
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
    const cy = kit.clamp(Math.min(y - y0 + 0.5, y1 - y + 0.5));
    if (cy <= 0) continue;
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) {
      const cxv = cy * kit.clamp(Math.min(x - x0 + 0.5, x1 - x + 0.5));
      if (cxv <= 0) continue;
      bgOver(x, y, c, cxv * a);
    }
  }
}
function bgEllipse(cx, cy, rx, ry, c, a = 1) {
  const x0 = Math.max(0, Math.floor(cx - rx - 1)), x1 = Math.min(W - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(H - 1, Math.ceil(cy + ry + 1));
  const m = Math.min(rx, ry);
  for (let y = y0; y <= y1; y++) {
    const v = (y - cy) / ry;
    for (let x = x0; x <= x1; x++) {
      const u = (x - cx) / rx, q = Math.sqrt(u * u + v * v);
      const cov = 0.5 - (q - 1) * m;
      if (cov <= 0) continue;
      bgOver(x, y, c, a * (cov > 1 ? 1 : cov));
    }
  }
}
(function buildBackground() {
  // night sky gradient behind the whole tower
  for (let y = 0; y < H; y++) {
    const sky = kit.mix(NIGHT_SKY, DAY_SKY, 0.3);
    for (let x = 0; x < W; x++) bgOver(x, y, sky, 1);
  }
  // --- roof storey: platform + flared eaves + corner posts, sphere sits atop
  bgRect(4, 50, 60, 56, TIMBER_DARK, 1);                 // roof platform slab
  bgRect(0, 54, 64, 58, TIMBER, 1);                       // flared eave below the platform
  for (let x = 0; x < 64; x++) {
    const edge = Math.min(x, 63 - x);
    const dy = 2.2 - Math.min(edge, 10) * 0.2;            // eave sweeps up at the corners
    bgRect(x, 56 - dy, x + 1, 58, TIMBER_LIT, 0.5);
  }
  bgRect(10, 10, 13, 50, TIMBER, 1); bgRect(51, 10, 54, 50, TIMBER, 1);  // corner posts holding the sphere's cage
  // --- middle storey: timber lattice window round the globe
  bgRect(2, 62, 62, 126, TIMBER_DARK, 1);
  const latticeY0 = 64, latticeY1 = 124;
  for (let y = latticeY0; y <= latticeY1; y += 7) bgRect(4, y, 60, y + 1.2, TIMBER, 0.85);
  for (let x = 4; x <= 60; x += 8) bgRect(x, latticeY0, x + 1.2, latticeY1, TIMBER, 0.85);
  bgRect(2, 60, 62, 64, TIMBER_LIT, 1); bgRect(2, 124, 62, 128, TIMBER_LIT, 1);  // sills
  // --- base storey: pagoda face with two door tiers, posts, wheel housing
  bgRect(0, 128, 64, 192, TIMBER_DARK, 1);
  bgRect(4, 130, 60, 132, TIMBER_LIT, 1);                  // header below the globe storey
  bgRect(0, DOOR_TIER_Y0 + DOOR_TIER_H - 1, 64, DOOR_TIER_Y0 + DOOR_TIER_H + 1, TIMBER_LIT, 0.8); // divider between tiers
  bgRect(0, MIN_TIER_Y0 + DOOR_TIER_H - 1, 64, MIN_TIER_Y0 + DOOR_TIER_H + 1, TIMBER_LIT, 0.8);
  for (const x of [8, 32, 56]) bgRect(x - 1.4, 130, x + 1.4, 192, TIMBER, 1);  // posts
  // wheel housing: a dark recess behind the scoop wheel
  bgEllipse(CX, WHEEL_CY, WHEEL_R + 3, WHEEL_R + 3, TIMBER_DARK, 1);
})();

// ------------------------------------------------------------- time state
function digitsOf(d) { return { h: pad(d.getHours()), m: pad(d.getMinutes()) }; }

// Escapement: one trip per real second (60 ticks/minute), each tick jerks the
// wheel forward by one scoop then holds (verge-and-foliot character). Phase
// 0..1 within the current second: 0-0.35 settle/hold, 0.35-0.65 the trip
// (fast angular jump), 0.65-1 damped settle ring-down.
function escapement(now) {
  const s = Math.floor(now), f = now - s;
  let jump;
  if (f < 0.35) jump = 0;
  else if (f < 0.65) jump = kit.ease.outBack(kit.clamp((f - 0.35) / 0.3));
  else jump = 1 + 0.04 * Math.sin((f - 0.65) * 22) * Math.exp(-(f - 0.65) * 14);
  return { tickAngle: (s + kit.clamp(jump)) * (Math.PI * 2 / 20), tripping: f >= 0.3 && f < 0.42, s };
}

// ----------------------------------------------------- armillary sphere
// A ring of fixed 3D radius R, lying in a plane tilted by (pitch, yaw) about
// the sphere's centre, projected to the screen (weak perspective: y is
// flattened a bit, matching a cage seen slightly from above).
function ring3D(cx, cy, R, pitch, yaw, col, width, a = 1) {
  const n = 40;
  let px, py;
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy2 = Math.cos(yaw), sy2 = Math.sin(yaw);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    // ring in its own plane (x', z'), then rotate by pitch around x, then yaw around y
    const x0 = R * Math.cos(t), z0 = R * Math.sin(t);
    const y1 = -z0 * sp, z1 = z0 * cp;              // tilt forward/back
    const x2 = x0 * cy2 + z1 * sy2;                   // turn around vertical axis (the daily spin)
    const sx = cx + x2, sy = cy + y1 * 0.82;          // mild squash for the cage's slight downward view
    if (i > 0) capsule(px, py, sx, sy, width, col, a);
    px = sx; py = sy;
  }
}
function drawSphere(now) {
  const cy = ROOF_Y - 1, R = 14;
  const spin = now * (Math.PI * 2 / 240);           // one slow turn every 4 minutes: visibly alive, not frantic
  // three great circles of an armillary cage, all the same radius, crossing:
  // the horizon ring (near-flat), the meridian (near-vertical, fixed to the
  // frame), and the ecliptic (tilted), all turning together on the daily axis
  ring3D(CX, cy, R, 1.42, spin, BRONZE_DARK, 1.3, 0.95);          // horizon, almost flat
  ring3D(CX, cy, R, 0.08, spin * 0.5, BRONZE, 1.15, 1);            // meridian, nearly edge-on
  ring3D(CX, cy, R, 0.75, spin + 1.1, BRONZE_LIT, 1.15, 1);        // ecliptic, tilted, catches the light most
  // polar axis finial, glinting as it turns past the lamp
  const glint = Math.max(0, Math.sin(spin * 2)) ** 3;
  ellipse(CX, cy - R - 1.5, 1.5, 1.5, kit.mix(GOLD, GOLD_HOT, glint), 0.75 + 0.25 * glint, 0, true);
  ellipse(CX, cy + R + 1.5, 1.1, 1.1, BRONZE, 0.8, 0, true);
  // the cradle: a plain fixed ring at the equator holding it all up
  ring3D(CX, cy, R + 1.6, 1.52, 0, BRONZE_DARK, 1.4, 0.9);
  // posts holding the cage, down to the platform
  capsule(CX - R * 0.85, cy + R * 0.3, CX - R * 0.7, 50, 1.1, TIMBER_LIT, 0.7);
  capsule(CX + R * 0.85, cy + R * 0.3, CX + R * 0.7, 50, 1.1, TIMBER_LIT, 0.7);
}

// ------------------------------------------------------------- celestial globe
// Fixed star field in (longitude, latitude); projected onto a sphere of
// radius r turning on a vertical axis, so dots slow and foreshorten
// correctly near the limb and vanish on the far side.
const STARS = [];
for (let k = 0; k < 26; k++) STARS.push({ lon: k * 2.414, lat: (((k * 53) % 100) / 100 - 0.5) * 1.5, gold: k % 6 === 0 });
function drawGlobe(now) {
  const cx = CX, cy = GLOBE_Y, r = 17;
  const spin = now * (Math.PI * 2 / 240) * 0.75;
  ellipse(cx, cy, r, r, GLOBE_SEA, 1, 0.35);
  for (const st of STARS) {
    const lat = kit.clamp(st.lat, -1.4, 1.4);
    const lon = st.lon + spin;
    const c = Math.cos(lon);
    if (c < -0.08) continue;                 // back of the globe
    const cl = Math.cos(lat);
    const x = cx + r * Math.sin(lon) * cl;
    const y = cy + r * Math.sin(lat) * 0.98;
    const edge = kit.clamp((c + 0.08) / 1.08);
    // bright, distinct point: a small opaque disc first (so it reads as a
    // dot against the sea, not just a soft add-glow smear), then a touch of
    // additive glow on top for sparkle
    ellipse(x, y, 0.85 * edge + 0.45, 0.85 * edge + 0.45, st.gold ? GOLD_HOT : GLOBE_LIT, 0.9 * edge + 0.1, 0, false);
    ellipse(x, y, 1.3 * edge + 0.5, 1.3 * edge + 0.5, st.gold ? GOLD : GLOBE_LIT, 0.5 * edge, 0, true);
  }
  // limb shading + a lit crescent from the lamp above
  ellipse(cx, cy, r, r, GLOBE_LIT, 0.22, 1.6);
  ellipse(cx - r * 0.3, cy - r * 0.35, r * 0.5, r * 0.5, [1, 1, 1], 0.08, 0, true);
  // meridian ring (horizon ring of its bronze cradle) and polar axis
  ring3D(cx, cy, r + 1.5, 1.47, 0, BRONZE, 1.1, 0.85);
  capsule(cx, cy - r - 3, cx, cy + r + 3, 1, BRONZE_DARK, 0.7);
}

// --------------------------------------------------------- puppets & doors
// A small, simple puppet: round head and a robe triangle, sitting low in the
// door so the placard it raises overhead has clean, empty air around it.
// (x, y) is the feet position, h the puppet's own height (short: it is a
// doorway figure, not the hero of the scene). `bow` 0..1 tips it forward and
// shrinks it as it withdraws into the door (minute-turn exit).
function drawPuppet(x, y, h, robe, bow) {
  const s = 1 - 0.55 * bow;                         // shrink as it bows into the doorway
  const headR = h * 0.26 * s, lean = bow * 1.6;
  const hy = y - h * s + headR * 1.15;
  const hemW = h * 0.34 * s, shW = h * 0.16 * s, botY = y, topY = hy + headR * 1.2;
  for (let yy = Math.floor(topY); yy <= Math.ceil(botY); yy++) {
    const t = kit.clamp((yy - topY) / Math.max(1, botY - topY));
    const w = kit.lerp(shW, hemW, t);
    rect(x + lean * t * 0.5 - w, yy, x + lean * t * 0.5 + w, yy + 1, robe, 1);
  }
  ellipse(x + lean * 0.2, hy, headR, headR, SKIN, 1, 0.4);
  capsule(x + lean * 0.2 - headR * 0.9, hy - headR * 0.25, x + lean * 0.2 + headR * 0.9, hy - headR * 0.25, headR * 0.3, hx('#140d08'), 0.9); // hat brim
  return { headX: x + lean * 0.2, headY: hy - headR * 1.1 };
}

/** One door-cell's state machine for a digit slot. Returns what to draw:
 * doorOpen (0..1), puppet pose, and which digit's placard is showing + its
 * carve-reveal (so a new placard is never shown half-carved as a WRONG
 * digit mid-reveal only during its own entrance, after the door is open and
 * the old puppet has fully left). */
function doorState(age, changed) {
  // age: seconds since the value last changed (0 at the instant of change)
  const OPEN = 0.5, OLD_OUT = 1.0, GAP = 1.25, NEW_IN = 2.1, PRESENT = 2.7;
  if (!changed || age > PRESENT) return { doorOpen: 0, showOld: false, oldBow: 0, newU: 1, carving: 1 };
  if (age < OPEN) return { doorOpen: kit.ease.out(age / OPEN), showOld: true, oldBow: 0, newU: 0, carving: 0 };
  if (age < OLD_OUT) { const u = (age - OPEN) / (OLD_OUT - OPEN); return { doorOpen: 1, showOld: true, oldBow: kit.ease.inOut(u), newU: 0, carving: 0 }; }
  if (age < GAP) return { doorOpen: 1, showOld: false, oldBow: 1, newU: 0, carving: 0 };
  if (age < NEW_IN) { const u = (age - GAP) / (NEW_IN - GAP); return { doorOpen: 1, showOld: false, oldBow: 1, newU: kit.ease.out(u), carving: u }; }
  const u = kit.clamp((age - NEW_IN) / (PRESENT - NEW_IN));
  return { doorOpen: 1, showOld: false, oldBow: 1, newU: 1, carving: 1, settled: u >= 1 };
}

// Place a placard (digit `d`, 0..1 carve-reveal `cut`, 0..1 presence `u`:
// scales up from the puppet's head as it's raised) centred at (cx, topY),
// growing downward from a fixed top anchor so it never drifts into the
// puppet's head beneath it.
function drawPlacard(d, cx, topY, u, cut) {
  if (u <= 0.02) return;
  const s = PLACARD_S * kit.ease.out(u);
  const bw = BOX_W * s, bh = BOX_H * s;
  const x = cx - bw / 2, y = topY;
  rect(x - 0.8, y - 0.8, x + bw + 0.8, y + bh + 0.8, LACQUER_DARK, u);     // frame edge
  rect(x, y, x + bw, y + bh, LACQUER, u);                                  // the board itself
  placardDigit(d, x, y, s, { cut, gold: GOLD, deep: GROOVE, bright: u });
}

function drawDoorTier(y0, x0, w, curDigit, prevDigit, changed, age, robe, bigShow) {
  const h = DOOR_TIER_H, cx = x0 + w / 2, floorY = y0 + h - 2.5, puppetH = h * 0.3;
  const placardTopY = y0 + 5;
  // doorframe
  rect(x0 + 2, y0 + 4, x0 + w - 2, y0 + h - 2, LACQUER_DARK, 1);
  rect(x0 + 2, y0 + 2, x0 + w - 2, y0 + 4, TIMBER_LIT, 1);
  const st = doorState(age, changed);
  const doorOpen = bigShow ? 1 : st.doorOpen;
  const openPx = doorOpen * (w * 0.5 - 3);
  // door leaves slide open to the sides
  rect(x0 + 2, y0 + 4, x0 + 2 + (w / 2 - 2 - openPx), y0 + h - 2, LACQUER, 1);
  rect(x0 + w - 2 - (w / 2 - 2 - openPx), y0 + 4, x0 + w - 2, y0 + h - 2, LACQUER, 1);
  for (const dx of [6, w - 6]) rect(x0 + dx - 0.6, y0 + 6, x0 + dx + 0.6, y0 + h - 4, GOLD, 0.5 * (1 - doorOpen));
  // interior, dark but warm, lit when open
  if (doorOpen > 0.05) rect(x0 + 3, y0 + 5, x0 + w - 3, y0 + h - 2, hx('#1c0f08'), 0.9 * doorOpen);

  if (bigShow) {
    // hour show: the puppet steps fully out holding its already-carved placard high
    const u = kit.clamp(age / 2.2);
    const px = kit.lerp(x0 + w * 0.3, cx, kit.ease.inOut(u));
    drawPuppet(px, floorY, puppetH, robe, 0);
    drawPlacard(curDigit, px, placardTopY, 1, 1);
    return;
  }
  if (!changed) {
    drawPuppet(cx, floorY, puppetH, robe, 0);
    drawPlacard(curDigit, cx, placardTopY, 1, 1);
    return;
  }
  // old puppet bows, placard shrinks away with it (never shows a wrong digit:
  // the old placard is correct for the time up to the instant it changed)
  if (st.showOld) {
    drawPuppet(cx, floorY, puppetH, robe, st.oldBow);
    drawPlacard(prevDigit, cx, placardTopY, 1 - st.oldBow, 1);
  }
  // new puppet rises and its placard is carved into view fresh
  if (st.newU > 0) {
    drawPuppet(cx, floorY, puppetH, robe, 0);
    drawPlacard(curDigit, cx, placardTopY, st.newU, st.carving ?? 1);
  }
}

// ------------------------------------------------------------- scoop wheel
function drawWheel(now, esc, night) {
  const scoops = 20;
  for (let k = 0; k < scoops; k++) {
    const a = esc.tickAngle + k * (Math.PI * 2 / scoops);
    const x = CX + Math.cos(a) * WHEEL_R, y = WHEEL_CY + Math.sin(a) * WHEEL_R;
    const lit = Math.sin(a) < 0.2;
    capsule(CX + Math.cos(a) * (WHEEL_R - 4), WHEEL_CY + Math.sin(a) * (WHEEL_R - 4), x, y, 1.5, lit ? WATER_LIT : BRONZE, 1);
    // water sitting in the scoop near the bottom
    if (Math.sin(a) > 0.3) ellipse(x, y, 1.6, 1.0, WATER, 0.7, 0, true);
  }
  // hub
  ellipse(CX, WHEEL_CY, 2.6, 2.6, BRONZE, 1, 0.5);
  // falling water from the trough above into the top scoop, with a splash flash on the trip
  const streamX = CX + Math.cos(esc.tickAngle - Math.PI / 2) * (WHEEL_R - 2);
  capsule(streamX, WHEEL_CY - WHEEL_R - 10, streamX, WHEEL_CY - WHEEL_R + 2, 0.7, WATER_LIT, 0.6);
  for (let d = 0; d < 3; d++) {
    const t = (now * 9 + d * 0.33) % 1;
    ellipse(streamX + 0.6 * Math.sin(t * 9), WHEEL_CY - WHEEL_R - 10 + t * 11, 0.5, 0.9, WATER_LIT, (1 - t) * 0.8, 0, true);
  }
  if (esc.tripping) ellipse(streamX, WHEEL_CY - WHEEL_R, 2.4, 1.4, FOAM, 0.5, 0, true);
  // base pool, gently lapping
  rect(2, WHEEL_CY + WHEEL_R + 2, 62, 190, WATER, 0.5);
  for (let x = 2; x < 62; x += 3) {
    const wy = WHEEL_CY + WHEEL_R + 2 + 0.6 * Math.sin(x * 0.5 + now * 2);
    rect(x, wy, x + 2, wy + 0.8, WATER_LIT, 0.35);
  }
}

// --------------------------------------------------------------- hour show
function drawBellDrum(x, y, isDrum, strike) {
  if (isDrum) {
    ellipse(x, y, 4.2, 3.2, hx('#5a2a14'), 1, 0.4);
    ellipse(x, y - 1.2, 3.6, 1.1, hx('#d8b878'), 1, 0, false);
    if (strike > 0.7) ellipse(x, y - 1.2, 4.2, 1.6, [1, 1, 1], (strike - 0.7) * 2, 0, true);
  } else {
    rect(x - 2.6, y - 4, x + 2.6, y + 3, BRONZE, 1);
    ellipse(x, y - 4, 2.6, 1.3, BRONZE_LIT, 1, 0, false);
    if (strike > 0.7) ellipse(x, y, 3.6, 4.2, GOLD_HOT, (strike - 0.7) * 1.6, 0, true);
  }
}

// -------------------------------------------------------------- composite
let frames = 0, slowT = 0;
export default {
  name: 'Water Clock Tower',
  blurb: "Su Song's astronomical clock tower: puppets present carved placards each minute, drums and bells on the hour, a water wheel ticks the escapement always",
  layouts: ['hub-tall3'], look: 'smoke', fps: 60, brightness: 0.32, dither: true,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000;
    const night = ctx.night;
    img.set(BG);

    const curD = ctx.date, hour = curD.getHours(), minute = curD.getMinutes();
    const { h: curH, m: curM } = digitsOf(curD);
    const prevMinD = new Date(curD.getTime() - 60000);
    const { h: prevH, m: prevM } = digitsOf(prevMinD);
    const sec = kit.secOf(curD);
    const hourChanged = curH !== prevH;
    const minChanged = curM !== prevM;
    const minAge = sec;                      // seconds since the minute turned
    const hourAge = minute === 0 ? sec : 1e9; // seconds since the hour turned (only meaningful at minute 0)
    const isHourShow = minute === 0 && sec < 5.2;

    const esc = escapement(now);

    // roof: armillary sphere, always turning
    drawSphere(now);
    // middle: celestial globe, always turning
    drawGlobe(now);
    // base: waterwheel, always ticking (escapement never stops, even during the hour show)
    drawWheel(now, esc, night);

    // hour tier (two digits of the hour, as two door cells)
    if (isHourShow) {
      // both leaves open together, puppets process across presenting the new hour digits, drums & bells strike
      drawDoorTier(DOOR_TIER_Y0, 0, 32, +curH[0], +prevH[0], true, sec, ROBE[0], true);
      drawDoorTier(DOOR_TIER_Y0, 32, 32, +curH[1], +prevH[1], true, sec, ROBE[1], true);
      const strike = Math.max(0, Math.sin(sec * Math.PI * 2 * 1.6)) ** 6;
      drawBellDrum(5, DOOR_TIER_Y0 - 3, true, sec < 4.5 ? strike : 0);
      drawBellDrum(59, DOOR_TIER_Y0 - 3, false, sec < 4.5 ? strike : 0);
      // lanterns flare
      ellipse(4, DOOR_TIER_Y0 + 2, 3, 3, LANTERN, 0.5, 0, true);
      ellipse(60, DOOR_TIER_Y0 + 2, 3, 3, LANTERN, 0.5, 0, true);
    } else {
      // the hour tier only ever changes during the hour show above; otherwise settled
      drawDoorTier(DOOR_TIER_Y0, 0, 32, +curH[0], +prevH[0], false, 0, ROBE[0], false);
      drawDoorTier(DOOR_TIER_Y0, 32, 32, +curH[1], +prevH[1], false, 0, ROBE[1], false);
    }

    // minute tier: always the normal minute-turn choreography
    const tensChanged = Math.floor(+prevM / 10) !== Math.floor(+curM / 10);
    drawDoorTier(MIN_TIER_Y0, 0, 32, +curM[0], +prevM[0], tensChanged, minAge, ROBE[2], false);
    drawDoorTier(MIN_TIER_Y0, 32, 32, +curM[1], +prevM[1], minChanged, minAge, ROBE[3], false);

    // lantern glow at the pagoda corners, always on, brighter at night
    const lanternA = 0.18 + 0.22 * night;
    for (const x of [3, 61]) for (const y of [136, 180]) ellipse(x, y, 2.2, 2.2, LANTERN, lanternA, 0, true);

    // night dimming
    const dim = 1 - 0.45 * night;
    for (let i = 0; i < W * H * 3; i++) img[i] *= dim;
    ctx.out.set(img);
    frames++;
  },
};
