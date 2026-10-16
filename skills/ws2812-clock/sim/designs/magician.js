// The Great Horologini: a stage magician's act on a 128 x 64 stage, and the
// act IS the time. The hour is two playing cards (hearts) that the magician
// levitates above his gloved palm; the minutes are two spade cards held up
// by a lop-eared rabbit sitting in an upturned top hat. The numerals are
// Victorian fat-face poster type printed on the cards (magician-cards.js).
//
// Always alive: the cards float, sway and catch the light in 3D; the wand
// traces lazy loops trailing sparks; the rabbit twitches its nose and
// blinks; dust drifts in two crossing follow-spots; the curtains breathe.
// Minute: the magician taps the hat, the rabbit ducks into it taking the
// old card, the hat jiggles, the new card shoots out spinning and the
// rabbit pops back up ears-first to catch it. Hour: as well, the hour cards
// spin in the air while a fountain of cards springs from the rabbit's hat
// in an arc into the magician's own top hat, he lifts it and three doves
// burst out and fly off into the wings.
import * as kit from '../js/kit.js';
import { W, H, img, disc, ellipse, capsule, poly, glow, twinkle } from './magician-paint.js';
import { FACES, drawCard } from './magician-cards.js';

const C = (h, k = 1) => kit.scale(kit.hex(h), k);
const VELVET = C('#b0102a', 0.55), FRINGE = C('#e0a030', 0.5), WOOD = C('#5a2c12', 0.12), WOODL = C('#8a4a20', 0.2);
const SPOT = C('#ffe6b8', 1), GOLD = C('#ffd070', 1), DUST = C('#fff0d0', 1);
const COAT = [0.012, 0.012, 0.035], COATK = C('#5a5aa8', 0.5), TROU = [0.01, 0.01, 0.028];
const SHIRT = C('#f4ecdc', 0.5), GLOVE = C('#ffffff', 0.55), GLOVEK = C('#b8b8c8', 0.35);
const SKIN = C('#f0b890', 0.5), SKINK = C('#c07850', 0.3), HAIR = [0.012, 0.008, 0.008], BOW = C('#e01830', 0.55);
const HAT = [0.01, 0.01, 0.02], HATK = C('#6a6a90', 0.45), BAND = C('#c01028', 0.45), INSIDE = [0.003, 0.002, 0.006];
const FUR = C('#ffffff', 0.5), FURK = C('#c8b8c0', 0.32), PINK = C('#ff8aa8', 0.45), EYE = [0.004, 0.002, 0.006];
const WAND = [0.01, 0.01, 0.012], WANDK = C('#8080a0', 0.3), TIP = C('#ffffff', 0.6);
const DOVE = C('#ffffff', 0.6), DOVEK = C('#a8b8d0', 0.35);

const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (min) => { const d = new Date(min * 60000); return pad(d.getHours()) + pad(d.getMinutes()); };

// rest places
const MX = 63, FLOOR = 58;
const HAT_X = 100.5, BRIM = 49.6;
const SLOT_X = [19, 42, 87.5, 113.5], CARD_Y = [24, 24, 21.5, 21.5];
const io = kit.ease.inOut, out = kit.ease.out;
const seg01 = (u, a, b) => kit.clamp((u - a) / (b - a));

// --------------------------------------------------------------- stage
const beams = [ // two crossing follow-spots: source and target
  { sx: 128, sy: -36, tx: 34, ty: 58, w: 0.17 },
  { sx: 4, sy: -36, tx: 100, ty: 58, w: 0.15 },
];
for (const b of beams) { const L = Math.hypot(b.tx - b.sx, b.ty - b.sy); b.dx = (b.tx - b.sx) / L; b.dy = (b.ty - b.sy) / L; }
const TOP = new Float32Array(W); // valance bottom edge
for (let x = 0; x < W; x++) TOP[x] = 3.2 + 1.6 * Math.abs(Math.sin(((x + 8) * Math.PI) / 16));

