// Drawing primitives for the mahjong table: baize, a single tile (ivory face,
// green skirt/back, bevel light, carved + lacquered numeral), the wall brick,
// and small ambience (steam, dice). All drawing is into a flat RGB float
// image (W*H*3) the caller owns; coordinates are pixel-space with sub-pixel
// coverage (anti-aliased by signed-distance coverage, not hard rects).
import * as kit from '../js/kit.js';
import { GW, GH, GLYPHS, WAN_GLYPH, BLANK_FRAME } from './sonnet-mahjong-glyphs.js';

export const W = 256, H = 64;

// ---------------------------------------------------------------- palette
export const BAIZE = kit.hex('#0d3b2a');        // green felt
export const BAIZE_LO = kit.hex('#082318');
export const IVORY = kit.hex('#cdbd96');        // tile face (darker base so bevel/carving has headroom)
export const IVORY_HI = kit.hex('#f7eed2');
export const IVORY_LO = kit.hex('#8f8060');
export const TILE_GREEN = kit.hex('#0f5c3a');   // tile back/skirt (bamboo green)
export const RED = kit.hex('#c22a1f');
export const GREEN = kit.hex('#176b3a');
export const INKBLUE = kit.hex('#1c2d6b');
export const BLUE = kit.hex('#1f4fa0');
export const INK = kit.hex('#1b1510');
export const WOOD = kit.hex('#5a3620');
export const LAMP = kit.blackbody(3200);

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Signed distance (mm/px, +outside) from (px,py) to a rounded rect's edge. */
function roundRectSD(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - (hw - r), dy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(dx, 0), ay = Math.max(dy, 0);
  const outside = Math.sqrt(ax * ax + ay * ay) - r;
  const inside = Math.min(Math.max(dx, dy), 0);
  return outside > 0 ? outside : inside;
}
/** Signed coverage (0..1) of a rounded rect centred at (cx,cy), half-size (hw,hh), corner r. */
export function roundRectCov(px, py, cx, cy, hw, hh, r, soft = 0.6) {
  return kit.clamp(0.5 - roundRectSD(px, py, cx, cy, hw, hh, r) / soft);
}
/** Positive distance INTO the shape from its edge (0 at the edge, growing toward the centre). */
export function roundRectEdgeDist(px, py, cx, cy, hw, hh, r) {
  return -roundRectSD(px, py, cx, cy, hw, hh, r);
}

/** distance from (px,py) to the thick segment (x0,y0)-(x1,y1) with half width w/2, as coverage. */
function segCov(px, py, x0, y0, x1, y1, w, soft) {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
  const t = L2 ? kit.clamp(((px - x0) * dx + (py - y0) * dy) / L2) : 0;
  const qx = x0 + t * dx, qy = y0 + t * dy;
  const d = Math.hypot(px - qx, py - qy) - w / 2;
  return kit.clamp(0.5 - d / soft);
}

function strokesCoverage(strokes, lx, ly, widen = 0) {
  if (!strokes) return 0;
  let c = 0;
  for (const [x0, y0, x1, y1, w] of strokes) {
    const v = segCov(lx, ly, x0, y0, x1, y1, w + widen, 0.9);
    if (v > c) c = v;
  }
  return c;
}
/** Carve coverage (0..1) of numeral `ch` ('1'..'9') at local box coords. */
export function glyphCoverage(ch, lx, ly, widen = 0) { return strokesCoverage(GLYPHS[ch], lx, ly, widen); }
/** Carve coverage (0..1) of the 萬 glyph (same for every character tile). */
export function wanCoverage(lx, ly, widen = 0) { return strokesCoverage(WAN_GLYPH, lx, ly, widen); }
/** Carve coverage (0..1) of the 白板 blank-tile frame. */
export function blankCoverage(lx, ly, widen = 0) { return strokesCoverage(BLANK_FRAME, lx, ly, widen); }

