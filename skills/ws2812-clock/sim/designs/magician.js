// The Great Horologini: a stage magician's act on a 128 x 64 stage, and the
// act IS the time. He levitates one giant playing card: its value is the
// hour. Beside him his assistant lies in the cabinet he has already sawn in
// half; the two red-lacquer halves are the minute digits, gold fat-face
// numerals on their fronts, her head poking out of one end and her shoes out
// of the other, the saw still standing in the cut.
//
// Always alive: the card floats and turns in 3D catching the light, the wand
// traces loops trailing sparks, she looks about, blinks and wiggles her
// toes, dust drifts in two follow-spots, the curtains breathe.
// Minute: the saw flies up, he points the wand, the half slides out and
// spins round on the table (her feet go round with it), coming back with the
// new digit; the saw drops back in with a chunk and a puff of stars.
// Hour: the card spins up and turns into the new hour while a spring of
// fifty cards arcs over his head from hand to hand, then he raises his top
// hat and three doves burst out and fly into the wings.
import * as kit from '../js/kit.js';
import { W, H, img, disc, ellipse, capsule, poly, glow, twinkle } from './magician-paint.js';
import { HOUR_CARDS, drawCard, drawPanel, BOX_FACES, BOX_BACK, BOX_SIDE, BOX_W, BOX_H } from './magician-cards.js';

const C = (h, k = 1) => kit.scale(kit.hex(h), k);
const VELVET = C('#b0102a', 0.5), FRINGE = C('#e0a030', 0.45), WOOD = C('#5a2c12', 0.1), WOODL = C('#8a4a20', 0.2);
const SPOT = C('#ffe6b8', 1), GOLD = C('#ffd070', 1), DUST = C('#fff0d0', 1), GILT = C('#e0a830', 0.5);
const COAT = [0.008, 0.008, 0.03], COATK = C('#7a7ad0', 0.55), TROU = [0.01, 0.01, 0.028];
const SHIRT = C('#f4ecdc', 0.5), GLOVE = C('#ffffff', 0.55), GLOVEK = C('#b8b8c8', 0.35);
const SKIN = C('#f0b890', 0.5), SKINK = C('#c07850', 0.3), HAIR = [0.012, 0.008, 0.008], BOW = C('#e01830', 0.55);
const HAT = [0.01, 0.01, 0.02], HATK = C('#6a6a90', 0.45), BAND = C('#c01028', 0.45);
const EYE = [0.004, 0.002, 0.006], WAND = [0.01, 0.01, 0.012], WANDK = C('#8080a0', 0.3), TIP = C('#ffffff', 0.6);
const LOCKS = C('#d0601c', 0.42), LOCKSK = C('#ff9a40', 0.4), LIPS = C('#ff2040', 0.6), TIARA = C('#ffe080', 0.8);
const STOCK = C('#ffd8c8', 0.3), SHOE = C('#ff1838', 0.55), SHOEK = C('#ff90a0', 0.45);
const LID = C('#c01830', 0.5), LIDK = C('#ffb040', 0.5), INNER = [0.006, 0.001, 0.002];
const STEEL = C('#c8d0e0', 0.42), STEELK = C('#ffffff', 0.7), HANDLE = C('#b06a2a', 0.42);
const DOVE = C('#ffffff', 0.6), DOVEK = C('#a8b8d0', 0.35);

const pad = (n) => String(n).padStart(2, '0');
const digitsAt = (min) => { const d = new Date(min * 60000); return pad(d.getHours()) + pad(d.getMinutes()); };
const io = kit.ease.inOut, out = kit.ease.out;
const seg01 = (u, a, b) => kit.clamp((u - a) / (b - a));

// rest places
const MX = 37, FLOOR = 58;
const CARD_X = 17, CARD_Y = 24;
const BOX_TOP = 21, GAP_X = 91, HALF_X = [GAP_X - 1 - BOX_W / 2, GAP_X + 1 + BOX_W / 2], DEPTH = 10;
const TABLE_Y = BOX_TOP + BOX_H;
const TAU_M = [0.12, -0.12]; // when each half's digit swaps (tens, units), seconds from the minute
const PRE = 1.8;

