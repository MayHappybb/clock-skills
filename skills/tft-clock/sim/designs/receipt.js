// Receipt: a macro shot of a thermal till printer on a shop counter. The
// camera sits a few centimetres from the paper, so the shop behind is only
// soft bokeh, and the slip fills the frame.
//
// Each minute is one sale. At :00 the printer chatters a fresh slip up out
// of its slot, line by line: shop header, date, a transaction number (the
// minute of the day), HOURS and MINUTES as line items, then TOTAL in the
// printer's quadruple-height type, a real ITF barcode of HHMM and THANK YOU.
// The paper stands up and curls back over itself at the top, so earlier
// lines roll away into the curl, foreshortened and shaded, while the total
// hangs flat above the tear bar. At :57 an unseen hand tears it off along
// the teeth (the tear zips across), and the slip tips forward, rolls up and
// drops past the printer. The jagged stub left behind is the top of the
// next slip. On the hour the slip carries an inverse-printed END OF HOUR
// band (END OF DAY at midnight).
//
// Rendering: the slip is a 1-bit mask (receipt-slip.js) drawn row by row
// through a bent-paper model (straight, then a cylinder of radius R, then a
// rigid tumble while falling), each row as a few 1-pixel fills shaded by
// how far that strip of paper faces up. Hard pixels everywhere: thermal
// print is crisp dots, and a dead heating element leaves its white column.
// The bokeh is the only anti-aliased, blended thing.
//
// Palette: thermal paper and its purple-black print against a shop that
// follows the day: teal-grey and window-white by day, amber and rose at
// dusk, a navy night with the store's neon (pink, cyan, amber) out of focus.

import { mix, scale, hex, rand, rng, sin, clamp, ease, font3x5 } from '../js/kit.js';
import { buildSlip, fedAt, PW, TEETH } from './receipt-slip.js';

const X0 = 26;               // paper's left edge on screen
const YS = 71;               // the slot: first screen row of the printer
const S0 = 62;               // paper that stands straight before it bends (= the slip's tail)
const R0 = 11;               // curl radius at rest
const HALF = Math.PI / 2;

const TEAR0 = 57.75, TEAR1 = 58.15, PRINT0 = 0.12;

// ------------------------------------------------------------ the shop by hour
const AMB = [
  // hour, wall top, wall bottom, bokeh colours, paper, light
  [0, '0f1430', '070a18', ['ff4f9a', '3fe0e0', 'ffb347', '8a7dff'], 'dfe4ea', 0.86],
  [5.5, '0f1430', '070a18', ['ff4f9a', '3fe0e0', 'ffb347', '8a7dff'], 'dfe4ea', 0.86],
  [7, '6a6f8a', '3a3550', ['ffd9a0', 'ffe9c8', 'ff9e7a', 'bcd6ff'], 'efece4', 0.95],
  [9, '6f9c9a', '2f5458', ['fffbe8', 'fff0c0', 'd8f0ff', 'ffe0a8'], 'f4f1e8', 1.0],
  [16, '6f9c9a', '2f5458', ['fffbe8', 'fff0c0', 'd8f0ff', 'ffe0a8'], 'f4f1e8', 1.0],
  [18.5, '7a4a62', '2c1e3c', ['ffb347', 'ff7a8a', 'ffd9a0', 'ff4f9a'], 'f2e6dc', 0.95],
  [20.5, '0f1430', '070a18', ['ff4f9a', '3fe0e0', 'ffb347', '8a7dff'], 'dfe4ea', 0.86],
  [24, '0f1430', '070a18', ['ff4f9a', '3fe0e0', 'ffb347', '8a7dff'], 'dfe4ea', 0.86],
].map(([h, a, b, k, p, l]) => ({ h, top: hex(a), bot: hex(b), bok: k.map(hex), paper: hex(p), light: l }));

function ambient(hr) {
  let k = 1;
  while (AMB[k].h < hr) k++;
  const a = AMB[k - 1], b = AMB[k], u = (hr - a.h) / (b.h - a.h || 1);
  return {
    top: mix(a.top, b.top, u), bot: mix(a.bot, b.bot, u),
    bok: a.bok.map((c, i) => mix(c, b.bok[i], u)),
    paper: mix(a.paper, b.paper, u), light: a.light + (b.light - a.light) * u,
  };
}

const INK = hex('2a2634');
const BACK = hex('c9c6bd');          // the unprinted back of the paper
const SLOT = hex('0b0b0e');
const BODY = hex('2b2d33'), BODY_HI = hex('4a4e58'), BODY_LO = hex('1c1d22');
const STEEL = hex('a9afb8'), STEEL_LO = hex('6c727c');