function drawStage(t, n) {
  img.fill(0);
  for (let y = 0; y < H; y++) {
    const swayL = 0.5 * Math.sin(t * 0.5 + y * 0.06), swayR = 0.5 * Math.sin(t * 0.47 + 1 + y * 0.06);
    const yy = (y - 40) / 40, edgeL = 5.2 + 2.6 * yy * yy + swayL, edgeR = W - 1 - (5.2 + 2.6 * yy * yy) + swayR;
    for (let x = 0; x < W; x++) {
      const p = 3 * (y * W + x);
      let r = 0, g = 0, b = 0;
      // light beams: soft cones, a little brighter near the floor
      if (y < FLOOR) for (let k = 0; k < 2; k++) {
        const B = beams[k], rx = x - B.sx, ry = y - B.sy, along = rx * B.dx + ry * B.dy;
        const across = Math.abs(rx * B.dy - ry * B.dx) / (along * B.w);
        if (across < 1) { const f = (1 - across * across) * (0.010 + 0.006 * (y / H)); r += SPOT[0] * f; g += SPOT[1] * f; b += SPOT[2] * f; }
      } else {
        // boards, with the two pools of light
        const ln = (x * 3 + (y - FLOOR) * 7) % 23 === 0 ? 0.6 : 1, dy = y - FLOOR;
        const pool = Math.max(0, 1 - ((x - 34) / 26) ** 2 - ((dy - 1.5) / 4) ** 2) + Math.max(0, 1 - ((x - 100) / 22) ** 2 - ((dy - 1.5) / 4) ** 2);
        const k = (1 - dy * 0.1) * ln;
        r = WOOD[0] * k + WOODL[0] * pool; g = WOOD[1] * k + WOODL[1] * pool; b = WOOD[2] * k + WOODL[2] * pool;
      }
      // curtains: velvet folds, lit on their ridges
      const top = TOP[x] + 0.3 * Math.sin(t * 0.6 + x * 0.2);
      const inL = x < edgeL, inR = x > edgeR, inT = y < top;
      if (inL || inR || inT) {
        const u = inT && !inL && !inR ? x * 0.9 + Math.sin(t * 0.6) : inL ? x * 1.5 - y * 0.05 + swayL : x * 1.5 + y * 0.05 + swayR;
        const fold = 0.5 + 0.5 * Math.cos(u * 1.3);
        const edge = inT && !inL && !inR ? kit.clamp((top - y) / 1.2) : inL ? kit.clamp(edgeL - x) : kit.clamp(x - edgeR);
        let f = (0.18 + 0.82 * fold * fold) * (0.35 + 0.65 * (inT ? 1 : y / H * 0.7 + 0.3));
        r = r * (1 - edge) + VELVET[0] * f * edge; g = g * (1 - edge) + VELVET[1] * f * edge; b = b * (1 - edge) + VELVET[2] * f * edge;
        if (inT && !inL && !inR && top - y < 1) { const q = 1 - (top - y); r += FRINGE[0] * q; g += FRINGE[1] * q; b += FRINGE[2] * q; }
      }
      img[p] = r; img[p + 1] = g; img[p + 2] = b;
    }
  }
  // dust motes drifting in the beams
  for (let k = 0; k < 18; k++) {
    const B = beams[k & 1], s = kit.fract(kit.hash(k, 3) + t * (0.012 + 0.01 * kit.hash(k, 4)));
    const along = 45 + s * 55, side = (kit.hash(k, 5) - 0.5) * 1.6 * B.w * along + 2 * Math.sin(t * 0.7 + k);
    const x = B.sx + B.dx * along + B.dy * side, y = B.sy + B.dy * along - B.dx * side;
    if (y > 4 && y < FLOOR) glow(x, y, 1.3, DUST, 0.05 * (0.5 + 0.5 * Math.sin(t * 2 + k * 1.7)));
  }
  // footlights
  for (let k = 0; k < 8; k++) glow(8 + k * 16, 64.5, 4, GOLD, 0.07 + 0.012 * Math.sin(t * 7.3 + k * 2.1));
}

