// The bridge's pigeons: three perch on the girder's bottom chord and bob
// their heads to the beat like everyone else here; at the hour the train
// scares them off (a swoop across the top of the wall, flapping) and later
// three glide back in to new perches. Flat sprites, closed form in time.
import { sprite, hash, sin } from '../js/kit.js';

const DAY = { g: 0xa9adb6, b: 0x8a8f9a, w: 0x565a66, t: 0x464a54, n: 0x4f9c8c, e: 0x101018, f: 0xe07a52 };
const NIGHT = Object.fromEntries(Object.entries(DAY).map(([k, c]) => [k, k === 'e' ? c : ((((c >> 16) & 255) * 0.55) << 16) | ((((c >> 8) & 255) * 0.55) << 8) | ((c & 255) * 0.55)]));
for (const k in NIGHT) NIGHT[k] = Math.round(NIGHT[k]) & 0xffffff;

const art = (P) => ({
  sit: sprite(`
    .gg......
    egn......
    .gnbbbb..
    ..bbwwbbt
    ...bbbbtt
    ....f.f..`, P),
  nod: sprite(`
    .........
    gg.......
    egnbbbb..
    .nbbwwbbt
    ...bbbbtt
    ....f.f..`, P),
  up: sprite(`
    ...ww....
    ....ww.w.
    .gbbbbbtt
    egbbbbt..`, P),
  down: sprite(`
    .gbbbbbtt
    egbbbbt..
    ...ww..w.
    ..ww.....`, P),
});
const ART_DAY = art(DAY), ART_NIGHT = art(NIGHT);

/** Perch x for pigeon j in hour key hk at second s (they shuffle along the chord a little). */
const perch = (hk, j, s) => 12 + j * 50 + (hash(hk, j, 61) % 34) + Math.round(3 * sin(s * ((2 * Math.PI) / 30) + j * 2));

/**
 * Draw the pigeons. T: seconds from the nearest hour turn (null when far
 * from one), hk: the hour key the perches belong to now, s: second of the minute.
 */
export function pigeons(g, s, T, hkOld, hkNew, night) {
  const A = night ? ART_NIGHT : ART_DAY;
  for (let j = 0; j < 3; j++) {
    const tOff = -1.0 + 0.22 * j, tBack = 5.0 + 0.5 * j;   // take-off, and landing start
    if (T === null || T < tOff) {
      // perched (on the old perch before the hour): a nod on the beat, an off-beat peck now and then
      const hk = T === null ? hkNew : hkOld;
      const x = perch(hk, j, s), p = s - Math.floor(s);
      const nod = p < 0.18 || (hash(Math.floor(s), j, 5) % 3 === 0 && p > 0.5 && p < 0.62);
      g.blit(nod ? A.nod : A.sit, x, 2, { flipX: (hash(hk, j, 8) & 1) === 1 });
      continue;
    }
    const flap = Math.floor(s * 9 + j * 3) & 1 ? A.up : A.down;
    if (T < tBack) {
      // scared off: a swoop down across the top of the wall and away to the right
      const tau = T - tOff, x0 = perch(hkOld, j, 60 + tOff);
      const x = x0 + 26 * tau + 16 * tau * tau, y = 2 + 30 * tau - 14 * tau * tau;
      if (x < 165 && y > -6) g.blit(flap, x, y, { flipX: true });
      continue;
    }
    // gliding back in from the top right to the new perch
    const e = Math.min(1, (T - tBack) / 2.2), q = 1 - e;
    const x = perch(hkNew, j, s) + 70 * q, y = 2 - 16 * q * q + 6 * q * (1 - q) * 4;
    g.blit(e >= 1 ? A.sit : flap, x, y, { flipX: e >= 1 && (hash(hkNew, j, 8) & 1) === 1 });
  }
}
