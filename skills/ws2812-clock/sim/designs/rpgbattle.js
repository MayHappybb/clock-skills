import * as kit from '../js/kit.js';
import * as G from './rpgbattle-gfx.js';
import * as WY from './rpgbattle-wyrm.js';
import { damageDigit, DMG, menuText } from './rpgbattle-font.js';

const { W, H, img } = G;
const bg = new Float32Array(W * H * 3);
const HOUR_X = [3, 37], HOUR_Y = 17;
const DMG_X = 71, DMG_Y = 7;
const pad = (n) => String(n).padStart(2, '0');

function buildBg() {
  const sky0 = kit.hex('#000000'), sky1 = kit.hex('#120c30'), g0 = kit.hex('#10140c'), g1 = kit.hex('#1e2414');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c;
    if (y < 54) c = kit.mix(sky0, sky1, (y / 54) ** 2);
    else c = kit.mix(g0, g1, (y - 54) / 36);
    const o = 3 * (y * W + x);
    bg[o] = c[0]; bg[o + 1] = c[1]; bg[o + 2] = c[2];
  }
}
buildBg();

export default {
  name: 'Wyrm Battle', blurb: 'placeholder',
  layouts: ['hub-2x2'], look: 'smoke', fps: 60, brightness: 0.35,
  frame(ctx) {
    const now = ctx.date.getTime() / 1000, t = now % 3600;
    img.set(bg);
    const d = ctx.date, hh = pad(d.getHours()), mm = pad(d.getMinutes());
    WY.clear();
    const st = [];
    const heads = [];
    for (let i = 0; i < 2; i++) {
      const L = WY.PATHS[hh[i]].L;
      st.push({ flash: 0, burn: 0, glint: ((t * 22 + i * 60) % (L + 80)) - 20, L });
      heads.push(WY.lay({ ox: HOUR_X[i], oy: HOUR_Y, digit: hh[i], head: 1, t, sway: 0.12 * Math.sin(t * 0.9 + i), own: i }));
    }
    WY.shadeAll(st);
    for (const hd of heads) {
      if (!hd) continue;
      const nx = -hd.fy, ny = hd.fx;
      for (const sgn of [-1, 1]) {
        const ex = hd.x + hd.fx * 2.6 + nx * 2.6 * sgn, ey = hd.y + hd.fy * 2.6 + ny * 2.6 * sgn;
        G.disc(ex, ey, 1.25, kit.hex('#ffe03a'));
        G.disc(ex + 0.35, ey, 0.45, [0, 0, 0]);
      }
    }
    for (let i = 0; i < 2; i++) damageDigit(mm[i], DMG_X + i * DMG.adv, DMG_Y, 1, 1, 1);
    kit.blitGrid(ctx, img, 1 - 0.6 * ctx.night);
  },
};