// ------------------------------------------------------------ magician
function ik(sx, sy, tx, ty, a, b, side) {
  let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy);
  const dm = Math.min(d, a + b - 0.01); dx /= d; dy /= d;
  const ang = Math.acos(kit.clamp((a * a + dm * dm - b * b) / (2 * a * dm), -1, 1)) * side;
  const c = Math.cos(ang), s = Math.sin(ang);
  return [sx + (dx * c - dy * s) * a, sy + (dx * s + dy * c) * a, sx + dx * dm, sy + dy * dm];
}
function glove(x, y, palmUp) {
  disc(x, y, 1.9, GLOVE, 1, GLOVEK, 0.6);
  if (palmUp) for (let f = -1; f <= 1; f++) capsule(x + f * 1.3, y - 0.8, x + f * 1.7, y - 2.9, 0.7, 0.6, GLOVE, 1);
}
const E = { lhx: 0, lhy: 0, rhx: 0, rhy: 0, wand: 0, hat: 0, blink: 0, brow: 0, bob: 0 };
function drawMagician(e) {
  const m = MX, b = e.bob;
  // legs and shoes
  capsule(m - 2.6, 44, m - 3.3, 56.3, 2.1, 1.8, TROU, 1, COATK, 0.7);
  capsule(m + 2.6, 44, m + 3.3, 56.3, 2.1, 1.8, TROU, 1, COATK, 0.7);
  ellipse(m - 4.6, 57.1, 2.8, 1.1, 0, HAT, 1, HATK, 0.6);
  ellipse(m + 4.6, 57.1, 2.8, 1.1, 0, HAT, 1, HATK, 0.6);
  // tails and coat
  poly([m - 6.5, 38, m - 2, 40, m - 4.6, 52.5, m - 9.8, 51], COAT, 1, COATK, 0.8);
  poly([m + 2, 40, m + 6.5, 38, m + 9.8, 51, m + 4.6, 52.5], COAT, 1, COATK, 0.8);
  poly([m - 8.4, 26.3 + b, m + 8.4, 26.3 + b, m + 6.4, 44.5, m - 6.4, 44.5], COAT, 1, COATK, 0.8);
  // shirt front, studs, lapels, bow tie
  poly([m - 3.4, 25.6 + b, m + 3.4, 25.6 + b, m, 38.5], SHIRT, 1);
  disc(m, 31, 0.45, HAIR); disc(m, 34, 0.45, HAIR);
  poly([m - 3.4, 25.6 + b, m - 4.8, 26.5 + b, m - 0.6, 38.4], COATK, 0.7);
  poly([m + 3.4, 25.6 + b, m + 4.8, 26.5 + b, m + 0.6, 38.4], COATK, 0.7);
  poly([m, 26.8 + b, m - 3.1, 25.2 + b, m - 3.1, 28.4 + b], BOW); poly([m, 26.8 + b, m + 3.1, 25.2 + b, m + 3.1, 28.4 + b], BOW);
  disc(m, 26.8 + b, 0.8, C('#ff4050', 0.6));
  // head: face, ears, slick hair, eyes, brows, handlebar moustache, goatee
  const hb = b * 0.6;
  disc(m - 4.7, 19.8 + hb, 1.1, SKIN); disc(m + 4.7, 19.8 + hb, 1.1, SKIN);
  ellipse(m, 19.6 + hb, 4.6, 5.5, 0, SKIN, 1, SKINK, 0.7);
  ellipse(m, 15.4 + hb, 4.9, 1.7, 0, HAIR);
  const eo = 1 - e.blink;
  if (eo > 0.15) { ellipse(m - 1.9, 18.9 + hb, 0.85, 1.05 * eo, 0, EYE); ellipse(m + 1.9, 18.9 + hb, 0.85, 1.05 * eo, 0, EYE); }
  else { capsule(m - 2.7, 19 + hb, m - 1.1, 19 + hb, 0.35, 0.35, EYE); capsule(m + 1.1, 19 + hb, m + 2.7, 19 + hb, 0.35, 0.35, EYE); }
  const br = 16.9 + hb - e.brow;
  capsule(m - 3.2, br + 0.7, m - 0.9, br, 0.45, 0.4, HAIR); capsule(m + 0.9, br, m + 3.2, br + 0.7, 0.4, 0.45, HAIR);
  capsule(m - 0.2, 22.1 + hb, m - 3.4, 21.6 + hb, 0.95, 0.55, HAIR); disc(m - 3.9, 20.9 + hb, 0.6, HAIR);
  capsule(m + 0.2, 22.1 + hb, m + 3.4, 21.6 + hb, 0.95, 0.55, HAIR); disc(m + 3.9, 20.9 + hb, 0.6, HAIR);
  ellipse(m, 24.7 + hb, 0.9, 1.4, 0, HAIR);
  // top hat (it can be lifted)
  const hy = hb - e.hat;
  poly([m - 5.2, 14.4 + hy, m + 5.2, 14.4 + hy, m + 5.8, 2.6 + hy, m - 5.8, 2.6 + hy], HAT, 1, HATK, 0.8);
  poly([m - 5.3, 13.3 + hy, m + 5.3, 13.3 + hy, m + 5.45, 11.4 + hy, m - 5.45, 11.4 + hy], BAND);
  ellipse(m, 14.6 + hy, 8, 1.35, 0, HAT, 1, HATK, 0.8);
  // left arm (palm up under the hour cards) and right arm (wand)
  const [ex, ey, hx, hy2] = ik(m - 7.4, 27.8 + b, e.lhx, e.lhy, 13.6, 13.6, -1);
  capsule(m - 7.4, 27.8 + b, ex, ey, 2.2, 1.9, COAT, 1, COATK, 0.8);
  capsule(ex, ey, hx, hy2, 1.9, 1.5, COAT, 1, COATK, 0.8);
  disc(hx + 0.4, hy2 + 0.2, 1.5, SHIRT);
  glove(hx, hy2 - 0.6, true);
  const [fx, fy, gx, gy] = ik(m + 7.4, 27.8 + b, e.rhx, e.rhy, 7.5, 7.5, -1);
  capsule(m + 7.4, 27.8 + b, fx, fy, 2.2, 1.9, COAT, 1, COATK, 0.8);
  capsule(fx, fy, gx, gy, 1.9, 1.5, COAT, 1, COATK, 0.8);
  const wx = gx + Math.cos(e.wand) * 12, wy = gy + Math.sin(e.wand) * 12;
  capsule(gx - Math.cos(e.wand) * 1.5, gy - Math.sin(e.wand) * 1.5, wx, wy, 0.75, 0.65, WAND, 1, WANDK, 0.5);
  capsule(gx + Math.cos(e.wand) * 9.8, gy + Math.sin(e.wand) * 9.8, wx, wy, 0.75, 0.7, TIP);
  glove(gx, gy, false);
  return [wx, wy];
}