// --------------------------------------------------------------- stage
const beams = [ // two follow-spots: on the card, and on the cabinet
  { sx: 100, sy: -40, tx: 24, ty: 58, w: 0.22 },
  { sx: 30, sy: -40, tx: 88, ty: 58, w: 0.22 },
];
for (const b of beams) { const L = Math.hypot(b.tx - b.sx, b.ty - b.sy); b.dx = (b.tx - b.sx) / L; b.dy = (b.ty - b.sy) / L; }
const TOP = new Float32Array(W); // valance bottom edge
for (let x = 0; x < W; x++) TOP[x] = 2.6 + 1.5 * Math.abs(Math.sin(((x + 8) * Math.PI) / 16));

function drawStage(t) {
  img.fill(0);
  for (let y = 0; y < H; y++) {
    const swayL = 0.45 * Math.sin(t * 0.5 + y * 0.06), swayR = 0.45 * Math.sin(t * 0.47 + 1 + y * 0.06);
    const yy = (y - 40) / 40, edgeL = 3.6 + 2.4 * yy * yy + swayL, edgeR = W - 1 - (3.6 + 2.4 * yy * yy) + swayR;
    for (let x = 0; x < W; x++) {
      const p = 3 * (y * W + x);
      let r = 0, g = 0, b = 0;
      if (y < FLOOR) {
        for (let k = 0; k < 2; k++) {
          const B = beams[k], rx = x - B.sx, ry = y - B.sy, along = rx * B.dx + ry * B.dy;
          const across = Math.abs(rx * B.dy - ry * B.dx) / (along * B.w);
          if (across < 1) { const f = (1 - across * across) * (0.006 + 0.007 * (y / H)); r += SPOT[0] * f; g += SPOT[1] * f; b += SPOT[2] * f; }
        }
      } else {
        const dy = y - FLOOR, ln = (x + dy * 11) % 19 === 0 ? 0.55 : 1;
        const pool = Math.max(0, 1 - ((x - 26) / 24) ** 2 - ((dy - 1.5) / 4) ** 2) + Math.max(0, 1 - ((x - 88) / 28) ** 2 - ((dy - 1.5) / 4) ** 2);
        const k = (1 - dy * 0.1) * ln;
        r = WOOD[0] * k + WOODL[0] * pool * ln; g = WOOD[1] * k + WOODL[1] * pool * ln; b = WOOD[2] * k + WOODL[2] * pool * ln;
      }
      const top = TOP[x] + 0.3 * Math.sin(t * 0.6 + x * 0.2);
      const inL = x < edgeL, inR = x > edgeR, inT = y < top;
      if (inL || inR || inT) {
        const val = inT && !inL && !inR;
        const u = val ? x * 0.9 + Math.sin(t * 0.6) : inL ? x * 1.6 + swayL : x * 1.6 + swayR;
        const fold = 0.5 + 0.5 * Math.cos(u * 1.3);
        const edge = val ? kit.clamp((top - y) / 1.2) : inL ? kit.clamp(edgeL - x) : kit.clamp(x - edgeR);
        const f = (0.15 + 0.85 * fold * fold) * (val ? 1 : 0.4 + 0.6 * (y / H));
        r = r * (1 - edge) + VELVET[0] * f * edge; g = g * (1 - edge) + VELVET[1] * f * edge; b = b * (1 - edge) + VELVET[2] * f * edge;
        if (val && top - y < 1) { const q = 1 - (top - y); r += FRINGE[0] * q; g += FRINGE[1] * q; b += FRINGE[2] * q; }
      }
      img[p] = r; img[p + 1] = g; img[p + 2] = b;
    }
  }
  for (let k = 0; k < 16; k++) { // dust motes drifting down the beams
    const B = beams[k & 1], s = kit.fract(kit.hash(k, 3) + t * (0.01 + 0.01 * kit.hash(k, 4)));
    const along = 48 + s * 50, side = (kit.hash(k, 5) - 0.5) * 1.5 * B.w * along + 2 * Math.sin(t * 0.7 + k);
    const x = B.sx + B.dx * along + B.dy * side, y = B.sy + B.dy * along - B.dx * side;
    if (y > 4 && y < FLOOR) glow(x, y, 1.3, DUST, 0.045 * (0.5 + 0.5 * Math.sin(t * 2 + k * 1.7)));
  }
  for (let k = 0; k < 8; k++) glow(8 + k * 16, 64.6, 4, GOLD, 0.06 + 0.01 * Math.sin(t * 7.3 + k * 2.1));
}

