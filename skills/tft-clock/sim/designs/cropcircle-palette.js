// The light of the day over the field, for cropcircle.js: four palettes
// (night, dawn, day, dusk) blended by the hour, the sun's (or moon's)
// direction for the shadows and the gloss of the laid straw, and the colour
// look-up tables the per-pixel pass reads. All rebuilt once a minute with
// integer arithmetic (about 1,000 table entries: well under 0.1 ms).

const hx = (s) => parseInt(s, 16);
const P = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? hx(v) : v]));

// gap: the dark between the ears; ear: a head of wheat; sheen: a head bent by
// a gust, showing its pale side; flatLo/flatHi: laid straw, matte to glossy;
// shade: what a shadow on laid straw turns to; wall: a lit standing edge;
// grass / hedge / dirt: the pasture, the hedgerow and the farm track; glow: the beam.
export const PALS = {
  night: P({ rim: '040c1c', gap: '0c1e3a', ear: '30587a', sheen: '6a98b8', flatLo: '7a9ac4', flatHi: 'e4f2ff', shade: '1a2c50', wall: '7aa0c0',
    grass: '163448', grassHi: '22465a', hedge: '061420', hedgeHi: '0e2a36', dirt: '262c48', dirtHi: '343c5c', glow: '9effd8' }),
  dawn: P({ rim: '1c0c26', gap: '362050', ear: 'a8708c', sheen: 'f0a8b4', flatLo: 'c09ab8', flatHi: 'ffe6ee', shade: '402a5a', wall: 'f8c0c8',
    grass: '4a5a50', grassHi: '647460', hedge: '1e2430', hedgeHi: '343a40', dirt: '6a5050', dirtHi: '8a6a64', glow: 'a8ffe0' }),
  day: P({ rim: '2a2006', gap: '665c1e', ear: 'c8a83e', sheen: 'f0d068', flatLo: 'b8a070', flatHi: 'fffcec', shade: '3a3018', wall: 'f6e49a',
    grass: '4e8a2e', grassHi: '74a846', hedge: '1e3c16', hedgeHi: '3a6424', dirt: '8c6c44', dirtHi: 'b08c5c', glow: 'b0ffe8' }),
  dusk: P({ rim: '2a1006', gap: '4a2618', ear: 'd88a40', sheen: 'ffc070', flatLo: 'cc8c58', flatHi: 'ffdca0', shade: '5a2c38', wall: 'ffc880',
    grass: '5a6a30', grassHi: '7a8440', hedge: '2a2218', hedgeHi: '4a3a20', dirt: '7a4a34', dirtHi: '9a6444', glow: 'b0ffe0' }),
};

// [hour, night, dawn, day, dusk] weights
const KEYS = [
  [0, 1, 0, 0, 0], [4.8, 1, 0, 0, 0], [6.0, 0.15, 0.85, 0, 0], [7.4, 0, 0.1, 0.9, 0], [8.4, 0, 0, 1, 0],
  [16.6, 0, 0, 1, 0], [18.3, 0, 0, 0.15, 0.85], [19.2, 0, 0.45, 0, 0.55], [19.9, 0.45, 0.55, 0, 0], [20.8, 1, 0, 0, 0], [24, 1, 0, 0, 0],
];
const NAMES = ['night', 'dawn', 'day', 'dusk'];

const ch = (c, s) => (c >> s) & 255;
/** Integer mix of two 0xRRGGBB colours, u in 0..256. */
export function imix(a, b, u) {
  const r = ch(a, 16) + (((ch(b, 16) - ch(a, 16)) * u) >> 8);
  const g = ch(a, 8) + (((ch(b, 8) - ch(a, 8)) * u) >> 8);
  const bl = ch(a, 0) + (((ch(b, 0) - ch(a, 0)) * u) >> 8);
  return (r << 16) | (g << 8) | bl;
}
const iscale = (a, k) => {   // k in 0..512 (256 = 1)
  const f = (v) => { v = (v * k) >> 8; return v > 255 ? 255 : v; };
  return (f(ch(a, 16)) << 16) | (f(ch(a, 8)) << 8) | f(ch(a, 0));
};

/** The day's light at `hour` (0..24): the blended palette, the shadow step and the gloss azimuth. */
export function daylight(hour) {
  let k = 1;
  while (k < KEYS.length - 1 && KEYS[k][0] <= hour) k++;
  const a = KEYS[k - 1], b = KEYS[k], u = Math.max(0, Math.min(1, (hour - a[0]) / (b[0] - a[0] || 1)));
  const wt = NAMES.map((_, i) => a[i + 1] + (b[i + 1] - a[i + 1]) * u);
  const pal = {};
  for (const key of Object.keys(PALS.day)) {
    let r = 0, g = 0, bl = 0;
    NAMES.forEach((n, i) => { const c = PALS[n][key]; r += ch(c, 16) * wt[i]; g += ch(c, 8) * wt[i]; bl += ch(c, 0) * wt[i]; });
    pal[key] = ((r | 0) << 16) | ((g | 0) << 8) | (bl | 0);
  }
  const night = wt[0];
  // the sun crosses from east (right) through south (bottom) to west; the moon
  // takes the same road twelve hours later. Shadows fall away from it.
  const sunUp = hour > 5.6 && hour < 19.8;
  const phi = ((sunUp ? hour : (hour + 12) % 24) - 12) / 6 * (Math.PI / 2);
  const sdx = Math.sin(phi), sdy = -Math.cos(phi);
  const len = sunUp ? 1 + Math.round(Math.min(1, Math.abs(Math.sin(phi)) * 1.3)) : 2;
  return { pal, night, sdx, sdy, len, az: Math.atan2(sdy, sdx), sun: sunUp };
}

/** Standing-wheat table: [lit wall 0/1][wind 0..15][ear 0..15] -> 0xRRGGBB, then 16 rim colours. */
export function standingLUT(pal, out) {
  for (let lit = 0; lit < 2; lit++)
    for (let w = 0; w < 16; w++)
      for (let t = 0; t < 16; t++) {
        let c = imix(pal.gap, pal.ear, (t * 256 / 15) | 0);
        // a gust bends the heads: their pale sides show, mostly on the ears
        c = imix(c, pal.sheen, ((w * (4 + t)) * 256 / (16 * 19 * 1.6)) | 0);
        if (lit) c = imix(iscale(c, 320), pal.wall, 150);
        out[(lit << 8) | (w << 4) | t] = c;
      }
  // the rim: the dark wall of standing stalks round every laid area
  for (let t = 0; t < 16; t++) out[512 + t] = imix(pal.rim, pal.gap, t * 6);
  return out;
}

/** Laid-straw table: [shadow 0..3][gloss 0..15] -> 0xRRGGBB. */
export function flatLUT(pal, out) {
  for (let s = 0; s < 4; s++)
    for (let v = 0; v < 16; v++) {
      const c = imix(pal.flatLo, pal.flatHi, (v * 256 / 15) | 0);
      out[(s << 4) | v] = s ? imix(c, pal.shade, [0, 150, 200, 225][s]) : c;
    }
  return out;
}

/** Ground beyond the field: 0..15 grass, 16..31 hedge, 32..47 dirt (texture value inside each). */
export function zoneLUT(pal, out) {
  for (let v = 0; v < 16; v++) {
    const u = (v * 256 / 15) | 0;
    out[v] = imix(pal.grass, pal.grassHi, u);
    out[16 + v] = imix(pal.hedge, pal.hedgeHi, u);
    out[32 + v] = imix(pal.dirt, pal.dirtHi, u);
  }
  return out;
}
