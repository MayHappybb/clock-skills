// Sea Chart: the glass is a hand-coloured copperplate sea chart, and the
// time is its archipelago. Each numeral is an island whose coast traces the
// digit, drawn as an engraver would: an iron-gall keyline, a band of
// colourist's carmine (hours) or verdigris (minutes) just inside the coast,
// an ochre wash over the land, hills in profile with hachure, little woods
// and towns, and three engraved water-lines running offshore round every
// coast (they merge between islands, as on a real chart). The numerals are
// copperplate figures: swelling downstrokes, hairline crossings, ball
// terminals that become round headlands (chart-glyphs.js). Rhumb lines
// radiate from the compass rose; the neat-line is a graduated scale.
//
// Always alive: the water-lines lap in and out round the coasts; a ship in
// profile sails her dotted track and back (flipping flat as she goes about,
// pennant streaming); every 20 s a whale surfaces in the strait, spouts an
// engraved fountain and dives, flukes up.
//
// Minute: from :58.45 the sea rises over the old island; it takes the low
// ground first, so the island breaks into islets and is gone by :59.85,
// water-lines and all. Then the cartographer's quill flies in and draws the
// new coast along the numeral's pen path (the island grows behind the nib,
// bare inked paper), and the colourist's wash floods in behind it. Several
// changed digits are drawn in turn, left to right; nothing new appears
// before :00, so the time is never wrong, only incomplete.
// Hour: a storm. From :54 the sky (a wind-head in an engraved cloud) blows
// in over the rose, rain is hatched across the sea, the ship pitches and is
// blown west, the lightning strikes as the old islands drown. After :00 the
// ship sails the coast of each new hour island, charting it as she goes
// (her track becomes the coast), while the quill draws the minutes; the
// storm clears by :05 and she returns to her track.
//
// Palette: the colourist's: rag paper, iron-gall ink, ochre, carmine,
// verdigris, a pale sea-blue wash on the shallows, gold in the rose. Every
// pixel comes from material maps through one 16-entry palette per frame, so
// the storm darkens the sea's engraving and night swaps the whole sheet for
// its cyanotype copy (Prussian blue ground, the drawing in white), a
// deliberate deep blue on a 40 % backlight with the islands lightest.
// Hard pixels for the sheet, the hills and the coast tables (which carry
// their own quarter-pixel AA); kit AA shapes for everything that moves.
//
// Cost: one palette pass over the glass; per island an integer pass over
// its distance table (int8 distance + uint8 pen position, min-merged into a
// shared buffer), then one table lookup per pixel; coast tables composited
// from the palette per frame (~500 integer blends). No per-pixel callbacks.
// Flash: 20 digit tables (2 bytes a pixel) 144 KB, pen paths 10 KB, flood
// noise 4 KB, tip distances 8 KB, sheet map 12.8 KB: ~180 KB.
// Nothing is redrawn outside the canvas per minute.

import { clockFields, to565, clamp, progress, ease, sin, cos, TAU, sprite, hash } from '../js/kit.js';
import { W, H, M, NMAT, DAY, NIGHT, STORM, STORM_NIGHT, BG, SLOTS, GLYPHS, TRACK, mixRGB } from './chart-sheet.js';
import { drawIsles } from './chart-isles.js';
import { MARGIN } from './chart-glyphs.js';
import { ship, quill, windHead, whale } from './chart-actors.js';

const PAL = new Array(NMAT).fill(0), PAL565 = new Uint16Array(NMAT);

// ------------------------------------------------------------ this minute's jobs