// ------------------------------------------------------------ magician
function ik(sx, sy, tx, ty, a, b, side) {
  let dx = tx - sx, dy = ty - sy;
  const d = Math.hypot(dx, dy), dm = Math.min(d, a + b - 0.01); dx /= d; dy /= d;
  const ang = Math.acos(kit.clamp((a * a + dm * dm - b * b) / (2 * a * dm), -1, 1)) * side;
  const c = Math.cos(ang), s = Math.sin(ang);
  return [sx + (dx * c - dy * s) * a, sy + (dx * s + dy * c) * a, sx + dx * dm, sy + dy * dm];
}
function glove(x, y, palmUp) {
  disc(x, y, 1.9, GLOVE, 1, GLOVEK, 0.6);
  if (palmUp) for (let f = -1; f <= 1; f++) capsule(x + f * 1.3, y - 0.8, x + f * 1.8, y - 3.1, 0.7, 0.6, GLOVE, 1);
}
const E = { lhx: 0, lhy: 0, rhx: 0, rhy: 0, wand: 0, hat: 0, blink: 0, brow: 0, bob: 0, look: 0 };
function drawMagician(e) {
  const m = MX, b = e.bob;
  capsule(m - 2.6, 44, m - 3.3, 56.3, 2.1, 1.8, TROU, 1, COATK, 0.7);
  capsule(m + 2.6, 44, m + 3.3, 56.3, 2.1, 1.8, TROU, 1, COATK, 0.7);
  ellipse(m - 4.6, 57.1, 2.8, 1.1, 0, HAT, 1, HATK, 0.6);
  ellipse(m + 4.6, 57.1, 2.8, 1.1, 0, HAT, 1, HATK, 0.6);
  poly([m - 6.5, 38, m - 2, 40, m - 4.6, 52.5, m - 9.8, 51], COAT, 1, COATK, 0.8);
  poly([m + 2, 40, m + 6.5, 38, m + 9.8, 51, m + 4.6, 52.5], COAT, 1, COATK, 0.8);
  poly([m - 8.4, 26.3 + b, m + 8.4, 26.3 + b, m + 6.4, 44.5, m - 6.4, 44.5], COAT, 1, COATK, 0.8);
  poly([m - 3.4, 25.6 + b, m + 3.4, 25.6 + b, m, 38.5], SHIRT, 1);
  disc(m, 31, 0.45, HAIR); disc(m, 34, 0.45, HAIR);
  poly([m - 3.4, 25.6 + b, m - 4.8, 26.5 + b, m - 0.6, 38.4], COATK, 0.7);
  poly([m + 3.4, 25.6 + b, m + 4.8, 26.5 + b, m + 0.6, 38.4], COATK, 0.7);
  poly([m, 26.8 + b, m - 3.1, 25.2 + b, m - 3.1, 28.4 + b], BOW); poly([m, 26.8 + b, m + 3.1, 25.2 + b, m + 3.1, 28.4 + b], BOW);
  disc(m, 26.8 + b, 0.8, C('#ff4050', 0.6));
  const hb = b * 0.6, hc = 20.6 + hb;
  // a big cartoon head: round face, white eyes, a grand handlebar moustache
  disc(m - 6.1, hc + 0.5, 1.3, SKIN, 1, SKINK, 0.5); disc(m + 6.1, hc + 0.5, 1.3, SKIN, 1, SKINK, 0.5);
  ellipse(m, hc, 5.9, 6.2, 0, SKIN, 1, SKINK, 0.6);
  for (const s of [-1, 1]) poly([m + s * 6.0, hc - 4.4, m + s * 6.3, hc + 0.5, m + s * 4.8, hc + 0.8, m + s * 4.6, hc - 4.6], HAIR); // sideburns
  const eo = 1 - e.blink, look = e.look;
  for (const s of [-1, 1]) {
    if (eo > 0.2) {
      ellipse(m + s * 2.3, hc - 1.0, 1.65, 1.9 * eo, 0, SHIRT, 1);
      disc(m + s * 2.3 + look, hc - 0.8, 0.95 * Math.min(1, eo * 1.4), EYE);
    } else capsule(m + s * 2.3 - 1.6, hc - 0.6, m + s * 2.3 + 1.6, hc - 0.6, 0.4, 0.4, EYE);
    const br = hc - 3.9 - e.brow;
    capsule(m + s * 3.9, br + 0.5 + e.brow * 0.4, m + s * 1.0, br - 0.2, 0.55, 0.5, HAIR);
    // moustache: a fat curl each side
    capsule(m + s * 0.3, hc + 2.6, m + s * 3.6, hc + 2.3, 1.2, 0.8, HAIR, 1, HATK, 0.4);
    capsule(m + s * 3.6, hc + 2.3, m + s * 4.6, hc + 0.9, 0.8, 0.55, HAIR, 1, HATK, 0.4);
  }
  disc(m, hc + 1.2, 0.9, C('#ff9070', 0.55)); // nose
  ellipse(m, hc + 5.0, 1.0, 1.4, 0, HAIR); // goatee
  const hy = hb - e.hat;
  poly([m - 5.2, 14.4 + hy, m + 5.2, 14.4 + hy, m + 5.8, 2.6 + hy, m - 5.8, 2.6 + hy], HAT, 1, HATK, 0.8);
  poly([m - 5.3, 13.3 + hy, m + 5.3, 13.3 + hy, m + 5.45, 11.4 + hy, m - 5.45, 11.4 + hy], BAND);
  ellipse(m, 14.6 + hy, 8, 1.35, 0, HAT, 1, HATK, 0.8);
  const [ex, ey, hx, hy2] = ik(m - 7.4, 27.8 + b, e.lhx, e.lhy, 12.5, 12.5, 1);
  capsule(m - 7.4, 27.8 + b, ex, ey, 2.2, 1.9, COAT, 1, COATK, 0.8);
  capsule(ex, ey, hx, hy2, 1.9, 1.5, COAT, 1, COATK, 0.8);
  disc(hx + 0.4, hy2 + 0.2, 1.5, SHIRT);
  glove(hx, hy2 - 0.6, true);
  const [fx, fy, gx, gy] = ik(m + 7.4, 27.8 + b, e.rhx, e.rhy, 7.5, 7.5, -1);
  capsule(m + 7.4, 27.8 + b, fx, fy, 2.2, 1.9, COAT, 1, COATK, 0.8);
  capsule(fx, fy, gx, gy, 1.9, 1.5, COAT, 1, COATK, 0.8);
  const ca = Math.cos(e.wand), sa = Math.sin(e.wand), wx = gx + ca * 12, wy = gy + sa * 12;
  capsule(gx - ca * 1.5, gy - sa * 1.5, wx, wy, 0.75, 0.65, WAND, 1, WANDK, 0.5);
  capsule(gx + ca * 9.8, gy + sa * 9.8, wx, wy, 0.75, 0.7, TIP);
  glove(gx, gy, false);
  return [wx, wy, hx, hy2 - 3];
}