// Bokeh: fixed discs drifting slowly sideways (traffic and shoppers beyond the glass).
const BOKEH = (() => {
  const r = rng(1807);
  return Array.from({ length: 14 }, (_, i) => ({
    x: r() * 220, y: 4 + r() * 70, rad: 3 + r() * 7, v: (r() < 0.5 ? -1 : 1) * (1.5 + r() * 5),
    col: i % 4, a: 0.16 + r() * 0.22,
  }));
})();

// ------------------------------------------------------------ the slip cache
const SLIPS = new Map();
function slipFor(f) {
  let s = SLIPS.get(f.minuteKey);
  if (!s) {
    s = buildSlip(f);
    SLIPS.set(f.minuteKey, s);
    if (SLIPS.size > 4) SLIPS.delete(SLIPS.keys().next().value);
  }
  return s;
}

// ------------------------------------------------------------ paper geometry

/**
 * Where the strip of paper `s` rows up from the slot is, for paper that
 * stands straight for s0 rows and then curls back on a cylinder of radius R.
 * Returns height above the slot u, depth d (away from the viewer) and the
 * face angle phi (0 facing the viewer, + tipped back to face up).
 */
function bent(s, s0, R) {
  if (s <= s0) return [s, 0, 0];
  const th = (s - s0) / R;
  return [s0 + R * Math.sin(th), R * (1 - Math.cos(th)), th];
}

/** Paper brightness for a face angle: a sheen as it tips toward the ceiling light, shade near edge-on. */
function shade(phi) {
  if (phi >= 0) return 1 + 0.1 * Math.sin(Math.min(phi * 1.8, Math.PI)) - 0.38 * clamp((phi - 0.95) / 0.62, 0, 1);
  return 1 - 0.5 * Math.sin(Math.min(-phi, HALF));
}

/** One slip row as fills: paper runs then ink runs, with a per-row x offset. */
function drawRuns(g, runs, x, y, paperC, inkC, back) {
  for (let i = 0; i < runs.length; i += 3) {
    const v = runs[i + 2];
    g.fillRect(x + runs[i], y, runs[i + 1], 1, back || v === 1 ? paperC : inkC);
  }
}

// ------------------------------------------------------------ scenery

function background(g, amb, T) {
  g.gradient(0, 0, 160, 80, [amb.top, amb.bot]);
  for (const b of BOKEH) {
    let x = (b.x + b.v * T) % 220;
    if (x < 0) x += 220;
    x -= 30;
    const c = amb.bok[b.col];
    g.fillCircle(x, b.y, b.rad, c, { a: b.a, aa: true });
    g.ring(x, b.y, b.rad - 1, b.rad, c, { a: b.a * 0.7, aa: true });
  }
}

function printer(g, busy, sec, amb) {
  const shake = busy && (Math.floor(sec * 30) & 1) ? 1 : 0;
  const y = YS + shake;
  g.fillRoundRect(3, y, 154, 14, 3, BODY);
  g.fillRect(5, y, 150, 1, BODY_HI);
  g.fillRect(3, y + 7, 154, 2, BODY_LO);
  // the tear bar: a steel strip whose teeth stand up in front of the paper,
  // and the dark mouth of the slot under it
  g.fillRect(X0 - 3, y, PW + 6, 1, STEEL_LO);
  for (let x = X0 - 2; x < X0 + PW + 2; x++) {
    const p = ((x - X0) % 6 + 6) % 6;
    if (p === 2 || p === 3) g.pixel(x, y - 1, STEEL);
    else if (p === 1 || p === 4) g.pixel(x, y - 1, STEEL_LO, { a: 0.6 });
  }
  g.fillRect(X0 - 3, y + 1, PW + 6, 1, SLOT);
  // label, feed button, status LED
  g.text('CHRONO-80', 7, y + 3, { font: font3x5, c: BODY_HI });
  g.fillRoundRect(141, y + 3, 11, 4, 1, hex('3a3d45'));
  g.fillRect(142, y + 3, 9, 1, hex('555a64'));
  const led = busy ? (Math.floor(sec * 8) & 1 ? hex('ffb020') : hex('7a5010')) : hex('3ee070');
  g.fillRect(134, y + 4, 2, 2, led);
  g.pixel(134, y + 4, mix(led, 0xffffff, 0.5));
}

// ------------------------------------------------------------ the face

