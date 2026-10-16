import * as kit from '../js/kit.js';
import { Raster, drawBar, tempOf } from './forge-draw.js';
import { shapeInto, makePath } from './forge-glyphs.js';

let R = null;
const PATH = makePath();
const TT = new Float32Array(400);
const pad = (n) => String(n).padStart(2, '0');

export default {
  name: 'forge', blurb: 'Placeholder.',
  layouts: ['hub-tall'], look: 'smoke', fps: 60, brightness: 0.35,
  frame(ctx) {
    const G = kit.grid(ctx);
    if (!R) R = new Raster(G.w, G.h);
    R.clear();
    const D = ctx.date, a = kit.secOf(D);
    const hh = pad(D.getHours()), mm = pad(D.getMinutes());
    const slots = [[hh[0], 17.5, 38, 0.8, 600], [hh[1], 46.5, 38, 0.8, 600], [mm[0], 17, 88, 1, 300], [mm[1], 47, 88, 1, a]];
    for (const [ch, cx, by, k, age] of slots) {
      const P = shapeInto(PATH, +ch, 1, k, cx, by);
      for (let i = 0; i < P.n; i++) TT[i] = tempOf(age, P.t[i], 26);
      drawBar(R, P, 1.9 * k, { T: TT, fire: 1, shimmer: null, alpha: null, halo: 1 });
    }
    kit.blitGrid(ctx, R.img);
  },
};
