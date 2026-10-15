// Harbour: the time is four numbered crates on a barge. At the minute a
// quay crane swaps the crates that change: before the turn it lifts the old
// ones off onto trucks that drive away; after it, trucks bring the new ones
// and the crane sets them down. A slot is only ever empty or right, never a
// wrong digit: removals all finish before :00, placements all start after.
//
// The sky follows the real time of day (dawn, day, sunset, night with stars
// and floodlights), the barge rides the swell, gulls cross now and then, the
// boom-tip beacon blinks each second.
//
// Hard pixels throughout, a palette per time of day; the sky and sea are
// dithered gradients, the only place in-between colours earn their keep.

import { strokeDigit, font3x5, mix, scale, hex, rand, rng, sin, ease, clamp, previousMinute, clockFields, sprite } from '../js/kit.js';

// ------------------------------------------------------------ layout (pixels)
const BOOM = 1;              // boom rows 1..3
const TOP = 7;               // spreader row when raised: a hung crate clears the deck crates
const CW = 22, CH = 26;      // crate
const DECK = 64;             // deck surface; a crate on deck has its top at DECK - CH + bob
const TRUCK_TOP = 32;        // crate top when on a truck bed (bed at y 58)
const YARD_CX = 24;          // crane parks over the truck bay, between the legs
const PARK = 11;             // truck bed x when parked under the crane
const AWAY = -40;            // truck bed x off-screen
const SLOT_X = [50, 74, 104, 128];
const cx = (i) => SLOT_X[i] + CW / 2;

const CRATE = ['2f6db5', 'c0392b', '2e8b57', 'd9822b', '7d3c98', '1f8a8a', 'b03a5b', '55687a', 'a8761b', '3b4ba8'].map(hex);
const PAINT = hex('f2ead8');
const CRANE = hex('e2a51f');
const HULL = hex('3a2a2c'), BOOT = hex('8a2e2a');
const CONCRETE = hex('8a8a84'), WALL = hex('4a4a48');

// ------------------------------------------------------------ the sky by hour
const SKY = [
  [0, '070b1e', '172347'], [5, '0a1030', '26305a'], [6, '2b2f63', 'e88a5a'], [7, '4a78c0', 'f4c48a'],
  [9, '3d7fd6', 'a9d6f5'], [16, '3d7fd6', 'b4dcf7'], [18, '3c3f88', 'ff9a55'], [19, '1e2152', 'b05a5a'],
  [20.5, '0b1028', '1f2a50'], [24, '070b1e', '172347'],
].map(([h, a, b]) => [h, hex(a), hex(b)]);
const LIT = [[0, 0.42], [5.5, 0.42], [7, 1], [17.5, 1], [19.5, 0.42], [24, 0.42]];

function keyed(table, h, pick) {
  let k = 1;
  while (table[k][0] < h) k++;
  const a = table[k - 1], b = table[k], u = (h - a[0]) / (b[0] - a[0]);
  return pick(a, b, u);
}

function skyAt(h) {
  const [top, hor] = keyed(SKY, h, (a, b, u) => [mix(a[1], b[1], u), mix(a[2], b[2], u)]);
  const lit = keyed(LIT, h, (a, b, u) => a[1] + (b[1] - a[1]) * u);
  return { top, hor, lit, dark: clamp((1 - lit) / 0.58, 0, 1) };
}

// ------------------------------------------------------------ the crane's day
const travel = (i) => Math.max(0.7, Math.abs(cx(i) - YARD_CX) / 75);

/**
 * One crane cycle as steps: each moves the trolley (x) and the spreader
 * (row: 'top' | 'slot' | 'truck') over `d` seconds; `carry` while a crate
 * hangs on it. Removal: slot -> truck. Placement: truck -> slot.
 */