const PLANS = new Map();
/** The quill's schedule for the minute `key`: which slots it draws, when. */
function planFor(key) {
  let p = PLANS.get(key);
  if (p) return p;
  const cur = clockFields(new Date(key * 60000)), prv = clockFields(new Date((key - 1) * 60000));
  const nxt = clockFields(new Date((key + 1) * 60000));
  const c = cur.hh + cur.mm, o = prv.hh + prv.mm, n = nxt.hh + nxt.mm;
  const draw = [], sail = [];
  const hourIn = prv.h !== cur.h;
  // the hour's new islands are charted by the ship, sailing their coasts;
  // everything else (and every minute) is drawn by the quill
  let t = 0.3, ts = 0.7;
  for (let k = 0; k < 4; k++) {
    if (c[k] === o[k]) continue;
    const gl = GLYPHS[SLOTS[k].size][+c[k]];
    if (hourIn && k < 2) {
      const dur = gl.len / 50;
      sail.push({ k, digit: +c[k], t0: ts, t1: ts + dur });
      ts += dur + 0.6;
    } else {
      const dur = 0.3 + gl.len / 150;
      draw.push({ k, digit: +c[k], t0: t, t1: t + dur });
      t += dur + 0.24;
    }
  }
  p = { digits: [...c].map(Number), drown: [...c].map((v, k) => v !== n[k]), draw, sail,
    hourIn: prv.h !== cur.h, hourOut: nxt.h !== cur.h };
  PLANS.set(key, p);
  if (PLANS.size > 4) PLANS.delete(PLANS.keys().next().value);
  return p;
}

const DROWN0 = 58.45, DROWN1 = 59.85;

function tipOf(job, f) {
  const slot = SLOTS[job.k], gl = GLYPHS[slot.size][job.digit], pt = gl.path[Math.round(f * 256)];
  return [slot.x - MARGIN + pt.x, slot.y - MARGIN + pt.y];
}
const OFF = [44, -52];

/** The ship's voyage at the hour: { x, y, fx, mix } (mix 0 on patrol, 1 on the voyage), or null. */
function voyageAt(s, plan, key) {
  if (s > 57) { plan = planFor(key + 1); s -= 60; }
  const v = plan.sail;
  if (!v.length || s < -2.2) return null;
  const first = v[0], last = v[v.length - 1];
  if (s > last.t1 + 2.2) return null;
  let p, q;
  if (s < first.t0) { p = tipOf(first, 0); q = tipOf(first, 0.02); }
  else if (s > last.t1) { p = tipOf(last, 1); q = [p[0] + 1, p[1]]; }
  else {
    let j = v[0];
    for (const x of v) if (s >= x.t0) j = x;
    if (s > j.t1) {
      const nx = v[v.indexOf(j) + 1], u = ease.inOutQuad(progress(s, j.t1, nx.t0)), a = tipOf(j, 1), b = tipOf(nx, 0);
      p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; q = b;
    } else {
      const u = progress(s, j.t0, j.t1);
      p = tipOf(j, u); q = tipOf(j, Math.min(1, u + 0.03));
      if (u > 0.97) q = [p[0] + (p[0] - tipOf(j, u - 0.03)[0]), p[1]];
    }
  }
  const dx = q[0] - p[0];
  const mix = ease.inOutQuad(progress(s, -2.2, first.t0)) * (1 - ease.inOutQuad(progress(s, last.t1 + 0.2, last.t1 + 2.2)));
  return { x: p[0], y: p[1], fx: clamp(dx * 1.5, -1, 1) || 1, mix };
}
/** Where the quill's nib is at second s of the minute, or null. */
function quillAt(s, plan, key) {
  if (s > 59.4) { plan = planFor(key + 1); s -= 60; }
  const d = plan.draw;
  if (!d.length) return null;
  const first = d[0], last = d[d.length - 1];
  const fly = (a, b, u) => { u = ease.inOutQuad(clamp(u, 0, 1)); return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; };
  if (s < first.t0) {
    const p = tipOf(first, 0);
    return s < -0.6 ? null : fly([p[0] + OFF[0], p[1] + OFF[1]], p, (s + 0.6) / (first.t0 + 0.6));
  }
  for (let i = 0; i < d.length; i++) {
    const j = d[i];
    if (s <= j.t1) return s >= j.t0 ? tipOf(j, ease.inOutQuad(progress(s, j.t0, j.t1))) : fly(tipOf(d[i - 1], 1), tipOf(j, 0), (s - d[i - 1].t1) / (j.t0 - d[i - 1].t1));
  }
  const p = tipOf(last, 1);
  return s > last.t1 + 0.7 ? null : fly(p, [p[0] + OFF[0], p[1] + OFF[1]], (s - last.t1) / 0.7);
}

