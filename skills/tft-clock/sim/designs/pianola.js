// Pianola: the time is punched into a player-piano roll and performed.
//
// We look into the spool box of an upright player piano. The music roll
// unwinds from the spool at the top and is drawn down over the brass
// tracker bar into the keyboard, which plays itself. The perforations ARE
// the time: HH:MM cut as a line of holes, one column per white key, a
// vertical stroke a long slot (a held note), a horizontal stroke a chord.
// The phrase repeats down the roll as an ostinato, so a whole copy is
// always in the window, and whatever row is crossing the tracker bar is
// down on the keys. You read the digits on the paper; the keys show the
// slice of them being played.
//
// The minute turn is a rush: before :00 the roll accelerates and the last
// copies are pulled through (the keys rattle), the window empties onto a
// blank leader with a white-key glissando punched across it, and after :00
// the new minute's music is pulled in. On the hour the roll also carries the
// Westminster quarters on the treble keys and then strikes the hour in the
// bass.
//
// Rendering: a lit, tonal, shaded scene rather than flat fills: dithered
// gradients for the paper's light and the brass, AA holes so the paper
// glides by fractions of a pixel. Palette: Edwardian parlour — mahogany,
// roll paper, brass, ivory and ebony, one red printing ink. By day the
// holes are dark (the box behind); at night a lamp behind the paper makes
// it glow amber and the holes burn bright, like a lantern.

import { hex, mix, scale, clamp, noise, rand, font3x5 } from '../js/kit.js';
import { COL, W, LSEC, sectionFor, rollAt, speedAt } from './pianola-roll.js';

const YT = 61;               // the tracker bar's top edge: where the paper is read
const YW = YT - W;           // top of the paper window (bottom of the spool)
const KY = 65;               // top of the keyboard

const PAL = {
  wood: hex('3a160c'), woodHi: hex('6a2c16'), woodLo: hex('1c0905'),
  paper: hex('eadfc4'), paperLo: hex('c8b896'), paperHi: hex('f6efdc'),
  hole: hex('241009'), holeLip: hex('fff8e8'),
  ink: hex('b2321e'),
  brass: hex('c99a48'), brassHi: hex('ffe3a0'), brassLo: hex('6e4a1a'),
  ivory: hex('f1e8d2'), ivoryLo: hex('b6a88a'), ivoryDn: hex('cfc2a2'),
  ebony: hex('17110e'), ebonyHi: hex('4a3c34'),
  // the lamp behind the paper, at night
  nPaper: hex('7a4a1c'), nPaperLo: hex('3e220c'), nPaperHi: hex('a8682a'),
  nHole: hex('ffe7a8'),
};

