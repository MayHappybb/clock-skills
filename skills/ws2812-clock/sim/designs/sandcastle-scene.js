// Low Tide: one frame, back to front.
import { GW, GH, img, turnInfo, digitsAt } from './sandcastle-common.js';
import { environment, drawSky } from './sandcastle-sky.js';
import { wavesAt, drawGround, drawWater, drawSpray } from './sandcastle-sea.js';
import { drawCastles, drawFlags } from './sandcastle-castle.js';
import { crabsAt, drawCrab } from './sandcastle-crab.js';

export function scene(ctx, kit) {
  const G = kit.grid(ctx);
  if (!G || G.w !== GW || G.h !== GH) return;
  const now = ctx.date.getTime() / 1000, M0 = Math.floor(now / 60) * 60, sec = now - M0;
  const A = turnInfo(M0), B = turnInfo(M0 + 60), cur = digitsAt(M0);
  const E = environment(ctx.date, now);
  drawSky(E, now);
  drawGround(E, now, sec, A);
  const flags = drawCastles(E, now, sec, A, cur);
  drawFlags(E, now, flags, sec, A);
  const waves = wavesAt(sec, A, B);
  const crabs = crabsAt(now, sec, A, B);
  for (const c of crabs) if (c.under) drawCrab(E, now, c);
  drawWater(E, now, waves);
  drawSpray(E, waves.bursts);
  for (const c of crabs) if (!c.under) drawCrab(E, now, c);
  kit.blitGrid(ctx, img, 1 - 0.45 * ctx.night);
}