// the land's features, chosen per island: hills (engraved profile bumps with
// hachure on the lee side), small woods, and on the hour islands a town
const HILL = [sprite(`
  ..#..
  .#.#.
  #...#`), sprite(`
  .##.
  #..#`)];
const HATCH = [sprite(`
  .....
  ..#..
  ..##.`), null];
const TREE = sprite(`
  .#.
  ###
  .#.`);
const TRUNK = sprite(`
  ...
  ...
  ...
  .#.`);
const TOWN = sprite(`
  .r.
  rrr
  #r#`, { r: 1, '#': 2 });
function hills(g, jobs) {
  const ink = PAL[M.INK], hatch = mixRGB(PAL[M.LAND], PAL[M.INK], 0.45), tree = PAL[M.TREE], red = PAL[M.RED];
  for (let k = 0; k < 4; k++) {
    const job = jobs[k];
    if (!job || job.rise > 10 || job.wash < 0.35) continue;
    const slot = SLOTS[k], gl = GLYPHS[slot.size][job.digit], spr = HILL[slot.size], hs = HATCH[slot.size];
    const a = clamp((job.wash - 0.35) / 0.4, 0, 1) * (1 - job.rise / 10);
    gl.hills.forEach((h, i) => {
      if (job.pen && h.u > job.pen.u) return;
      const kind = hash(job.digit, i, slot.size) % 6;
      const cx = slot.x - MARGIN + h.x, cy = slot.y - MARGIN + h.y;
      if (kind === 5 && slot.size === 0 && i % 3 === 1) {
        const x = Math.round(cx - 1.5), y = Math.round(cy - 1.5);
        g.blit(TOWN, x, y, { c: red, a }); g.fillRect(x, y + 2, 1, 1, ink, { a }); g.fillRect(x + 2, y + 2, 1, 1, ink, { a });
      } else if (kind >= 4) {
        const x = Math.round(cx - 1.5), y = Math.round(cy - 2);
        g.blit(TREE, x, y, { c: tree, a });
        g.blit(TRUNK, x, y, { c: ink, a });
      } else {
        const x = Math.round(cx - spr.w / 2), y = Math.round(cy - spr.h / 2);
        if (hs) g.blit(hs, x, y, { c: hatch, a });
        g.blit(spr, x, y, { c: ink, a });
      }
    });
  }
}

