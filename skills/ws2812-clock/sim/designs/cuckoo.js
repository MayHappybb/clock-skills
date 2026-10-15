// Cuckoo: the two stacked panels are one carved Black Forest cuckoo clock,
// chalet roof and bird finial at the top, the long pendulum and pinecone
// weights below. The hour is carved on two walnut plaques in the case; the
// minutes are carved on the pendulum's own medallion, so they swing with
// it, every second, in real pendulum motion. The minute weight creeps down
// its chain over the hour.
// Minute turn: the medallion flips like a coin mid-swing; the new minute is
// carved on its back. Hour: the hour plaques somersault, the doors burst
// open and the owner's rainbow frog in round glasses pops out and croaks the
// hour, the strike weight dropping a link per croak, then both weights are
// wound back up the chains.
import * as kit from '../js/kit.js';
import { W, H, img, STATIC, PLAQ, PLAQ_HW, PLAQ_HH, PIVOT, CHAIN_X, DOOR, CASE, ESC, P } from './cuckoo-scene.js';
import { card, rod, chain, pinecone, doorLeaf, frog, rings, escapeWheel } from './cuckoo-parts.js';

const TAU = Math.PI * 2;
const clamp = kit.clamp, ease = kit.ease;
const BOB_L = 31, BOB_HW = 14.5, BOB_HH = 16.5, AMP = 0.105;
const KH = 1.45, KM = 1.05;
const MW_TOP = 80, MW_TRAVEL = 26;          // minute weight: hook y at :00, travel over the hour
const SW_TOP = 82, CROAK_DROP = 1.4;        // strike weight
const RING = kit.hex('#ffc860');

/** Flip angle for a turn at t = 0, given seconds from the turn and half-length h. */
function flipPhi(dt, h, wob) {
  if (dt <= -h) return 0;
  const p = clamp((dt + h) / (2 * h));
  let phi = Math.PI * ease.inOut(p);
  if (dt > 0 && wob) phi += wob * Math.exp(-dt * 2.6) * Math.sin(dt * 9) * clamp(dt * 3); // settles on its stop
  return phi;
}

function showLen(n) { return 1.25 + n * 0.85 + 0.9; }