// ------------------------------------------------------- the assistant
function herHead(x, y, blink, look, a) {
  for (let k = 0; k < 7; k++) { // a cloud of auburn curls
    const an = 2.6 + k * 0.62;
    disc(x + Math.cos(an) * 3.9, y + Math.sin(an) * 3.6 + 0.6, 2.1, LOCKS, a, LOCKSK, 0.6);
  }
  disc(x, y + 0.6, 3.5, SKIN, a, SKINK, 0.6);
  for (let k = 0; k < 4; k++) disc(x - 2.4 + k * 1.6, y - 2.6, 1.3, LOCKS, a);
  poly([x - 2.2, y - 3.6, x + 2.2, y - 3.6, x + 1.4, y - 5.0, x, y - 6.6, x - 1.4, y - 5.0], TIARA, a);
  glow(x, y - 5.6, 1.4, TIARA, 0.4 * a);
  const eo = 1 - blink;
  for (const s of [-1, 1]) {
    if (eo > 0.25) { ellipse(x + s * 1.35 + look, y + 0.1, 0.6, 0.85 * eo, 0, EYE, a); }
    else capsule(x + s * 1.35 - 0.7, y + 0.4, x + s * 1.35 + 0.7, y + 0.4, 0.3, 0.3, EYE, a);
    capsule(x + s * 2.2, y - 0.6, x + s * 1.9, y - 1.2, 0.25, 0.25, EYE, a); // lashes
  }
  glow(x - 2.3, y + 1.8, 1.3, LIPS, 0.15 * a); glow(x + 2.3, y + 1.8, 1.3, LIPS, 0.15 * a);
  ellipse(x + look * 0.4, y + 2.5, 1.0, 0.6, 0, LIPS, a);
}
function herFeet(x, y, w1, w2, dir, a) {
  for (let k = 0; k < 2; k++) {
    const bx = x, by = y + k * 3.4, wig = k ? w2 : w1;
    const ax = bx + dir * 3.6, ay = by;
    capsule(bx, by, ax, ay, 1.3, 1.15, STOCK, a);
    const an = -Math.PI / 2 + dir * (0.45 + wig);
    const tx = ax + Math.cos(an) * 4.4, ty = ay + Math.sin(an) * 4.4;
    capsule(ax - dir * 0.6, ay + 0.6, tx, ty, 1.5, 0.9, SHOE, a, SHOEK, 0.5);
    capsule(ax - dir * 0.9, ay + 0.6, ax - dir * 1.4, ay + 2.6, 0.45, 0.35, SHOE, a); // heel
  }
}

