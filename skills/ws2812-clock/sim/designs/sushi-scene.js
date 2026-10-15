// The sushi bar around the time: noren, chef, hinoki counter, the kaiten
// belt with its plates, the frog customer at the end of the line, and the
// shinkansen that brings the hour's platter. All drawn into the shared
// raster with coverage, as pure functions of time.
import * as kit from '../js/kit.js';
import { W, img, ov, ad, blit, seg, disk, glow, sprite, clamp } from './sushi-gfx.js';

const hx = kit.hex;
const S = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// ---------------------------------------------------------------- palette
export const SALMON = hx('#ff6420'), SALMON_FAT = hx('#ffc9a6'), TUNA = hx('#d8112c');
export const RICE = S(hx('#fff4e2'), 0.62), NORI = [0.045, 0.13, 0.075];
export const CUKE = hx('#4fd23a'), TAMAGO = hx('#ffc21a'), IKURA = hx('#ff4a08');
const WOOD = S(hx('#e8b97a'), 0.42), WOOD_DK = S(hx('#9a5a24'), 0.32);

// ------------------------------------------------------------- belt items
const ITEM_PAL = {
  s: S(SALMON, 0.85), S: S(SALMON_FAT, 0.8), t: S(TUNA, 0.8), h: S(hx('#ff8a90'), 0.75),
  r: RICE, y: S(TAMAGO, 0.8), Y: S(hx('#fff0a0'), 0.7), n: NORI, N: [0.08, 0.2, 0.12],
  o: S(IKURA, 0.85), O: S(hx('#ffd0a0'), 0.9), c: S(TUNA, 0.85), g: S(CUKE, 0.7),
  e: S(hx('#ff5a30'), 0.8), E: S(hx('#fff0e0'), 0.6), T: S(hx('#ff3010'), 0.7),
};
const ITEMS = [
  ['..ssSsssSs..', '.sSsssSsssS.', 'sssSsssSssss', '.rrrrrrrrrr.', '..rrrrrrrr..'],
  ['..hhttttth..', '.httttttttt.', 'tttttttttttt', '.rrrrrrrrrr.', '..rrrrrrrr..'],
  ['yYYyynnyyyyy', 'yyyyynnyyyyy', 'yyyyynnyyyyy', '.rrrrnnrrrr.', '..rrrnnrrr..'],
  ['.oOooOooOoo.', 'ooOoooOoooOo', 'nnnnnnnnnnnn', 'nNnnnnnnnnNn', '.nnnnnnnnnn.'],
  ['.nnnn..nnnn.', 'nrrrrnnrrrrn', 'nrccrnnrggrn', 'nrrrrnnrrrrn', '.nnnn..nnnn.'],
  ['..eEeEeEeTT.', '.eEeEeEeEeTT', 'eEeEeEeEeEe.', '.rrrrrrrrr..', '..rrrrrrr...'],
].map((rows) => sprite(rows, ITEM_PAL));
const PLATE_COLS = ['#2f6bff', '#ff2a3a', '#ffb000', '#18c060', '#c040ff'].map((c) => hx(c));
const PLATES = PLATE_COLS.map((c) => sprite(['pPPPPPPPPPPPPPPp', '.pwwwwwwwwwwwwp.', '....ffffffff....'],
  { P: S(c, 0.6), p: S(c, 0.3), w: [0.2, 0.2, 0.19], f: [0.06, 0.06, 0.06] }));

// ------------------------------------------------------------------ belt
export const BELT_V = 14, PLATE_D = 28;      // px/s rightward, px between plates
const DECK = 57, PLATE_Y = 54;
export const GRAB_X = 226;                     // where the frog takes a plate
const GRAB_LEN = 2.6;

/** Belt slot k: empty? item, plate colour, grabbed by the frog? */
function slot(k) {
  const empty = kit.hash(k, 11) < 0.12;
  const grab = !empty && kit.hash(k, 13) < 0.34 && !(kit.hash(k - 1, 11) >= 0.12 && kit.hash(k - 1, 13) < 0.34);
  return { empty, grab, item: Math.floor(kit.hash(k, 17) * ITEMS.length), plate: Math.floor(kit.hash(k, 19) * PLATES.length) };
}