// --------------------------------------------------------------- rabbit
function drawRabbitBack() { ellipse(HAT_X, BRIM, 8.3, 1.9, 0, INSIDE, 1, HATK, 0.6); }
function rabbitHead(hy, blink, look, perk, nose) {
  const x = HAT_X;
  ellipse(x, hy + 8, 5.6, 5.2, 0, FUR, 1, FURK, 0.7);
  // lop ears hang by the cheeks; they perk up when it pops out of the hat
  for (const s of [-1, 1]) {
    const bx = x + s * 3.4, by = hy - 3, a = (1 - perk) * (Math.PI / 2 + s * 1.15) + perk * (-Math.PI / 2 + s * 0.22);
    const tx = bx + Math.cos(a) * 9.5, ty = by + Math.sin(a) * 9.5;
    capsule(bx, by, tx, ty, 1.7, 1.5, FUR, 1, FURK, 0.7);
    capsule(bx + (tx - bx) * 0.2, by + (ty - by) * 0.2, bx + (tx - bx) * 0.85, by + (ty - by) * 0.85, 0.6, 0.5, PINK);
  }
  ellipse(x, hy, 6.2, 5.2, 0, FUR, 1, FURK, 0.7);
  glow(x - 4, hy + 1.8, 1.8, PINK, 0.12); glow(x + 4, hy + 1.8, 1.8, PINK, 0.12);
  const eo = 1 - blink;
  for (const s of [-1, 1]) {
    if (eo > 0.2) {
      ellipse(x + s * 2.5 + look, hy - 0.6, 1.35, 1.7 * eo, 0, EYE);
      disc(x + s * 2.5 + look - 0.5, hy - 1.2, 0.5, TIP, eo);
    } else capsule(x + s * 2.5 - 1.2, hy - 0.4, x + s * 2.5 + 1.2, hy - 0.4, 0.35, 0.35, EYE);
  }
  ellipse(x, hy + 1.9 + nose * 0.25, 1.1, 0.75, 0, PINK);
  capsule(x - 0.45, hy + 2.8, x - 0.45, hy + 3.9, 0.45, 0.45, TIP, 0.8);
  capsule(x + 0.45, hy + 2.8, x + 0.45, hy + 3.9, 0.45, 0.45, TIP, 0.8);
}
function drawHatFront(sq) {
  const x = HAT_X, w = 7.1 * (1 + sq), w2 = 6.3 * (1 + sq), top = BRIM + 0.3 - sq * 6;
  poly([x - w, top, x + w, top, x + w2, 57.9, x - w2, 57.9], HAT, 1, HATK, 0.8);
  poly([x - w + 0.2, top + 1.2, x + w - 0.2, top + 1.2, x + w - 0.35, top + 2.8, x - w + 0.35, top + 2.8], BAND);
  capsule(x - 8.3 * (1 + sq), top, x + 8.3 * (1 + sq), top, 0.8, 0.8, HAT, 1, HATK, 0.5);
}