export default {
  name: 'Cuckoo',
  blurb: 'a carved Black Forest cuckoo clock: hours on walnut plaques, minutes swinging on the pendulum; the rainbow frog croaks the hour',
  layouts: ['hub-tall'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) {
    const d = ctx.date, ms = d.getTime();
    const sec = kit.secOf(d), min = d.getMinutes(), hr = d.getHours();
    const hourAge = min * 60 + sec;
    const night = ctx.night, tsec = ms / 1000;
    const lamp = (1 - 0.6 * night) * (1 + 0.035 * Math.sin(tsec * 7.3) * Math.sin(tsec * 2.9 + 1) + 0.02 * Math.sin(tsec * 13.1));
    const lit = 1 - 0.35 * night;

    // the carved case under the lamp
    for (let p = 0; p < img.length; p++) img[p] = STATIC[p] * lamp;

    // ---- the escapement: a tooth per beat, snapping round with a little recoil
    const beat = ms / 1000, bf = beat - Math.floor(beat);
    const snap = bf < 0.12 ? ease.outBack(bf / 0.12) : 1;
    escapeWheel(ESC.x, ESC.y, ESC.r, Math.floor(beat) + snap, lamp * lit);

    // ---- minute and hour cards, flip state
    const prevMinute = new Date(ms - 60000), nextMinute = new Date(ms + 60000);
    const nearEnd = sec > 30;
    const mA = nearEnd ? d : prevMinute, mB = nearEnd ? nextMinute : d;  // front (old) / back (new)
    const dtM = nearEnd ? sec - 60 : sec;
    const phiM = flipPhi(dtM, 0.7, 0.35);
    const hNearEnd = hourAge > 1800;
    const dtH = hNearEnd ? hourAge - 3600 : hourAge;
    const phiH = flipPhi(dtH, 0.9, 0.5);
    const mins = (x) => [Math.floor(x.getMinutes() / 10), x.getMinutes() % 10];
    const hrs = (x) => [Math.floor(x.getHours() / 10), x.getHours() % 10];
    const hA = hrs(hNearEnd ? d : new Date(ms - 3600000)), hB = hrs(hNearEnd ? new Date(ms + 3600000) : d);

    // ---- the hour show
    const n12 = (hr % 12) || 12, show = showLen(n12);
    const inShow = hourAge < show + 4;
    let doorQ = 0, frogS = 0, croak = 0, ringT = -1, croaksDone = 0;
    if (hourAge < show) {
      const t = hourAge;
      doorQ = 1.75 * (t < 0.3 ? ease.outBack(t / 0.3) : t > show - 0.45 ? 1 - ease.inOut((t - show + 0.45) / 0.45) : 1);
      frogS = t < 0.2 ? 0 : t < 0.75 ? ease.outBack((t - 0.2) / 0.55) : t > show - 0.95 ? 1 - ease.in(clamp((t - show + 0.95) / 0.5)) : 1;
      for (let i = 0; i < n12; i++) {
        const tc = t - (1.0 + i * 0.85);
        if (tc >= 0) croaksDone = i + 1 - (tc < 0.25 ? 1 - tc / 0.25 : 0);
        if (tc >= 0 && tc < 0.7) { croak = Math.sin(Math.PI * tc / 0.7); ringT = tc; }
      }
    }

    // ---- weights
    const wind = clamp((hourAge - show) / 2.4);
    const windE = ease.inOut(wind);
    const mwRun = MW_TOP + MW_TRAVEL * (hourAge / 3600);
    const mwY = hourAge < show + 2.4 ? kit.lerp(MW_TOP + MW_TRAVEL, mwRun, windE) : mwRun;
    const swDrop = (hourAge < show + 2.4 ? croaksDone * CROAK_DROP * (1 - windE) : 0);
    const swY = SW_TOP + swDrop;
    const ld = lit * lamp;
    chain(CHAIN_X[0], CASE.y1, mwY - 1.5, mwY, ld);
    chain(CHAIN_X[1], CASE.y1, swY - 1.5, swY, ld);
    pinecone(CHAIN_X[0], mwY, ld);
    pinecone(CHAIN_X[1], swY, ld);

    // ---- pendulum (2 s period: one tick a second), the minutes on its bob
    const th = AMP * Math.sin(Math.PI * ((ms % 2000) / 1000));
    const bx = PIVOT.x + BOB_L * Math.sin(th), by = PIVOT.y + BOB_L * Math.cos(th);
    rod(PIVOT.x, PIVOT.y, PIVOT.x + (BOB_L - BOB_HH + 1) * Math.sin(th), PIVOT.y + (BOB_L - BOB_HH + 1) * Math.cos(th), 0.75, P.lime, ld);
    rod(PIVOT.x, PIVOT.y - 0.5, PIVOT.x, PIVOT.y + 0.5, 1.2, P.brass, ld);
    const ma = mins(mA), mb = mins(mB);
    card({ cx: bx, cy: by, hw: BOB_HW, hh: BOB_HH, oval: true, axis: 1, phi: phiM, rho: th,
      front: [[ma[0], -11.2, -8.4, KM], [ma[1], 0.7, -8.4, KM]],
      back: [[mb[0], -11.2, -8.4, KM], [mb[1], 0.7, -8.4, KM]], dim: lit * (0.85 + 0.15 * lamp) });

    // ---- hour plaques
    for (let k = 0; k < 2; k++) {
      const q = PLAQ[k], changes = hA[k] !== hB[k];
      card({ cx: q.cx, cy: q.cy, hw: PLAQ_HW, hh: PLAQ_HH, oval: false, axis: 0, phi: changes ? phiH : 0, rho: 0,
        front: [[hA[k], -7.25, -11.6, KH]], back: [[hB[k], -7.25, -11.6, KH]], dim: lit * (0.85 + 0.15 * lamp) });
    }

    // ---- the carved bird on the ridge beats its wings with every croak
    const flap = 0.6 * croak + 0.06 * Math.sin(tsec * 1.7);
    for (const sd of [-1, 1]) {
      const a = -Math.PI / 2 + sd * (1.3 - flap), px = 31.5 + sd * 0.6, py = 4.2;
      const tx = px + 5.4 * Math.cos(a), ty = py + 5.4 * Math.sin(a);
      rod(px, py, (px + tx) / 2, (py + ty) / 2, 1.2, P.leaf, ld * 1.3);
      rod((px + tx) / 2, (py + ty) / 2, tx, ty, 0.7, P.leaf, ld * 1.3);
    }

    // ---- door and frog
    if (frogS > 0.01) {
      const bob = Math.sin(hourAge * 6) * 0.3 * frogS;
      const fy = DOOR.top + 9 - 2.5 * frogS + bob + 0.6 * croak;
      frog(DOOR.cx, fy, 0.55 + 0.45 * frogS, croak, Math.sin(hourAge * 1.3), 0, lit);
      if (ringT >= 0) for (let j = 0; j < 3; j++) {
        const rt = ringT - j * 0.12;
        if (rt > 0) rings(DOOR.cx, fy + 5, 8 + rt * 34, (1 - rt / 0.7) * 0.55 * lit, RING);
      }
    }
    doorLeaf(DOOR.cx - DOOR.hw, 1, DOOR.top, DOOR.bot, DOOR.hw, doorQ, ld);
    doorLeaf(DOOR.cx + DOOR.hw, -1, DOOR.top, DOOR.bot, DOOR.hw, doorQ, ld);

    kit.blitGrid(ctx, img);
  },
};