/** The grab in progress at time t (or null): { k, age, item, plate }. */
export function currentGrab(t) {
  const s = BELT_V * t;
  // plate k reaches GRAB_X when s - k * D = GRAB_X
  const kNow = Math.floor((s - GRAB_X) / PLATE_D);
  for (let k = kNow; k > kNow - 3; k--) {
    const sl = slot(k);
    if (!sl.grab) continue;
    const age = (s - k * PLATE_D - GRAB_X) / BELT_V;
    if (age >= 0 && age < GRAB_LEN) return { k, age, ...sl };
  }
  return null;
}

export function drawBelt(t, dim) {
  const s = BELT_V * t;
  // deck: crescent slats seen edge-on, sliding right
  for (let x = 0; x < W; x++) {
    const ph = (((x - s) % 8) + 8) % 8, dd = Math.min(ph, 8 - ph);
    const seam = clamp(1 - dd / 1.1);
    for (let y = DECK; y < DECK + 3; y++) {
      const base = y === DECK ? 0.26 : y === DECK + 1 ? 0.17 : 0.11;
      const k = base * (1 - 0.75 * seam);
      ov(x, y, k * 1.0, k * 0.9, k * 0.75, 1);
    }
    // stainless apron
    ov(x, 60, 0.2, 0.21, 0.23, 1);
    const sheen = 0.05 + 0.035 * Math.sin(x * 0.045 + 0.6);
    ov(x, 61, sheen, sheen, sheen * 1.1, 1);
    ov(x, 62, sheen * 0.8, sheen * 0.8, sheen * 0.9, 1);
    ov(x, 63, 0.035, 0.035, 0.04, 1);
  }
  const grab = currentGrab(t);
  const k0 = Math.ceil((s - W - 4) / PLATE_D), k1 = Math.floor((s + 18) / PLATE_D);
  for (let k = k0; k <= k1; k++) {
    const sl = slot(k);
    if (sl.empty) continue;
    if (grab && grab.k === k) continue;                 // in the frog's hands
    const age = (s - k * PLATE_D - GRAB_X) / BELT_V;
    if (sl.grab && age >= 0) continue;                  // already eaten
    const x = s - k * PLATE_D;                          // plate left edge
    blit(PLATES[sl.plate], x, PLATE_Y);
    const it = ITEMS[sl.item];
    blit(it, x + 2, PLATE_Y - it.h);
  }
  return grab;
}

/** The plate the frog is holding: lifted from the belt to its mouth, eaten. */
export function drawGrabbed(g) {
  if (!g) return;
  const a = g.age, x0 = GRAB_X, it = ITEMS[g.item];
  // lift (0-0.7), to the mouth (0.7-1.3), chomp (1.3), plate set down behind (1.3-2.2)
  const up = kit.ease.inOut(clamp(a / 0.7)), toM = kit.ease.inOut(clamp((a - 0.7) / 0.6));
  const px = x0 + 6 * up + 2 * toM, py = PLATE_Y - 9 * up - 4 * toM;
  if (a < 1.3) {
    blit(PLATES[g.plate], px, py);
    blit(it, px + 2 - 0, py - it.h);
  } else {
    const d = kit.ease.in(clamp((a - 1.3) / 0.9));
    blit(PLATES[g.plate], px, py + 12 * d, 1 - d);
  }
}

// ------------------------------------------------------------------ noren
export function drawNoren(t, wind) {
  // rod
  for (let x = 0; x < 26; x++) { ov(x, 1, 0.34, 0.19, 0.07, 1); ov(x, 2, 0.16, 0.08, 0.03, 1); }
  const L = 26, A = 0.7 + 4 * wind;
  for (let p = 0; p < 3; p++) {
    const xa = 1 + p * 8, xb = xa + 7, ph = p * 1.9;
    for (let y = 3; y < 3 + L; y++) {
      const f = ((y - 3) / L) ** 1.3;
      const dx = f * (A * Math.sin(t * 1.3 + ph) + 0.5 * Math.sin(t * 2.9 + ph * 2) + 3 * wind);
      const l = xa + dx, r = xb + dx;
      for (let x = Math.floor(l) - 1; x <= Math.ceil(r) + 1; x++) {
        const cov = clamp(Math.min(x + 0.5 - l, r - (x - 0.5)));
        if (cov <= 0) continue;
        const fold = 0.8 + 0.2 * Math.sin((x - dx) * 1.6 + p);
        let c = [0.035 * fold, 0.07 * fold, 0.34 * fold];
        if (p === 1) { // white ring crest
          const cx = xa + 3.5 + dx * 0.95, d = Math.abs(Math.hypot(x - cx, y - 13) - 2.4);
          if (d < 1) c = kit.mix(c, [0.55, 0.55, 0.6], 1 - d);
        }
        if (y === 2 + L) c = S(c, 0.5);
        ov(x, y, c[0], c[1], c[2], cov);
      }
    }
  }
}