// ----------------------------------------------------------------- dove
function dove(x, y, dir, ph, a) {
  const f = Math.sin(ph), s = dir;
  poly([x - 1, y, x + 1, y, x - s * 1 + 0.5 * s, y - 5 * f - 1.2, x - s * 3.5, y - 4.5 * f], DOVE, a, DOVEK, 0.5);
  ellipse(x, y, 3.2, 1.5, 0, DOVE, a, DOVEK, 0.5);
  poly([x - s * 2.6, y, x - s * 5.2, y - 1.2, x - s * 5.2, y + 1.2], DOVE, a);
  disc(x + s * 3.1, y - 0.9, 1.25, DOVE, a);
  disc(x + s * 3.5, y - 1.1, 0.35, EYE, a);
  poly([x - 0.6, y, x + 0.6, y, x + s * 0.5, y + 4.5 * f + 0.5, x - s * 2.5, y + 4 * f], DOVE, a, DOVEK, 0.5);
}

// ----------------------------------------------------------------- frame
function cardBrightness(i) { return i < 2 ? 1 : 0.96; }

export default {
  name: 'The Great Horologini',
  blurb: 'a magic act: the magician levitates the hour cards, a rabbit in a hat holds up the minutes and swaps them through the hat',
  layouts: ['hub-x2'], look: 'smoke', fps: 60, brightness: 0.35,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, mNow = Math.floor(now / 60), sec = now - mNow * 60;
    const PRE = 1.2;
    const B = sec >= 60 - PRE ? mNow + 1 : mNow, u = sec >= 60 - PRE ? sec - 60 : sec;
    const oldD = digitsAt(B - 1), newD = digitsAt(B);
    const ch = [0, 1, 2, 3].map((i) => oldD[i] !== newD[i]);
    const hour = ch[0] || ch[1];
    const shown = u < 0 ? oldD : newD;
    const T = now; // all motion is driven by the wall clock

    drawStage(T, ctx.night);

    // --- the magician's pose
    const tap = seg01(u, -1.1, -0.75), back = seg01(u, -0.2, 1.4);
    const tapA = tap * (1 - io(back)); // 0..1, how far the wand is down on the hat
    const lift = hour ? Math.sin(Math.PI * seg01(u, -1.0, 2.6)) : 0;
    const idle = 1 - tapA;
    E.bob = 0.35 * Math.sin(T * 1.6);
    E.lhx = 36 + 1.2 * Math.sin(T * 0.8);
    E.lhy = 45 + 0.9 * Math.sin(T * 1.1) - 6 * lift;
    E.rhx = kit.lerp(75 + 0.8 * Math.sin(T * 1.3), 77, tapA);
    E.rhy = kit.lerp(37 + 0.8 * Math.cos(T * 1.3), 36, tapA) - 4 * lift;
    E.wand = kit.lerp(0.55 + 0.35 * Math.sin(T * 1.9) * idle, 0.62, tapA) - 1.3 * lift;
    E.hat = hour ? 3.5 * Math.sin(Math.PI * seg01(u, 1.75, 3.3)) ** 0.6 : 0;
    const bk = kit.fract(T / 3.9 + 0.3);
    E.blink = bk < 0.04 ? Math.sin((bk / 0.04) * Math.PI) : 0;
    E.brow = 0.7 * (tapA + lift);
    const [wx, wy] = drawMagician(E);

    // --- hour cards, levitating above the palm
    const hourSpin = hour ? io(seg01(u, -0.9, 0.9)) : 0;
    for (let i = 0; i < 2; i++) {
      const ph = i * 1.9;
      const cx = SLOT_X[i] + (E.lhx - 36) * 0.6 + 0.8 * Math.sin(T * 0.7 + ph);
      const cy = CARD_Y[i] + (E.lhy - 45 + 6 * lift) * 0.5 + 1.1 * Math.sin(T * 1.25 + ph) - 3 * lift;
      let yaw = 0.32 * Math.sin(T * 0.55 + ph);
      if (ch[i]) yaw += 6 * Math.PI * hourSpin;
      else if (hour) yaw += 2 * Math.PI * hourSpin;
      drawCard(img, W, H, FACES[0][+shown[i]], cx, cy, 0.06 * Math.sin(T * 0.9 + ph), yaw, 1, cardBrightness(i));
    }
    // levitation sparks rising from the palm
    for (let k = 0; k < 7; k++) {
      const s = kit.fract(T * 0.45 + k / 7), x = E.lhx + (k - 3) * 3.4 + 1.2 * Math.sin(T * 2 + k), y = E.lhy - 3 - s * 9;
      glow(x, y, 1.2, GOLD, 0.16 * Math.sin(Math.PI * s));
    }

    // --- rabbit, minute cards, hat
    const dive = seg01(u, -0.75, -0.1), pop = seg01(u, 0.85, 1.45);
    const anyMin = ch[2] || ch[3];
    const down = anyMin ? (u < 0.5 ? io(dive) : 1 - kit.ease.outBack(pop)) : 0;
    const perk = anyMin ? Math.max(0, Math.sin(Math.PI * seg01(u, 0.9, 2.6))) : 0;
    const rhy = 43 + 0.35 * Math.sin(T * 1.4 + 1) + 13 * down;
    const rbk = kit.fract(T / 4.7);
    const rblink = rbk < 0.035 ? Math.sin((rbk / 0.035) * Math.PI) : 0;
    const look = 0.5 * Math.sin(T * 0.31) + (anyMin ? -0.6 * Math.sin(Math.PI * seg01(u, -1.2, -0.7)) : 0);
    const nose = Math.sin(T * 18) * (kit.fract(T / 2.3) < 0.35 ? 1 : 0);
    const squash = anyMin ? 0.06 * Math.sin(seg01(u, -0.1, 0.6) * Math.PI * 3) * (1 - seg01(u, -0.1, 0.6)) : 0;
    drawRabbitBack();
    rabbitHead(rhy, rblink, look, perk, nose);

    const paws = [];
    for (let i = 2; i < 4; i++) {
      const ph = i * 1.3, side = i === 2 ? -1 : 1;
      let cx = SLOT_X[i] + 0.5 * Math.sin(T * 0.6 + ph), cy = CARD_Y[i] + 0.35 * Math.sin(T * 1.4 + 1) + 0.6 * Math.sin(T * 0.9 + ph);
      let yaw = 0.25 * Math.sin(T * 0.5 + ph), ang = side * 0.05 + 0.03 * Math.sin(T * 0.8 + ph), k = 1, al = 1;
      const held = !ch[i] || u < -0.75 || u > 1.3;
      if (ch[i]) {
        const st = i === 2 ? 0.12 : 0; // the tens card goes a beat later
        const a = seg01(u, -0.75 + st, -0.12 + st), bb = seg01(u, 0.15 + st, 1.25 + st);
        if (u < 0.05 && a > 0) { // into the hat
          const e = io(a);
          cx = kit.lerp(cx, HAT_X, e); cy = kit.lerp(cy, BRIM + 4, e) - 7 * Math.sin(Math.PI * e);
          k = kit.lerp(1, 0.28, e); yaw += Math.PI * e; ang += side * 0.8 * e; al = 1 - seg01(a, 0.85, 1);
        } else if (u >= 0.05 && bb < 1) { // out of the hat
          if (bb <= 0) al = 0;
          const e = out(bb), arc = Math.sin(Math.PI * Math.min(1, bb * 1.15));
          cx = kit.lerp(HAT_X, cx, e); cy = kit.lerp(BRIM + 4, cy, kit.ease.outBack(bb)) - 9 * arc;
          k = kit.lerp(0.28, 1, kit.ease.outBack(bb)); yaw += -4 * Math.PI * (1 - e); ang += side * 0.6 * (1 - e);
        } else if (u >= -0.75 && u < 0.05) al = 0;
      }
      if (al > 0) drawCard(img, W, H, FACES[1][+shown[i]], cx, cy, ang, yaw, k, cardBrightness(i), al);
      if (held) paws.push([HAT_X + side * 3.5, rhy + 4.5, cx - side * 9.5, cy + 14.5]);
    }
    for (const [ax, ay, bx, by] of paws) if (down < 0.3) capsule(ax, ay, bx, by, 1.4, 1.2, FUR, 1, FURK, 0.6);
    drawHatFront(squash);

    // --- wand sparks: a trail behind the tip
    for (let k = 0; k < 9; k++) {
      const tk = T - k * 0.05, s = kit.hash(Math.floor(tk * 20), 7);
      glow(wx + (s - 0.5) * 2 + k * 0.25, wy + kit.hash(Math.floor(tk * 20), 8) * 2 + k * 0.4, 1.3, GOLD, 0.22 * (1 - k / 9) ** 2);
    }
    twinkle(wx, wy, 2 + 1.2 * Math.sin(T * 5), TIP, 0.25);
    if (anyMin) { // the tap: a starburst on the hat, then the puff when the new card comes out
      const b1 = seg01(u, -0.8, -0.3), b2 = seg01(u, 0.0, 0.8);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * kit.TAU + 0.3;
        if (b1 > 0 && b1 < 1) twinkle(HAT_X - 6 + Math.cos(a) * 7 * out(b1), BRIM - 2 + Math.sin(a) * 5 * out(b1), 1.5, GOLD, 0.5 * (1 - b1));
        if (b2 > 0 && b2 < 1) glow(HAT_X + Math.cos(a) * 11 * out(b2), BRIM - 3 + Math.sin(a) * 6 * out(b2) - 4 * b2, 2.4, DUST, 0.12 * (1 - b2));
      }
    }

    // --- the hour: a fountain of cards into his hat, then the doves
    if (hour && u > 0 && u < 4.5) {
      for (let j = 0; j < 22; j++) {
        const s = seg01(u, 0.1 + j * 0.05, 0.95 + j * 0.05);
        if (s <= 0 || s >= 1) continue;
        const x = kit.lerp(HAT_X, MX, s), y = kit.lerp(BRIM, 4 - E.hat, s) - 100 * s * (1 - s);
        drawCard(img, W, H, FACES[1][0], x, y, s * 7 + j, Math.PI + s * 9, 0.36 * (1 - 0.4 * s), 0.9);
      }
      for (let k = 0; k < 3; k++) {
        const s = seg01(u, 2.0 + k * 0.18, 3.7 + k * 0.18);
        if (s <= 0 || s >= 1) continue;
        const dir = k === 1 ? 1 : -1, e = kit.ease.in(s) * 0.6 + s * 0.4;
        const x = MX + dir * (8 + 80 * e) + (k === 2 ? -6 * e : 0), y = 12 - E.hat - 8 * Math.sin(Math.PI * s) + (k === 2 ? 14 * e : 0);
        dove(x, y, dir, T * 22 + k, Math.min(1, s * 6));
      }
      const b3 = seg01(u, 1.9, 2.8);
      if (b3 > 0 && b3 < 1) for (let k = 0; k < 12; k++) {
        const a = (k / 12) * kit.TAU;
        twinkle(MX + Math.cos(a) * 14 * out(b3), 10 - E.hat + Math.sin(a) * 7 * out(b3), 1.8, GOLD, 0.6 * (1 - b3));
      }
    }

    kit.blitGrid(ctx, img, 1 - 0.6 * ctx.night);
  },
};