// ------------------------------------------------------------ the cabinet
const FACES4 = [ // local faces: start, end, normal (x, z)
  [-1, 1, 1, 1, 0, 1], [1, 1, 1, -1, 1, 0], [1, -1, -1, -1, 0, -1], [-1, -1, -1, 1, -1, 0],
];
/** One half of the sawn cabinet: centre cx, turned th, front/back textures, a lid. */
function drawHalf(cx, th, front, back, glint) {
  const c = Math.cos(th), s = Math.sin(th), hw = BOX_W / 2, hd = DEPTH / 2;
  const X = (px, pz) => cx + px * c + pz * s, Z = (px, pz) => -px * s + pz * c;
  // lid, seen from a little above
  const pts = [];
  for (const [px, pz] of [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]]) pts.push(X(px, pz), BOX_TOP - (hd - Z(px, pz)) * 0.28);
  poly(pts, LID, 1, LIDK, 0.6);
  for (let f = 0; f < 4; f++) {
    const F = FACES4[f], nz = -F[4] * s + F[5] * c;
    if (nz <= 0.02) continue;
    const px0 = F[0] * hw, pz0 = F[1] * hd, px1 = F[2] * hw, pz1 = F[3] * hd;
    const xa = X(px0, pz0), xb = X(px1, pz1);
    const tex = f === 0 ? front : f === 2 ? back : BOX_SIDE;
    drawPanel(img, W, H, tex, xa, xb, BOX_TOP, 0.45 + 0.55 * nz, glint * nz); // lit from the front
  }
}
function saw(y0, wob) {
  const x = GAP_X + wob;
  poly([x - 0.9, y0, x + 0.9, y0, x + 0.9, y0 + 30, x - 0.9, y0 + 32], STEEL, 1);
  for (let k = 0; k < 8; k++) disc(x + 1.1, y0 + 3 + k * 3.6, 0.45, STEELK, 0.5);
  capsule(x, y0 + 1, x, y0 + 30, 0.35, 0.35, STEELK, 0.35);
  poly([x - 3.4, y0 - 6, x + 3.4, y0 - 6, x + 3.4, y0 + 0.6, x - 3.4, y0 + 0.6], HANDLE, 1, C('#e09850', 0.4), 0.6);
  disc(x, y0 - 2.8, 1.3, INNER);
}