// ------------------------------------------------------------------ chef
const SKIN = S(hx('#f0a070'), 0.55);
const HEAD = sprite([
  '....hhhhhhhh....',
  '..hhhhhhhhhhhh..',
  '.WWWWWWWWWWWWWW.',
  '.WwWWWWRRWWWWwW.',
  '.ssssssssssssss.',
  'sssbbbssssbbbsss',
  'ssssssssssssssss',
  'ssssssssssssssss',
  'ssssssssssssssss',
  '.sssssnnnnsssss.',
  '.ssmsssssssssms.',
  '..sssmmmmmmsss..',
  '...ssssssssss...',
  '.....ssssss.....',
], { h: [0.12, 0.07, 0.045], W: [0.62, 0.62, 0.6], w: [0.4, 0.4, 0.4], R: S(hx('#ff2030'), 0.8),
  s: SKIN, b: [0.03, 0.02, 0.015], n: S(SKIN, 0.75), m: [0.2, 0.025, 0.02] });
const COAT = [0.34, 0.35, 0.37], NAVY = [0.03, 0.06, 0.3];
export const CHEF_X = 126;

function salmonBlock(x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const f = kit.fract((x * 0.5 - y * 0.9) / 3.2);
    const c = f < 0.28 ? S(SALMON_FAT, 0.7) : S(SALMON, 0.55 + 0.15 * (y0 + h - y) / h);
    ov(x, y, c[0], c[1], c[2], 1);
  }
}

/**
 * The itamae: slicing salmon on his board between the hours and minutes.
 * look -1..1 turns his eyes; bow 0..1 is the hour bow.
 */