export default {
  name: 'Receipt',
  blurb: 'A thermal till prints each minute as a sale: TOTAL 10:09, barcode and all; it curls, is torn off at :57 and falls.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, sec = f.sec;
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    const hr = f.h + f.m / 60 + sec / 3600;
    const amb = ambient(hr);
    const T = f.h * 3600 + f.m * 60 + sec;
    background(g, amb, T);

    const slip = slipFor(f);
    const P = scale(amb.paper, amb.light);

    // Curl: breathing, plus one gust a minute at a seeded moment.
    const gustAt = 12 + rand(f.minuteKey, 7) * 30;
    const ge = clamp(1 - Math.abs(sec - gustAt - 1.2) / 1.2, 0, 1);
    const R = R0 + 1.6 * sin((T / 4.7) * Math.PI * 2) + 2.6 * ge * sin((sec - gustAt) * Math.PI * 2 * 2.2);
    const sway = 1.6 * ge * sin((sec - gustAt) * Math.PI * 2 * 1.1) + 0.6 * sin((T / 7.9) * Math.PI * 2);

    const feed = fedAt(slip, sec - PRINT0);
    const busy = feed.busy && sec < TEAR0;
    const L = sec >= TEAR0 ? slip.h : feed.L;

    // The paper at rest or being torn: behind the printer's front.
    const torn = sec >= TEAR1;
    if (!torn) {
      const tug = sec >= TEAR0 ? (sec - TEAR0) / (TEAR1 - TEAR0) : 0;
      this.hanging(g, slip, L, R, sway - 3 * ease.inQuad(tug), P);
      if (tug > 0) {
        // the tear zips across from the right: a dark line along the teeth
        const front = PW * (1 - ease.inOutQuad(tug));
        for (let x = Math.ceil(front); x < PW; x++) {
          const k = TEETH - [2, 1, 0, 0, 1, 2][x % 6];
          g.pixel(X0 + x, YS - 1 - k, SLOT);
        }
      }
    } else {
      // the stub: the next slip's teeth, waiting in the slot
      for (let j = 0; j < TEETH; j++) drawRuns(g, slip.rows[j], X0, YS - TEETH + j, scale(P, 0.92), INK, false);
    }

    printer(g, busy, sec, amb);

    if (torn) this.falling(g, slip, sec - TEAR1, R, P);
  },

  /** The slip standing in the slot, `L` rows out, curling back at the top. */
  hanging(g, slip, L, R, sway, P) {
    const top = S0 + R * HALF;
    const r0 = Math.max(0, Math.floor(L - top));
    let lastY = -1;
    for (let r = r0; r < L; r++) {
      const s = L - r - 0.5;
      if (s < 0) continue;
      const [u, , phi] = bent(s, S0, R);
      if (phi >= HALF) continue;
      const y = Math.floor(YS - u);
      if (y < 0 || y >= YS) continue;
      // in the curl several rows land on one screen row: keep the nearest (drawn last)
      lastY = y;
      const lift = u / YS;
      const b = shade(phi) * (1.02 - 0.06 * (1 - lift)) * (s < 2 ? 0.9 : 1);
      const pc = scale(P, b);
      const ic = mix(INK, pc, clamp(1 - Math.cos(phi), 0, 1) * 0.75);
      const x = X0 + Math.round(sway * lift * lift);
      drawRuns(g, slip.rows[Math.min(r, slip.h - 1)], x, y, pc, ic, false);
    }
    return lastY;
  },

  /** The torn slip `tf` seconds after it came free: a lift, then it tips forward, rolls up and drops. */
  falling(g, slip, tf, R, P) {
    const lift = 3 * ease.outQuad(clamp(tf / 0.14, 0, 1));
    const td = Math.max(0, tf - 0.16);
    const drop = 0.5 * 150 * td * td;
    const psi = 1.1 * ease.inOutQuad(clamp((tf - 0.1) / 1.4, 0, 1));   // forward tumble
    const roll = ease.outQuad(clamp(tf / 1.1, 0, 1));
    const s0 = S0 * (1 - 0.35 * roll), Rc = R * (1 - 0.35 * roll);      // the curl tightens downward
    const cp = Math.cos(psi), sp = Math.sin(psi);
    const dx = -3 - 9 * td, shear = -0.22 * ease.inOutQuad(clamp(tf / 1.3, 0, 1));
    const h = slip.h, top = s0 + Rc * (HALF + psi * 0.8);
    // nearest last: after a forward tumble the top of the slip is nearest
    for (let r = h - 1; r >= 0; r--) {
      const s = h - r - 0.5;
      if (s > top) break;
      const [u, d, th] = bent(s, s0, Rc);
      const u2 = u * cp + d * sp;
      const phi = th - psi;
      const y = Math.floor(YS - u2 - lift + drop);
      if (y < 0 || y >= 80) continue;
      const back = Math.abs(phi) >= HALF;
      const b = back ? 0.85 : shade(phi);
      const pc = scale(back ? BACK : P, b);
      const ic = mix(INK, pc, clamp(1 - Math.cos(phi), 0, 1) * 0.75);
      const runs = r >= h - TEETH ? slip.torn[r - (h - TEETH)] : slip.rows[r];
      drawRuns(g, runs, X0 + Math.round(dx + shear * u2), y, pc, ic, back);
    }
  },
};