// ----------------------------------------------------------------- dove
function dove(x, y, dir, ph, a) {
  const f = Math.sin(ph), s = dir;
  poly([x - 1, y, x + 1, y, x - s * 0.5, y - 5 * f - 1.2, x - s * 3.5, y - 4.5 * f], DOVE, a, DOVEK, 0.5);
  ellipse(x, y, 3.2, 1.5, 0, DOVE, a, DOVEK, 0.5);
  poly([x - s * 2.6, y, x - s * 5.2, y - 1.2, x - s * 5.2, y + 1.2], DOVE, a);
  disc(x + s * 3.1, y - 0.9, 1.25, DOVE, a);
  disc(x + s * 3.5, y - 1.1, 0.35, EYE, a);
  poly([x - 0.6, y, x + 0.6, y, x + s * 0.5, y + 4.5 * f + 0.5, x - s * 2.5, y + 4 * f], DOVE, a, DOVEK, 0.5);
}

// --------------------------------------------------------------- frame
export default {
  name: 'The Great Horologini',
  blurb: 'a magic act: the levitated card is the hour, the two halves of the sawn lady\'s cabinet are the minutes',
  layouts: ['hub-x2'], look: 'smoke', fps: 60, brightness: 0.45, dither: true,
  frame(ctx) {
    const T = ctx.date.getTime() / 1000, mNow = Math.floor(T / 60), sec = T - mNow * 60;
    const B = sec >= 60 - PRE ? mNow + 1 : mNow, u = sec >= 60 - PRE ? sec - 60 : sec;
    const oldD = digitsAt(B - 1), newD = digitsAt(B);
    const hour = oldD[0] !== newD[0] || oldD[1] !== newD[1];
    const chM = [oldD[2] !== newD[2], oldD[3] !== newD[3]];

    drawStage(T);

    // --- the cabinet's act: per half, slide out, spin a full turn, slide back
    const halves = [0, 1].map((k) => {
      const side = k ? 1 : -1;
      let x = HALF_X[k], th = 0, front = BOX_FACES[+newD[2 + k]], back = BOX_BACK;
      if (chM[k]) {
        const tau = TAU_M[k], sl = io(seg01(u, tau - 1.2, tau - 0.8)) * (1 - io(seg01(u, tau + 0.8, tau + 1.2)));
        x += side * (k ? 5 : 3) * sl;
        th = kit.TAU * io(seg01(u, tau - 0.8, tau + 0.8));
        if (u < tau) front = BOX_FACES[+oldD[2 + k]];
      }
      return { x, th, front, back };
    });
    const anyM = chM[0] || chM[1];
    const t0 = Math.min(...[0, 1].filter((k) => chM[k]).map((k) => TAU_M[k]), 9);
    const t1 = Math.max(...[0, 1].filter((k) => chM[k]).map((k) => TAU_M[k]), -9);
    const sawUp = anyM ? io(seg01(u, t0 - 1.55, t0 - 1.15)) * (1 - kit.ease.in(seg01(u, t1 + 1.2, t1 + 1.5))) : 0;
    const thud = anyM ? seg01(u, t1 + 1.5, t1 + 2.3) : 0;

    // --- the magician's pose
    const lift = hour ? Math.sin(Math.PI * seg01(u, -1.2, 1.4)) : 0;
    let target = -1; // which half he is pointing at
    for (let k = 0; k < 2; k++) if (chM[k] && u > TAU_M[k] - 1.5 && u < TAU_M[k] + 1.2) target = k;
    const pointA = anyM ? Math.sin(Math.PI * seg01(u, t0 - 1.6, t1 + 1.4)) ** 0.5 : 0;
    const idle = 1 - pointA;
    E.bob = 0.35 * Math.sin(T * 1.6);
    E.lhx = 20 + 1.0 * Math.sin(T * 0.8);
    E.lhy = 46.5 + 0.8 * Math.sin(T * 1.1) - 4 * lift;
    E.rhx = 47 + 0.9 * Math.sin(T * 1.3) * idle + 2 * pointA;
    E.rhy = 33 + 0.9 * Math.cos(T * 1.3) * idle - 6 * pointA;
    const aimX = target >= 0 ? halves[target].x : HALF_X[0];
    const aim = Math.atan2(BOX_TOP + 8 - E.rhy, aimX - E.rhx);
    E.wand = kit.lerp(-1.75 + 0.4 * Math.sin(T * 1.9), aim, pointA);
    E.hat = hour ? 4 * Math.sin(Math.PI * seg01(u, 1.9, 3.9)) ** 0.5 : 0;
    const bk = kit.fract(T / 3.9 + 0.3);
    E.blink = bk < 0.04 ? Math.sin((bk / 0.04) * Math.PI) : 0;
    E.brow = 0.8 * Math.max(pointA, lift);
    E.look = kit.lerp(-0.45 * (0.5 + 0.5 * Math.sin(T * 0.33)), 0.6, pointA);

    // --- the hour card floats above his palm, turning slowly
    const hSpin = hour ? io(seg01(u, -0.8, 0.8)) : 0;
    const hc = HOUR_CARDS[+(u < 0 ? oldD : newD).slice(0, 2)];
    const cx = CARD_X + 0.9 * Math.sin(T * 0.7), cy = CARD_Y + 1.2 * Math.sin(T * 1.25) - 3 * lift;
    const yaw = 0.42 * Math.sin(T * 0.55) + kit.TAU * hSpin, tilt = 0.06 * Math.sin(T * 0.9);

    // --- table and cabinet
    for (const lx of [68, 114]) capsule(lx, TABLE_Y + 1, lx + (lx < 90 ? -1 : 1), FLOOR - 0.5, 0.9, 0.9, GILT);
    poly([58, TABLE_Y, 122, TABLE_Y, 120, TABLE_Y + 2.6, 60, TABLE_Y + 2.6], C('#401010', 0.25), 1, GILT, 0.8);
    // her, the halves, and what pokes out of them (behind or in front, as they turn)
    const lookAt = target >= 0 ? (target ? 0.6 : 0.3) : 0.5 * Math.sin(T * 0.37);
    const hbk = kit.fract(T / 4.4 + 0.6), hblink = hbk < 0.035 ? Math.sin((hbk / 0.035) * Math.PI) : 0;
    const excite = anyM ? Math.sin(Math.PI * thud) : 0;
    const w1 = 0.25 * Math.sin(T * 3.1) * (0.6 + 0.4 * Math.sin(T * 0.4)) + 0.5 * excite * Math.sin(T * 17);
    const w2 = 0.25 * Math.sin(T * 3.1 + 1.9) * (0.6 + 0.4 * Math.sin(T * 0.4 + 1)) + 0.5 * excite * Math.sin(T * 17 + 2);
    const pokes = [
      (h, k) => { const px = -BOX_W / 2 - 3.6, X = h.x + px * Math.cos(h.th); herHead(X, BOX_TOP + 9.5 + 0.3 * Math.sin(T * 1.7), hblink, lookAt, 1); },
      (h, k) => { const px = BOX_W / 2 - 0.5, X = h.x + px * Math.cos(h.th); herFeet(X, BOX_TOP + 8, w1, w2, Math.cos(h.th) >= 0 ? 1 : -1, 1); },
    ];
    for (let k = 0; k < 2; k++) {
      const h = halves[k];
      const zEnd = (k ? 1 : -1) * -(BOX_W / 2) * Math.sin(h.th);
      if (zEnd < 0) pokes[k](h, k);
      drawHalf(h.x, h.th, h.front, h.back, Math.max(0, Math.sin(h.th * 0.5)) * 1.5);
      if (zEnd >= 0) pokes[k](h, k);
    }
    // the gap between the halves is dark inside; the saw stands in it
    saw(BOX_TOP - 6 - 60 * sawUp + 0.6 * Math.sin(T * 2.3) * (1 - sawUp), 0.25 * Math.sin(T * 1.7));

    const [wx, wy, palmX, palmY] = drawMagician(E);
    // the hour's card spring arcs from hand to hand behind the hour card
    if (hour && u > -0.6 && u < 1.9) {
      for (let j = 0; j < 22; j++) { // from his palm in a long arc into the cabinet's cut
        const s = seg01(u, -0.5 + j * 0.06, 0.15 + j * 0.06);
        if (s <= 0 || s >= 1) continue;
        const x = kit.lerp(palmX, GAP_X, s), y = kit.lerp(palmY - 2, BOX_TOP - 1, s) - 104 * s * (1 - s) * (1 - 0.3 * s);
        drawCard(img, W, H, hc, x, y, -1.4 + 2.9 * s, Math.PI + 0.8 * Math.sin(s * 3 + j), 0.3, 0.95, Math.min(1, (1 - s) * 8));
      }
    }
    drawCard(img, W, H, hc, cx, cy, tilt, yaw, 1, 1);
    // levitation: sparks rising from the palm to the card
    for (let k = 0; k < 6; k++) {
      const s = kit.fract(T * 0.5 + k / 6), x = palmX + (k - 2.5) * 1.5 + 1.2 * Math.sin(T * 2 + k * 2), y = palmY - s * 6;
      glow(x, y, 1.1, GOLD, 0.22 * Math.sin(Math.PI * s));
    }
    // wand sparks: a short comet trail behind the tip
    for (let k = 1; k < 9; k++) {
      const tk = T - k * 0.045;
      const px = kit.hash(Math.floor(tk * 24), 7) - 0.5, py = kit.hash(Math.floor(tk * 24), 8);
      glow(wx + px * 2.4, wy + py * 1.5 + k * 0.5, 1.2, GOLD, 0.24 * (1 - k / 9) ** 2);
    }
    twinkle(wx, wy, 1.6 + 1.0 * Math.sin(T * 5), TIP, 0.22 + 0.25 * pointA);
    // a beam of sparks from the wand to the half being turned
    if (target >= 0 && pointA > 0.5) {
      const tx = halves[target].x, ty = BOX_TOP + 8;
      for (let k = 0; k < 8; k++) {
        const s = kit.fract(T * 1.6 + k / 8);
        glow(kit.lerp(wx, tx, s), kit.lerp(wy, ty, s) - 5 * Math.sin(Math.PI * s), 1.1, GOLD, 0.3 * Math.sin(Math.PI * s) * (pointA - 0.5) * 2);
      }
    }
    // the saw drops back in: a puff of stars at the cut
    if (thud > 0 && thud < 1) for (let k = 0; k < 10; k++) {
      const a = (k / 10) * kit.TAU + 0.4, r = 4 + 10 * out(thud);
      twinkle(GAP_X + Math.cos(a) * r, BOX_TOP - 1 + Math.sin(a) * r * 0.55, 1.6, GOLD, 0.55 * (1 - thud));
    }

    // --- the hour: a card spring over his head, then doves from the hat
    if (hour && u > -0.6 && u < 4.2) {
      for (let k = 0; k < 3; k++) {
        const s = seg01(u, 2.1 + k * 0.2, 4.0 + k * 0.2);
        if (s <= 0 || s >= 1) continue;
        const dir = k === 1 ? -1 : 1, e = kit.ease.in(s) * 0.55 + s * 0.45;
        const x = MX + dir * (4 + 96 * e), y = 9 - E.hat * 0.5 + (2 + 4 * k) * e - 2.5 * Math.sin(T * 7 + k);
        dove(x, y, dir, T * 21 + k * 2, Math.min(1, s * 8));
      }
      const b3 = seg01(u, 2.0, 2.9);
      if (b3 > 0 && b3 < 1) for (let k = 0; k < 12; k++) {
        const a = (k / 12) * kit.TAU;
        twinkle(MX + Math.cos(a) * 16 * out(b3), 9 - E.hat + Math.sin(a) * 8 * out(b3), 1.8, GOLD, 0.6 * (1 - b3));
      }
    }

    kit.blitGrid(ctx, img, 1 - 0.6 * ctx.night);
  },
};