export function drawChef(t, look, bow, night, toss = 0) {
  const by = 8 * bow, cx = CHEF_X;
  // hachimaki tails, fluttering behind his head
  const tl = Math.sin(t * 3.1) * 0.8;
  seg(cx + 7, 10.5 + by, cx + 11.5, 13 + by + tl, 1.6, 0.5, 0.5, 0.48);
  seg(cx + 7, 11 + by, cx + 10, 15.5 + by - tl * 0.6, 1.4, 0.45, 0.45, 0.43);
  // torso: white coat, navy collar, a navy maekake apron
  for (let y = Math.floor(21 + by); y < 47; y++) for (let x = cx - 13; x <= cx + 13; x++) {
    const dy = y - (21.5 + by), ax = Math.abs(x - cx);
    const edge = 11.5 + Math.min(dy, 14) * 0.08 - (dy < 4 ? 4 - Math.sqrt(Math.max(0, 16 - (4 - dy) ** 2)) : 0);
    const cov = clamp(edge - ax + 0.5) * clamp(dy + 0.5);
    if (cov <= 0) continue;
    const sh = 0.55 + 0.25 * Math.cos(ax * 0.13) - (x > cx ? 0.08 : 0);
    let c = [COAT[0] * sh, COAT[1] * sh, COAT[2] * sh];
    if (dy > 12.5) c = [NAVY[0] * sh, NAVY[1] * sh, NAVY[2] * sh * (ax > 8.5 ? 0.6 : 1)];
    else if (dy > 11.5) c = [0.3, 0.06, 0.04];             // red apron string
    ov(x, y, c[0], c[1], c[2], cov);
  }
  seg(cx - 4.5, 21.5 + by, cx, 29 + by, 2.2, ...NAVY);
  seg(cx + 4.5, 21.5 + by, cx, 29 + by, 2.2, ...NAVY);
  // head
  blit(HEAD, cx - 8, 8 + by);
  // eyes: dark dots that glance toward the turning digit, and blink
  const blink = kit.fract(t / 5.3) < 0.03 || night > 0.5;
  const ex = look * 1.2;
  for (const e of [-4, 3]) {
    if (blink) seg(cx + e - 0.5 + ex, 15.5 + by, cx + e + 1.5 + ex, 15.5 + by, 0.9, 0.03, 0.02, 0.02);
    else disk(cx + e + 0.5 + ex, 15.4 + by, 0.9, 1.1, 0.02, 0.015, 0.01);
  }
  // slicing: pull stroke, lift, return, rest (2.6 s); frozen into a bow at the hour
  const p = kit.fract(t / 2.6) * 2.6;
  let kx, ky, glint = 0;
  if (p < 0.9) { const k = kit.ease.inOut(p / 0.9); kx = 121 - 12 * k; ky = 37 + 2 * k; glint = k; }
  else if (p < 1.5) { const k = kit.ease.inOut((p - 0.9) / 0.6); kx = 109 + 12 * k; ky = 39 - 3.5 * Math.sin(Math.PI * k) - 2 * k; glint = -1; }
  else { kx = 121; ky = 37; glint = -1; }
  const hands = [[kit.lerp(kx, cx - 7, bow), kit.lerp(ky, 41 + by * 0.3, bow)], [kit.lerp(cx + 12 + 1.5 * toss, cx + 7, bow), kit.lerp(40.5 - 5 * toss, 41 + by * 0.3, bow)]];
  const sh = [[cx - 10, 25 + by], [cx + 10, 25 + by]];
  for (let k = 0; k < 2; k++) {
    const [hxp, hyp] = hands[k], [sx, sy] = sh[k];
    const elx = sx + (k ? 3 : -3) * (1 - 0.5 * bow), ely = sy + 9;
    seg(sx, sy, elx, ely, 5.6, 0.02, 0.02, 0.03);
    seg(elx, ely, hxp, hyp, 5.2, 0.02, 0.02, 0.03);
    seg(sx, sy, elx, ely, 3.8, COAT[0] * 1.2, COAT[1] * 1.2, COAT[2] * 1.2);
    seg(elx, ely, hxp, hyp, 3.4, COAT[0] * 1.3, COAT[1] * 1.3, COAT[2] * 1.3);
  }
  // board and salmon block (in front of him)
  for (let x = cx - 24; x <= cx + 24; x++) { ov(x, 44, ...WOOD, 1); ov(x, 45, ...WOOD_DK, 1); ov(x, 46, ...S(WOOD_DK, 0.7), 1); }
  salmonBlock(cx + 5, 39, 14, 5);
  for (let k = 0; k < 3; k++) { // three slices fanned on the board
    const x0 = cx - 21 + k * 3.2;
    seg(x0, 43, x0 + 3.5, 41.5, 2, ...S(SALMON, 0.6));
    seg(x0 + 0.5, 43.3, x0 + 3.2, 42, 0.7, ...S(SALMON_FAT, 0.5));
  }
  // the knife (yanagiba) in his right hand, blade toward the block
  const [kxh, kyh] = hands[0];
  const ang = kit.lerp(0.14, 1.35, bow), ca = Math.cos(ang), sa = Math.sin(ang);
  seg(kxh - 4 * ca, kyh - 4 * sa, kxh, kyh, 1.8, 0.25, 0.13, 0.05);
  seg(kxh, kyh, kxh + 17 * ca, kyh + 17 * sa, 1.5, 0.42, 0.44, 0.48);
  if (glint >= 0) {
    const g = 2 + 14 * glint;
    glow(kxh + g * ca, kyh + g * sa - 0.3, 2.2, 0.55 * (1 - bow), 0.55 * (1 - bow), 0.6 * (1 - bow));
  }
  for (const [x, y] of hands) disk(x, y, 2.4, 2.2, ...S(SKIN, 1.2));
}

// ----------------------------------------------------------------- counter
export function drawCounter() {
  for (let x = 0; x < W; x++) {
    const gr = 0.9 + 0.1 * Math.sin(x * 0.37 + Math.sin(x * 0.071) * 3);
    ov(x, 47, WOOD[0] * 1.15 * gr, WOOD[1] * 1.15 * gr, WOOD[2] * 1.15 * gr, 1);
    ov(x, 48, WOOD[0] * 0.8 * gr, WOOD[1] * 0.8 * gr, WOOD[2] * 0.8 * gr, 1);
    ov(x, 49, WOOD_DK[0] * 0.8, WOOD_DK[1] * 0.8, WOOD_DK[2] * 0.8, 1);
    ov(x, 50, WOOD_DK[0] * 0.4, WOOD_DK[1] * 0.4, WOOD_DK[2] * 0.4, 1);
  }
}