function cycle(kind, i) {
  const T = travel(i), X = cx(i), Y = YARD_CX;
  if (kind === 'remove') return {
    truckIn: [-0.2 - 1.2, 1.2],     // relative to the step 'lowerT' (filled in below)
    steps: [
      { d: T, x: [Y, X], s: ['top', 'top'] },
      { d: 0.75, x: [X, X], s: ['top', 'slot'] },
      { d: 0.25, x: [X, X], s: ['slot', 'slot'], tag: 'grab' },
      { d: 0.75, x: [X, X], s: ['slot', 'top'], carry: true, tag: 'lift' },
      { d: T, x: [X, Y], s: ['top', 'top'], carry: true },
      { d: 0.6, x: [Y, Y], s: ['top', 'truck'], carry: true, tag: 'lowerT' },
      { d: 0.25, x: [Y, Y], s: ['truck', 'truck'], tag: 'release' },
      { d: 0.6, x: [Y, Y], s: ['truck', 'top'] },
    ],
  };
  return {
    steps: [
      { d: 1.2, x: [Y, Y], s: ['top', 'top'], tag: 'truckIn' },
      { d: 0.6, x: [Y, Y], s: ['top', 'truck'] },
      { d: 0.25, x: [Y, Y], s: ['truck', 'truck'], tag: 'grab' },
      { d: 0.6, x: [Y, Y], s: ['truck', 'top'], carry: true, tag: 'raiseT' },
      { d: T, x: [Y, X], s: ['top', 'top'], carry: true },
      { d: 0.75, x: [X, X], s: ['top', 'slot'], carry: true, tag: 'land' },
      { d: 0.25, x: [X, X], s: ['slot', 'slot'] },
      { d: 0.75, x: [X, X], s: ['slot', 'top'] },
      { d: T, x: [X, Y], s: ['top', 'top'] },
    ],
  };
}

/** Start time of the step tagged `tag` within a cycle starting at t0. */
function tagAt(c, t0, tag, end = false) {
  let t = t0;
  for (const s of c.steps) { if (s.tag === tag) return end ? t + s.d : t; t += s.d; }
  return t;
}
const dur = (c) => c.steps.reduce((a, s) => a + s.d, 0);

/** The jobs of the minute whose clock fields are `cur` (seconds from its start). */
function jobsFor(prev, cur, next) {
  const a = prev.hh + prev.mm, b = cur.hh + cur.mm, c = next.hh + next.mm;
  const jobs = [];
  // Placements, left first, from 0.8 s (the last removal's truck is gone by then).
  let t = 0.8;
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) { const cy = cycle('place', i); jobs.push({ kind: 'place', i, digit: +b[i], t0: t, c: cy }); t += dur(cy); }
  // Removals, right first, ending at 59.5 s.
  const rem = [];
  for (let i = 3; i >= 0; i--) if (b[i] !== c[i]) rem.push({ kind: 'remove', i, digit: +b[i], c: cycle('remove', i) });
  let end = 59.5;
  for (let k = rem.length - 1; k >= 0; k--) { end -= dur(rem[k].c); rem[k].t0 = end; }
  return [...jobs, ...rem];
}

// ------------------------------------------------------------ drawing helpers
function crate(g, x, y, digit, lit) {
  const base = scale(CRATE[digit], lit), dark = scale(CRATE[digit], lit * 0.62);
  g.fillRect(x, y, CW, CH, base);
  for (let k = x + 2; k < x + CW - 1; k += 3) g.vline(k, y + 1, CH - 2, dark);
  g.rect(x, y, CW, CH, dark);
  for (const [px, py] of [[x, y], [x + CW - 2, y], [x, y + CH - 2], [x + CW - 2, y + CH - 2]]) g.fillRect(px, py, 2, 2, scale(dark, 0.7));
  strokeDigit(g, digit, x + 4, y + 3, 14, 20, { weight: 3, c: scale(PAINT, lit) });
}