export default {
  name: 'Pianola',
  blurb: 'The time is punched into a player-piano roll; the keys play it, and the roll rushes through at every minute.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, n = ctx.night;
    ctx.lcd.backlight(1 - 0.6 * n);

    const q = rollAt(s);                       // paper coordinate at the tracker bar
    const cur = sectionFor(ctx.date);
    const nxt = sectionFor(new Date(ctx.date.getTime() + 60000));
    const speed = speedAt(s);

    // the room's light: cool daylight in the morning, a warm lamp by evening,
    // and at night the lamp is behind the roll and the rest of the box goes dim
    const hr = f.h + f.m / 60;
    const warm = clamp((hr - 16) / 5, 0, 1), cool = clamp((10 - hr) / 3, 0, 1);
    const day = (c) => mix(mix(c, mix(c, hex('f0c890'), 0.5), warm * (c === PAL.ink ? 0 : 1)), mix(c, hex('dfe4e4'), 0.35), cool);
    const C = {};
    for (const k of Object.keys(PAL)) C[k] = mix(day(PAL[k]), scale(PAL[k], 0.42), n);
    const paper = mix(day(PAL.paper), PAL.nPaper, n), paperLo = mix(day(PAL.paperLo), PAL.nPaperLo, n), paperHi = mix(day(PAL.paperHi), PAL.nPaperHi, n);
    const holeC = mix(PAL.hole, PAL.nHole, n);

    // ---- the spool box: mahogany sides
    g.gradient(0, 0, 160, KY, [C.woodLo, C.wood, C.woodLo], { angle: 0 });

    // ---- the paper, lit from the front (by day) or from behind (at night)
    g.gradient(2, YW, 156, W, [[0, paperLo], [0.25, paper], [0.7, paperHi], [1, paper]]);
    g.gradient(2, YW, 10, W, [paperLo, paper], { angle: 0, a: 0.8 });          // the edges curl away
    g.gradient(148, YW, 10, W, [paper, paperLo], { angle: 0, a: 0.8 });
    if (n > 0) g.radial(80, 30, 90, [PAL.nPaperHi, PAL.nPaper, PAL.nPaperLo], { box: [2, YW, 156, W], a: 0.6 * n });   // the lamp behind

    // ---- the printed expression line (red ink) down the left margin
    const pts = [];
    for (let y = YW; y <= YT; y += 3) {
      const c = q + (YT - y);
      const cc = c < LSEC ? c : c - LSEC;
      pts.push([19.5 + 5 * (noise(cc / 23, (c < LSEC ? cur : nxt).f.minuteKey & 255) - 0.5), y]);
    }
    g.clip(2, YW, 156, W);
    g.stroke(pts, 1, mix(PAL.ink, paper, 0.25), { aa: true, a: 0.9 });

    // fibres in the paper, carried with it (so blank paper still visibly runs)
    for (let y = YW; y < YT; y++) {
      const c = q + (YT - y), ci = Math.floor(c), fr = c - ci;
      const r = rand(ci, 911);
      if (r > 0.55) continue;
      const x = 3 + ((rand(ci, 37) * 154) | 0), len = 1 + ((r * 7) | 0) % 3;
      const yy = YT - (ci - q);                 // where paper row ci sits now
      g.fillRect(x, Math.floor(yy), len, 1, paperLo, { a: 0.5 * (1 - fr) });
      g.fillRect(x, Math.floor(yy) - 1, len, 1, paperLo, { a: 0.5 * fr });
    }

    // printed markings, red ink, right margin (whole-pixel type)
    const ink = mix(PAL.ink, paper, 0.15 + 0.45 * n);
    for (const [sec, off] of [[cur, 0], [nxt, LSEC]]) {
      const lo = q - off;
      for (const p of sec.print) {
        const y = Math.round(YT - (p.c - lo));
        if (y < YW - 6 || y > YT) continue;
        g.text(p.text, 135, y, { font: font3x5, c: ink });
      }
    }

    // ---- the perforations; in the rush they streak
    const pressed = new Uint8Array(41);
    const blur = Math.max(0, speed / 60 - 0.25);     // px the paper moves in one frame
    const drawHoles = (sec, off) => {
      // c in this section's coordinates: tracker reads q - off
      const lo = q - off, hi = lo + W + 1;
      for (const h of sec.holes) {
        if (h.c0 > hi) break;
        if (h.c1 < lo - 6) continue;
        const yTop = YT - (h.c1 - lo), yBot = YT - (h.c0 - lo);
        if (h.c0 <= lo + 0.6 && h.c1 >= lo - 0.6) pressed[h.col] = 1;
        if (yTop >= YT || yBot <= YW) continue;
        const x = h.col * COL + 0.5;
        if (blur > 0.3) {
          g.fillRoundRect(x, yTop - blur, 3, yBot - yTop + blur, 1.5, holeC, { aa: true, a: 0.5 });
          g.fillRoundRect(x, yTop, 3, yBot - yTop, 1.5, holeC, { aa: true, a: 0.6 });
        } else g.fillRoundRect(x, yTop, 3, yBot - yTop, 1.5, holeC, { aa: true });
      }
    };
    drawHoles(cur, 0);
    drawHoles(nxt, LSEC);
    g.unclip();

    // the spool's shadow on the paper
    g.gradient(2, YW, 156, 4, [0x000000, paper], { a: 0.45 });

    // ---- the music roll on its spool at the top: a wound cylinder of paper
    g.gradient(2, 0, 156, YW, [[0, scale(paperLo, 0.55)], [0.35, paperHi], [0.6, paper], [1, scale(paperLo, 0.6)]]);
    // the edges of the wound layers, drifting as it turns (a pure function of q)
    for (let i = 0; i < 9; i++) {
      const x = 4 + ((i * 37 + rand(i, 7) * 50 + q * 0.02) % 150);
      g.fillRect(x | 0, 1, 1 + (rand(i, 3) * 2 | 0), YW - 2, scale(paperLo, 0.8), { a: 0.35 });
    }
    g.hline(2, YW - 1, 156, scale(paperLo, 0.45));
    // brass chucks at the ends
    g.gradient(0, 0, 3, YW + 1, [C.brassLo, C.brassHi, C.brassLo]);
    g.gradient(157, 0, 3, YW + 1, [C.brassLo, C.brassHi, C.brassLo]);

    // ---- the tracker bar: brass, one port per key; a port in play shows through
    g.gradient(0, YT, 160, KY - YT, [C.brassHi, C.brass, C.brassLo]);
    for (let i = 0; i < 40; i++) {
      const x = i * COL + 1;
      g.fillRect(x, YT + 1, 2, 2, pressed[i] ? mix(mix(PAL.brassHi, 0xffffff, 0.6), PAL.nHole, n) : C.brassLo);
    }

    // the Metrostyle pointer: rides the tracker bar, following the red line
    const px = 19.5 + 5 * (noise(q / 23, cur.f.minuteKey & 255) - 0.5);
    g.fillPolygon([[px - 2, YT - 3], [px + 2, YT - 3], [px, YT + 0.5]], C.brassHi, { aa: true });
    g.fillRect(Math.round(px) - 1, YT - 4, 2, 1, C.brassLo);

    // ---- the keyboard, playing itself: a pressed key drops 2 px, its front face hides
    g.fillRect(0, KY, 160, 80 - KY, C.ebony);
    for (let i = 0; i < 40; i++) {
      const x = i * COL, dn = pressed[i] ? 2 : 0;
      g.gradient(x, KY + dn, 3, 11, dn ? [C.ivoryLo, C.ivoryDn] : [C.ivoryDn, C.ivory]);
      g.fillRect(x, KY + 11 + dn, 3, 4 - dn, dn ? scale(C.ivoryLo, 0.75) : C.ivoryLo);
    }
    for (let i = 0; i < 40; i++) {
      const k = i % 7;
      if (k === 2 || k === 6) continue;              // no black key after E or B
      const x = i * COL + 3;
      g.fillRect(x, KY, 2, 9, C.ebony);
      g.fillRect(x, KY + 1, 1, 6, C.ebonyHi);
    }
    // the shadow of the tracker bar on the keys
    g.gradient(0, KY, 160, 3, [0x000000, C.ivory], { a: 0.35 });
  },
};