// ------------------------------------------------------------------- frog
const BANDS = ['#ff3030', '#ff8a00', '#ffd400', '#30d040', '#1e80ff', '#9040ff'].map((c) => S(hx(c), 0.62));
export const FROG_X = 241;
const EYES = [[FROG_X - 6, 21.5], [FROG_X + 6, 21.5]];
/** sd of the frog's silhouette (px, negative inside) */
function frogSD(x, y) {
  const e1 = Math.hypot(x - EYES[0][0], y - EYES[0][1]) - 5.6, e2 = Math.hypot(x - EYES[1][0], y - EYES[1][1]) - 5.6;
  const u = (x - FROG_X) / 12.5, v = (y - 33) / 10.5, h = (Math.sqrt(u * u + v * v) - 1) * 10.5;
  const u2 = (x - FROG_X) / 13.5, v2 = (y - 44) / 8, b = (Math.sqrt(u2 * u2 + v2 * v2) - 1) * 8;
  return Math.min(e1, e2, h, b);
}
/**
 * The customer: a rainbow frog in round glasses at the end of the counter.
 * gaze: [-1..1, -1..1] pupil direction; chew 0..1 opens the mouth; arm: hand target or null.
 */
export function drawFrog(t, gaze, chew) {
  for (let y = 15; y < 52; y++) for (let x = FROG_X - 15; x <= FROG_X + 15; x++) {
    const d = frogSD(x, y);
    if (d > 0.5) continue;
    const cov = clamp(0.5 - d), bi = clamp(Math.floor((y - 16) / 5.6), 0, 5);
    const c = BANDS[bi], k = d > -1.4 ? 0.35 : 1;      // darker rim: the outline
    ov(x, y, c[0] * k, c[1] * k, c[2] * k, cov);
  }
  // mouth: a wide smile, or open while chewing
  if (chew > 0.05) {
    disk(FROG_X, 32.5, 3.2 + chew, 0.8 + 1.8 * chew, 0.03, 0.005, 0.01);
    disk(FROG_X, 33.4 + 0.6 * chew, 1.8, 0.5 + 0.6 * chew, 0.5, 0.12, 0.18);
  } else {
    let px = FROG_X - 7.5, py = 30.5;
    for (let k = 1; k <= 8; k++) {
      const u = k / 8, x = FROG_X - 7.5 + 15 * u, y = 30.5 + 3.4 * Math.sin(Math.PI * u);
      seg(px, py, x, y, 1.1, 0.02, 0.01, 0.01);
      px = x; py = y;
    }
  }
  // glasses: white rims, a bridge, eyes that look and blink
  const blink = kit.fract(t / 4.1 + 0.3) < 0.035;
  for (const [ex, ey] of EYES) {
    for (let y = Math.floor(ey - 6); y <= ey + 6; y++) for (let x = Math.floor(ex - 6); x <= ex + 6; x++) {
      const r = Math.hypot(x - ex, y - ey);
      const rim = clamp(1 - Math.abs(r - 4.6) / 0.9);
      if (r < 4.1) ov(x, y, 0.015, 0.02, 0.05, 1);
      if (rim > 0) ov(x, y, 0.75, 0.75, 0.72, rim);
    }
    if (blink) seg(ex - 2.6, ey, ex + 2.6, ey, 1.2, 0.4, 0.4, 0.38);
    else {
      disk(ex, ey, 2.9, 2.9, 0.52, 0.52, 0.5);
      disk(ex + gaze[0] * 1.3, ey + gaze[1] * 1.1, 1.45, 1.45, 0.0, 0.0, 0.0);
      ad(Math.round(ex + gaze[0] * 1.3 - 1), Math.round(ey + gaze[1] * 1.1 - 1), 0.3, 0.3, 0.3);
    }
  }
  seg(EYES[0][0] + 4.8, 21, EYES[1][0] - 4.8, 21, 1.1, 0.7, 0.7, 0.68);
}
export function drawFrogArm(arm) {
  {
    const g = BANDS[3];
    seg(FROG_X - 10, 38, arm[0], arm[1], 3, g[0], g[1], g[2]);
    disk(arm[0], arm[1], 2.1, 2.1, g[0] * 1.2, g[1] * 1.2, g[2] * 1.2);
  }
}

// ------------------------------------------------------------- the train
const WHITE = [0.52, 0.52, 0.5], BLUE = [0.02, 0.1, 0.62], GLASS = [0.02, 0.03, 0.08];
const PILE = [SALMON, TUNA, TAMAGO, IKURA, SALMON, hx('#ff5a30'), TUNA];