function truck(g, bx, lit) {
  const body = scale(hex('3e7a4c'), lit), cab = scale(hex('4f9a60'), lit), tyre = scale(hex('1a1a1c'), lit);
  g.fillRect(bx, 58, 26, 2, scale(hex('5a5a5e'), lit));          // bed
  g.fillRect(bx + 1, 60, 24, 1, scale(hex('2a2a2e'), lit));      // chassis
  g.fillRect(bx - 9, 51, 9, 9, cab);                             // cab, facing left
  g.fillRect(bx - 8, 52, 4, 3, scale(hex('a8d8f0'), Math.max(lit, 0.55)));  // window
  g.fillRect(bx - 9, 59, 9, 2, body);
  for (const wx of [bx - 6, bx + 5, bx + 20]) { g.fillCircle(wx, 62, 2, tyre); g.pixel(wx - 0.5, 61.5, scale(hex('777'), lit)); }
}

const GULL = [sprite(`
  #...#
  .#.#.
  ..#..`), sprite(`
  .###.
  #.#.#`)];

export default {
  name: 'Harbour',
  blurb: 'A quay crane swaps the numbered crates on a barge each minute; the sky follows the real day.',
  fps: 30,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    const hour = f.h + f.m / 60 + s / 3600;
    const tod = f.h * 3600 + f.m * 60 + s;
    const sky = skyAt(hour), lit = sky.lit;
    // The barge and the truck bay are floodlit at night, so the crates keep reading.
    const flood = lit + (1 - lit) * 0.75 * sky.dark;
    ctx.lcd.backlight(1 - 0.7 * ctx.night);

    // ---- sky, sun or moon, stars, clouds
    g.gradient(0, 0, 160, 62, [sky.top, sky.hor], { angle: 90 });
    if (sky.dark > 0) {
      const r = rng(7);
      for (let k = 0; k < 34; k++) {
        const x = Math.floor(r() * 160), y = Math.floor(r() * 54);
        const tw = 0.45 + 0.55 * rand(k, Math.floor(tod * 1.5));
        g.pixel(x, y, mix(sky.top, 0xffffff, sky.dark * tw * (0.5 + 0.5 * r())));
      }
    }
    if (hour > 5.7 && hour < 18.7) {
      const u = (hour - 6) / 12, x = -8 + u * 176, y = 62 - 50 * sin(Math.PI * clamp(u, 0, 1));
      g.fillCircle(x, y, 5, mix(hex('fff0b0'), hex('ff7a40'), clamp(1 - (62 - y) / 22, 0, 1)));
    } else {
      const u = (((hour - 19) + 24) % 24) / 10.5, x = -8 + u * 176, y = 62 - 46 * sin(Math.PI * clamp(u, 0, 1));
      g.fillCircle(x, y, 4, hex('e8e4d0'));
      g.fillCircle(x + 2, y - 1, 3.4, mix(sky.top, sky.hor, clamp(y / 62, 0, 1)));   // crescent
    }
    const cloud = mix(0xffffff, sky.hor, 0.35 + 0.4 * sky.dark);
    for (let k = 0; k < 3; k++) {
      const x = ((rand(k, 3) * 220 + tod * (1.2 + k * 0.5)) % 230) - 40, y = 8 + k * 9 + Math.floor(rand(k, 4) * 6);
      const o = { a: 0.85 - 0.45 * sky.dark };
      g.fillEllipse(x + 10, y + 3, 10, 3, cloud, o);
      g.fillCircle(x + 7, y + 1, 4, cloud, o);
      g.fillCircle(x + 13, y, 5, cloud, o);
    }

    // ---- the far sea behind the barge
    g.gradient(0, 60, 160, 6, [mix(sky.hor, sky.top, 0.25), scale(mix(sky.hor, sky.top, 0.6), 0.8)], { angle: 90 });

    // ---- the crane's state
    const prev = previousMinute(ctx.date), next = clockFields(new Date(ctx.date.getTime() + 60000));
    const bob = Math.round(0.85 * sin((tod * 2 * Math.PI) / 5.3));
    const jobs = jobsFor(prev, f, next);
    const prevJobs = jobsFor(previousMinute(new Date(ctx.date.getTime() - 60000)), prev, f).map((j) => ({ ...j, t0: j.t0 - 60 }));
    const digits = (f.hh + f.mm).split('').map(Number);
    const slot = digits.map((d) => d);   // what each slot holds now (null = empty)
    for (const j of jobs) {
      if (j.kind === 'place' && s < tagAt(j.c, j.t0, 'land', true)) slot[j.i] = null;
      if (j.kind === 'remove' && s >= tagAt(j.c, j.t0, 'lift')) slot[j.i] = null;
    }
    const rowOf = (name) => (name === 'top' ? TOP : name === 'truck' ? TRUCK_TOP - 2 : DECK - CH + bob - 2);
    let tx = YARD_CX, sp = TOP, load = null, lagX = YARD_CX;
    const trolleyAt = (tt) => {
      for (const j of jobs) {
        let t = j.t0;
        if (tt < t || tt > t + dur(j.c)) continue;
        for (const st of j.c.steps) {
          if (tt <= t + st.d) {
            const u = st.d ? ease.inOutCubic((tt - t) / st.d) : 1;
            return { x: st.x[0] + (st.x[1] - st.x[0]) * u, s: rowOf(st.s[0]) + (rowOf(st.s[1]) - rowOf(st.s[0])) * u, carry: st.carry ? j.digit : null };
          }
          t += st.d;
        }
      }
      return { x: YARD_CX, s: TOP, carry: null };
    };
    const now = trolleyAt(s);
    tx = now.x; sp = Math.round(now.s); load = now.carry;
    lagX = trolleyAt(s - 0.12).x;

    // Trucks: this minute's and any from the last minute still driving off.
    const trucks = [];
    for (const j of [...prevJobs, ...jobs]) {
      if (j.kind === 'remove') {
        const inEnd = tagAt(j.c, j.t0, 'lowerT') - 0.2, outStart = tagAt(j.c, j.t0, 'release', true) + 0.1;
        trucks.push({ in: [inEnd - 1.2, inEnd], out: [outStart, outStart + 1.4], crate: s >= outStart - 0.1 ? j.digit : null });
      } else {
        const inStart = j.t0, outStart = tagAt(j.c, j.t0, 'raiseT', true);
        trucks.push({ in: [inStart, inStart + 1.2], out: [outStart, outStart + 1.4], crate: s < tagAt(j.c, j.t0, 'grab', true) ? j.digit : null });
      }
    }

    // ---- crane legs and bracing (behind)
    const crane = scale(CRANE, lit), craneDark = scale(CRANE, lit * 0.6);
    g.line(6, 12, 34, 40, craneDark).line(6, 40, 34, 12, craneDark);
    g.fillRect(3, BOOM + 3, 3, DECK - BOOM - 3, crane).fillRect(35, BOOM + 3, 3, DECK - BOOM - 3, crane);

    // ---- barge, deck crates, colon lamps
    g.fillPolygon([[46, 64 + bob], [157, 64 + bob], [152, 72 + bob], [50, 72 + bob]], scale(HULL, lit));
    g.fillRect(48, 69 + bob, 106, 2, scale(BOOT, lit));
    g.text('LCD-1', 54, 65 + bob, { font: font3x5, c: scale(PAINT, lit * 0.8) });
    for (let i = 0; i < 4; i++) if (slot[i] !== null) crate(g, SLOT_X[i], DECK - CH + bob, slot[i], flood);
    g.vline(100, 42 + bob, 22, scale(hex('9a9a9a'), lit));
    for (const ly of [45, 55]) {
      g.fillCircle(100.5, ly + bob + 0.5, 2.6, hex('ffb347'), { a: 0.25 + 0.3 * sky.dark });
      g.fillRect(99, ly - 1 + bob, 3, 3, hex('ffb347'));
    }

    // ---- quay
    g.fillRect(0, 64, 46, 5, scale(CONCRETE, lit)).fillRect(0, 69, 44, 11, scale(WALL, lit));
    g.hline(0, 64, 46, scale(CONCRETE, lit * 1.15));
    g.fillRect(40, 61, 3, 3, scale(hex('2a2a2a'), lit));

    // ---- trucks and the crates they carry
    for (const tr of trucks) {
      let bx;
      if (s < tr.in[0] || s > tr.out[1]) continue;
      if (s < tr.in[1]) bx = AWAY + (PARK - AWAY) * ease.outCubic((s - tr.in[0]) / 1.2);
      else if (s < tr.out[0]) bx = PARK;
      else bx = PARK + (AWAY - PARK) * ease.inCubic((s - tr.out[0]) / 1.4);
      bx = Math.round(bx);
      truck(g, bx, lit);
      if (tr.crate !== null) crate(g, bx + 2, TRUCK_TOP, tr.crate, flood);
    }

    // ---- what hangs from the crane: spreader, ropes, a crate
    const lx = Math.round(lagX + (tx - lagX) * 0.4);
    if (load !== null) crate(g, lx - CW / 2, sp + 2, load, flood);
    const rope = scale(hex('303034'), Math.max(lit, 0.6));
    g.line(Math.round(tx) - 4, BOOM + 5, lx - 8, sp, rope).line(Math.round(tx) + 3, BOOM + 5, lx + 7, sp, rope);
    g.fillRect(lx - 11, sp, CW, 2, scale(hex('cfcfc6'), lit));

    // ---- boom and trolley, beacon
    g.fillRect(0, BOOM, 160, 3, crane);
    for (let x = 1; x < 160; x += 4) g.pixel(x, BOOM + 1, craneDark);
    g.fillRect(Math.round(tx) - 6, BOOM + 3, 12, 3, craneDark);
    g.fillRect(Math.round(tx) - 2, BOOM + 4, 3, 1, sky.dark > 0.3 ? hex('ffe08a') : scale(hex('a8d8f0'), lit));
    if (s % 1 < 0.18) {
      g.fillCircle(157, BOOM + 5, 3, hex('ff3020'), { a: 0.35 });
      g.fillRect(156, BOOM + 4, 2, 2, hex('ff3020'));
    } else g.fillRect(156, BOOM + 4, 2, 2, scale(hex('6a1a14'), Math.max(lit, 0.7)));

    // ---- near water with moving glints
    const sea = scale(mix(sky.hor, sky.top, 0.55), 0.75), deep = scale(sky.top, 0.6);
    g.gradient(44, 71 + Math.max(0, bob), 116, 9 - Math.max(0, bob), [sea, deep], { angle: 90 });
    for (let r = 0; r < 5; r++) {
      const y = 72 + r * 2;
      for (let k = 0; k < 4; k++) {
        const x = Math.floor(((rand(r, k) * 160 + tod * (3 + r * 1.6)) % 190) - 15) + 44;
        g.hline(x, y, 2 + Math.floor(rand(k, r, 9) * 4), mix(sea, sky.hor, 0.55));
      }
    }
    g.fillRect(0, 69, 44, 11, scale(WALL, lit));   // keep the quay wall in front of the glints

    // ---- floodlights at night
    if (sky.dark > 0.05) {
      const warm = hex('ffc870');
      g.fillPolygon([[20, BOOM + 3], [28, BOOM + 3], [40, 64], [6, 64]], warm, { a: 0.13 * sky.dark });
      g.fillPolygon([[96, BOOM + 3], [104, BOOM + 3], [152, 64], [48, 64]], warm, { a: 0.09 * sky.dark });
      for (const lx2 of [24, 100]) g.fillRect(lx2 - 2, BOOM + 3, 4, 1, hex('fff0c0'));
    }

    // ---- a gull now and then, by day
    const p = tod % 37;
    if (sky.dark < 0.6 && p < 9) {
      const gx = 168 - (p / 9) * 196, gy = 16 + Math.round(4 * sin(p * 1.3)) + Math.floor(rand(Math.floor(tod / 37)) * 14);
      g.blit(GULL[Math.floor(tod * 5) % 2], gx, gy, { c: sky.dark > 0.3 ? hex('c8c8d0') : hex('2a2c34') });
    }
  },
};