export default {
  name: 'Sea Chart',
  blurb: 'A hand-coloured copperplate sea chart: the time is an archipelago; each minute the sea takes the old island and the quill draws the new coast.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, night = ctx.night;
    ctx.lcd.backlight(1 - 0.6 * night);
    const plan = planFor(f.minuteKey);

    // ---- the storm (hour): T is seconds from the hour turn
    const T = plan.hourOut ? s - 60 : plan.hourIn ? s : 99;
    const storm = T > 50 ? 0 : ease.inOutQuad(progress(T, -6, -3)) * (1 - ease.inOutQuad(progress(T, 2.5, 5.5)));

    // ---- palette
    for (let m = 0; m < NMAT; m++) {
      let c = night <= 0 ? DAY[m] : night >= 1 ? NIGHT[m] : mixRGB(DAY[m], NIGHT[m], night);
      if (storm > 0 && STORM[m] !== undefined) c = mixRGB(c, mixRGB(STORM[m], STORM_NIGHT[m] ?? STORM[m], night), storm);
      PAL[m] = c; PAL565[m] = to565(c);
    }

    // ---- the sheet
    const buf = g.buf, tt = (ctx.date.getTime() % 3600000) / 1000;
    if (storm <= 0) for (let i = 0; i < W * H; i++) buf[i] = PAL565[BG[i]];
    else {
      // rain: slanting engraved hatching over the open sea, driven west by the wind
      const rp = (tt * 75) | 0, lim = (storm * 16) | 0, rain = PAL565[M.RAIN];
      for (let y = 0, i = 0; y < H; y++)
        for (let x = 0; x < W; x++, i++) {
          const m = BG[i];
          buf[i] = m <= M.RHUMB && (x + 2 * y + rp) % 11 === 0 && ((y + (rp >> 1)) & 7) < 3 && ((x * 7 + y * 13) & 15) < lim ? rain : PAL565[m];
        }
      g.cost.box += W * H * 3;
    }
    g.cost.px += W * H; g.cost.box += W * H;

    // ---- the islands
    const jobs = [];
    for (let k = 0; k < 4; k++) {
      const job = { digit: plan.digits[k], rise: 0, pen: null, wash: 1, lines: 1 };
      const gl = GLYPHS[SLOTS[k].size][job.digit];
      if (plan.drown[k] && s > DROWN0) {
        const u = ease.inQuad(progress(s, DROWN0, DROWN1));
        job.rise = Math.round(u * (gl.r + 6) * 4);
        job.lines = 1 - ease.inQuad(u);
        if (u >= 1) { jobs.push(null); continue; }
      }
      const d = plan.draw.find((j) => j.k === k) ?? plan.sail.find((j) => j.k === k);
      if (d && s < d.t1 + 0.6) {
        if (s < d.t0) { jobs.push(null); continue; }
        if (s < d.t1) {
          const q = ease.inOutQuad(progress(s, d.t0, d.t1)), pt = gl.path[Math.round(q * 256)];
          job.pen = { u: Math.round(q * 255), tip: [pt.x, pt.y], down: pt.pen };
        }
        job.wash = ease.inOutQuad(progress(s, d.t1 - 0.05, d.t1 + 0.55));
        job.lines = ease.outQuad(progress(s, d.t0 + 0.2, d.t1 + 0.3));
      }
      jobs.push(job);
    }
    const breathe = Math.round((1.6 + 2.4 * storm) * sin((TAU * tt) / (storm > 0 ? 2 : 5)));
    const work = drawIsles(g, jobs, PAL, breathe);
    g.cost.box += work;

    hills(g, jobs);
    // ---- the whale in the strait: surfaces, spouts, dives (every 20 s)
    const wc = tt % 20;
    const wr = ease.inOutQuad(progress(wc, 1, 2.5)) * (1 - ease.inOutQuad(progress(wc, 9, 10.2)));
    whale(g, PAL, 82, 72, wr, progress(wc, 4, 6.5), progress(wc, 10.0, 12.2), tt);

    // ---- the ship: back and forth along its track; at the hour it is blown
    // west in the storm and then sails the new hour islands' coasts, charting them
    const ph = (TAU * tt) / 40;
    let sx = 108 - 15 * cos(ph), sy = TRACK.y - 0.4, fx = clamp(sin(ph) * 7, -1, 1), wake = Math.abs(sin(ph)), scale = 1;
    const voy = voyageAt(s, plan, f.minuteKey);
    if (voy) {
      const u = voy.mix;
      sx += (voy.x - sx) * u; sy += (voy.y + 2 - sy) * u;
      fx = fx + (voy.fx - fx) * clamp(u * 2, 0, 1); wake += (1 - wake) * u; scale = 1 - 0.3 * u;
    }
    const heel = 0.04 * sin((TAU * tt) / 4) + storm * 0.2 * sin((TAU * tt) / 1.6);
    ship(g, PAL, sx, sy + 0.35 * sin((TAU * tt) / 3) + storm * 0.8 * sin((TAU * tt) / 1.2), fx, heel, tt, wake, scale);

    // ---- the storm's wind-head over the rose, and its lightning
    if (storm > 0) {
      windHead(g, PAL, 128 + (1 - storm) * 40, 14, storm, tt);
      if (T > -1.85 && T < -1.5) {
        const a = 1 - progress(T, -1.65, -1.5), bolt = [[124, 19], [116, 27], [120, 28], [109, 40], [114, 41], [101, 56]];
        g.stroke(bolt, 2.2, PAL[M.INK], { aa: true, a });
        g.stroke(bolt, 1.0, PAL[M.GOLD], { aa: true, a });
      }
    }

    // ---- the quill
    const qp = quillAt(s, plan, f.minuteKey);
    if (qp) quill(g, PAL, qp[0], qp[1], 1, tt);
  },
};