/**
 * Draw one mahjong tile into `img` (flat W*H*3 float buffer, dims IW x IH).
 * cx, cy: centre of the tile FACE (top face) in image pixels.
 * fw, fh: face half-width / half-height (the visible top face size).
 * skirt: height in px of the green front skirt below the face (3D body).
 * tilt: 0 = flat top-down face only; >0 lifts the near edge (standing tile),
 *   drawing a visible green front face in perspective-ish shear.
 * digit: '0'..'9' or null (blank tile, no carving).
 * glow: 0..1 extra brightness/emphasis (the "live" time tiles).
 * lacquer: colour of the carved ink (RED/GREEN/INKBLUE).
 * lightDir: [lx, ly] unit vector the lamp comes from, for the bevel.
 */
export function drawTile(img, IW, IH, { cx, cy, fw, fh, skirt = 0, digit = null, glow = 0, lacquer = RED, alpha = 1, lightAz = -0.9 }) {
  const x0 = Math.max(0, Math.floor(cx - fw - 2)), x1 = Math.min(IW - 1, Math.ceil(cx + fw + 2));
  const y0 = Math.max(0, Math.floor(cy - fh - 2)), y1 = Math.min(IH - 1, Math.ceil(cy + fh + skirt + 3));
  const lx = Math.cos(lightAz), ly = Math.sin(lightAz) * 0.4 - 0.6;
  const invlen = 1 / Math.hypot(lx, ly);
  const Lx = lx * invlen, Ly = ly * invlen;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      // top face (rounded rect)
      const faceCov = roundRectCov(px, py, cx, cy, fw, fh, Math.min(fw, fh) * 0.18, 0.9);
      // skirt (front body) sits directly below the face, same width, rounded bottom
      let skirtCov = 0;
      if (skirt > 0) {
        const scy = cy + fh + skirt / 2 - 0.5;
        skirtCov = roundRectCov(px, py, cx, scy, fw, skirt / 2 + 0.5, Math.min(fw, 2) * 0.5, 0.9);
        // clip the overlap seam with the face so it doesn't double-draw above the face bottom
        if (py < cy + fh - 1) skirtCov = 0;
      }
      const cov = Math.max(faceCov, skirtCov);
      if (cov <= 0.004) continue;
      const o = 3 * (y * IW + x);
      let r, g, b;
      if (skirtCov > faceCov) {
        // green skirt: subtle vertical shading, darker at the very bottom
        const t = (py - (cy + fh)) / Math.max(1, skirt);
        const shade = 1 - 0.35 * kit.clamp(t);
        r = TILE_GREEN[0] * shade; g = TILE_GREEN[1] * shade; b = TILE_GREEN[2] * shade;
      } else {
        // ivory face: a gentle dome -- bright on the lamp side, darker rim
        // all round (ambient occlusion at the carved border, true distance
        // to the rounded-rect edge so it doesn't saturate on the short axis),
        // plus a soft specular ridge so the material reads as polished bone.
        const nx = (px - cx) / fw, ny = (py - cy) / fh;
        const edgeDist = roundRectEdgeDist(px, py, cx, cy, fw, fh, Math.min(fw, fh) * 0.18);
        const rim = kit.clamp(1 - edgeDist / (Math.min(fw, fh) * 0.9));
        const bevel = (nx * Lx + ny * Ly) * 1.1;
        let base = kit.mix(IVORY, bevel > 0 ? IVORY_HI : IVORY_LO, kit.clamp(Math.abs(bevel)));
        base = kit.mix(base, IVORY_LO, rim * rim * 0.7); // occluded rim, darker
        r = base[0]; g = base[1]; b = base[2];
        // carved marks: digit '0' is the white dragon's blank (a plain blue
        // frame, no ink inside); digits 1-9 carry a numeral (black ink, top
        // sub-box) over a 萬 character (red ink, bottom sub-box), as on a
        // real character-suit tile. Each is a sunken groove then ink fill.
        if (digit === 0) {
          const gx = ((px - cx) / fw) * 0.5 * GW + GW / 2;
          const gy = ((py - cy) / fh) * 0.5 * GH + GH / 2;
          const gc = blankCoverage(gx, gy);
          const groove = blankCoverage(gx, gy, 1.4);
          if (groove > gc) { const sh = (groove - gc) * 0.55; r *= 1 - sh; g *= 1 - sh; b *= 1 - sh; }
          if (gc > 0) { const ink = kit.mix([r, g, b], BLUE, gc * 0.95); r = ink[0]; g = ink[1]; b = ink[2]; }
        } else if (digit != null) {
          // the numeral and the 萬 live in their own sub-boxes (NUM_BOX,
          // WAN_BOX) of the same GW x GH glyph box, so a single face-local
          // (gx, gy) map covers both marks at once.
          const gx = ((px - cx) / fw) * 0.5 * GW + GW / 2;
          const gy = ((py - cy) / fh) * 0.5 * GH + GH / 2;
          const gcN = glyphCoverage(String(digit), gx, gy);
          const groN = glyphCoverage(String(digit), gx, gy, 1.4);
          const gcW = wanCoverage(gx, gy);
          const groW = wanCoverage(gx, gy, 1.4);
          if (groN > gcN) { const sh = (groN - gcN) * 0.55; r *= 1 - sh; g *= 1 - sh; b *= 1 - sh; }
          if (groW > gcW) { const sh = (groW - gcW) * 0.55; r *= 1 - sh; g *= 1 - sh; b *= 1 - sh; }
          if (gcN > 0) { const ink = kit.mix([r, g, b], INK, gcN * 0.95); r = ink[0]; g = ink[1]; b = ink[2]; }
          // the wan character is always red ink, as on a real character tile,
          // regardless of the numeral's own lacquer accent colour
          if (gcW > 0) { const ink = kit.mix([r, g, b], RED, gcW * 0.95); r = ink[0]; g = ink[1]; b = ink[2]; }
        }
      }
      // overall glow emphasis (the live time tiles sit "lit")
      const k = (1 + glow * 0.5);
      const o0 = img[o], o1 = img[o + 1], o2 = img[o + 2];
      img[o] = o0 + (r * k - o0) * cov * alpha;
      img[o + 1] = o1 + (g * k - o1) * cov * alpha;
      img[o + 2] = o2 + (b * k - o2) * cov * alpha;
    }
  }
}