/** Shinkansen with the hour's funamori platter; xF is the nose tip. */
export function drawTrain(xF, t, speed) {
  const L = 66, top = 49, bot = 61;
  // speed streaks behind it
  if (speed > 25) {
    const a = clamp((speed - 25) / 160) * 0.6;
    for (let r = 0; r < 6; r++) {
      const y = 50 + r * 2, len = 20 + 60 * kit.hash(r, 5) * a, x1 = xF - 116 - 4 * kit.hash(r, 6);
      for (let x = Math.floor(x1 - len); x < x1; x++) { const f = (x - (x1 - len)) / len; ad(x, y, 0.12 * a * f, 0.13 * a * f, 0.15 * a * f); }
    }
  }
  // locomotive
  for (let x = Math.floor(xF - L); x <= Math.ceil(xF); x++) {
    const u = xF - x;
    const hcov = clamp(u + 0.5) * clamp(L - u + 0.5);
    if (hcov <= 0) continue;
    const yt = u < 30 ? top + 11 * (1 - u / 30) ** 2.2 : top + (u > L - 3 ? (u - (L - 3)) * 0.8 : 0);
    for (let y = Math.floor(yt); y <= bot + 1; y++) {
      let cov = hcov * clamp(y + 0.5 - yt);
      if (cov <= 0) continue;
      let c;
      if (y >= bot) c = [0.06, 0.06, 0.07];
      else if (y === 57 || y === 58) c = BLUE;
      else if ((y === 52 || y === 53) && u > 32 && u < L - 6) c = (Math.floor(u) % 5 < 3) ? [0.32, 0.27, 0.16] : GLASS;
      else if (u >= 12 && u < 30 && y >= yt + 0.6 && y < yt + 2.8 && y <= 55) c = GLASS;
      else c = y < yt + 1 ? [0.75, 0.75, 0.73] : y === 60 ? [0.26, 0.26, 0.26] : WHITE;
      ov(x, y, c[0], c[1], c[2], cov);
    }
  }
  glow(xF - 2, 59.5, 2.6, 0.5, 0.42, 0.25);
  // flat car with the platter, coupled behind
  const c0 = xF - L - 50, c1 = xF - L - 4;
  seg(c1, 59, xF - L, 59, 1.2, 0.08, 0.08, 0.08);
  for (let x = Math.floor(c0); x <= Math.ceil(c1); x++) {
    const hc = clamp(x - c0 + 0.5) * clamp(c1 - x + 0.5);
    if (hc <= 0) continue;
    ov(x, 56, ...WHITE, hc); ov(x, 57, ...BLUE, hc); ov(x, 58, ...BLUE, hc);
    ov(x, 59, ...WHITE, hc); ov(x, 60, 0.26, 0.26, 0.26, hc); ov(x, 61, 0.06, 0.06, 0.07, hc); ov(x, 62, 0.06, 0.06, 0.07, hc);
  }
  // funamori: a wooden boat heaped with nigiri, steaming
  const b0 = c0 + 3, b1 = c1 - 3;
  for (let x = Math.floor(b0); x <= Math.ceil(b1); x++) {
    const u = (x - b0) / (b1 - b0), hc = clamp(x - b0 + 0.5) * clamp(b1 - x + 0.5);
    const yt = 52 - 3.5 * Math.max(0, (u - 0.85) / 0.15) ** 1.5 - 1.5 * Math.max(0, (0.12 - u) / 0.12);
    for (let y = Math.floor(yt); y <= 55; y++) {
      const cv = hc * clamp(y + 0.5 - yt);
      const c = y < yt + 1 ? [0.5, 0.3, 0.12] : [0.3, 0.14, 0.05];
      ov(x, y, c[0], c[1], c[2], cv);
    }
  }
  for (let k = 0; k < 7; k++) {
    const x = b0 + 4 + k * 5.1, col = PILE[k];
    disk(x, 51.2, 2.4, 1.0, ...RICE);
    disk(x, 49.6, 2.6, 1.4, col[0] * 0.7, col[1] * 0.7, col[2] * 0.7);
    ad(Math.round(x - 1), 49, 0.15, 0.15, 0.15);
  }
  seg(b0 + 34, 51, b0 + 37, 45.5, 1.2, 0.05, 0.3, 0.05);  // shiso sprig
  disk(b0 + 37.5, 45.5, 1.6, 1.0, 0.08, 0.4, 0.08);
  // steam curling up from the platter
  for (let k = 0; k < 4; k++) {
    const ph = kit.fract(t * 0.55 + k * 0.25), x = b0 + 8 + k * 7 + 2.5 * Math.sin(t * 2 + k * 2 + ph * 5);
    const a = Math.sin(Math.PI * ph) * 0.07;
    glow(x - ph * 4, 46 - ph * 14, 2.2 + 3 * ph, a, a, a * 1.05);
  }
}