/** A soft dark ellipse under a standing tile, cast onto the baize, offset
 * away from the lamp so the tile reads as a raised object on the table. */
export function dropShadow(img, IW, IH, cx, cy, w, h, strength = 0.45) {
  const x0 = Math.max(0, Math.floor(cx - w)), x1 = Math.min(IW - 1, Math.ceil(cx + w));
  const y0 = Math.max(0, Math.floor(cy - h)), y1 = Math.min(IH - 1, Math.ceil(cy + h));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / w, dy = (y + 0.5 - cy) / h, d2 = dx * dx + dy * dy;
      if (d2 >= 1) continue;
      const a = (1 - d2) * strength;
      const o = 3 * (y * IW + x);
      img[o] *= 1 - a; img[o + 1] *= 1 - a; img[o + 2] *= 1 - a;
    }
  }
}

/** A small flat discard tile lying face-up on the baize (dim, secondary). */
export function drawDiscard(img, IW, IH, cx, cy, w, h, digit, dim) {
  drawTile(img, IW, IH, { cx, cy, fw: w / 2, fh: h / 2, skirt: 0, digit, glow: 0, lacquer: GREEN, alpha: dim });
}

/** Felt background with a soft lamp pool and faint weave. */
export function paintBaize(img, IW, IH, lampX, lampY, dim) {
  for (let y = 0; y < IH; y++) {
    for (let x = 0; x < IW; x++) {
      const o = 3 * (y * IW + x);
      const d = Math.hypot(x - lampX, y - lampY) / 170;
      const pool = kit.clamp(1 - d * d);
      const weave = 0.99 + 0.01 * Math.sin(x * 1.3) * Math.sin(y * 1.3);
      const base = kit.mix(BAIZE_LO, BAIZE, 0.32 + 0.45 * pool);
      img[o] = base[0] * weave * dim;
      img[o + 1] = base[1] * weave * dim;
      img[o + 2] = base[2] * weave * dim;
    }
  }
}
