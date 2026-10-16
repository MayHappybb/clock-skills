// nightrain: the view from a night train window, in the rain. The time is
// out there in the dark: the hour is a village high on a far mountain, its
// roads strung with cold white street lamps in the shape of the hour's two
// digits; the minutes are a nearer town on a hill, its streets lit sodium
// orange in the shape of the minute; between them a radio mast's two red
// warning lights blink the seconds (the colon). Cars crawl along the
// streets, white heads one way and red tails the other. Because they are far
// away they barely move: the minute town drifts 28 px a minute and the
// mountain village 7, while everything near rushes past at the speed of the
// train (nightrain-world.js: farms and copses at 46 px/s, the embankment at
// 300, catenary masts at 340, all smeared by speed).
//
// Every minute turn happens behind something that hides the whole valley
// for three seconds, so when it clears the view can be a new valley with the
// new time (nightrain-events.js): a tunnel (the window turns into a mirror and
// you see the lit carriage and yourself in it; orange tunnel lamps streak by)
// or a freight train on the other line, loco headlights blazing, containers
// flicking by with glimpses of the valley through the gaps. Old digits are
// covered before :00 and the new ones uncovered after it. Every hour the
// train brakes into a station and stands there from :59:58 to :00:12: brick
// arcade, lit arched windows, a fretted canopy, the station's name, and
// five Swiss railway clocks (the red second hand sweeps 58.5 s, waits, and
// the minute hand jumps) that tell the time while the valley is hidden.
// Rain drops on the glass are pushed backward by the wind of the train's
// speed and run straight down when it stands. Some minutes a level crossing
// flashes past (red lights, a car waiting, the road running off to the
// horizon), or a lit halt strobes by.
//
// Palette: the night itself (a navy-to-violet sky by the hour, a rainy
// overcast blue by day), hills in two near-black blues, and the only bright
// things the lights: mercury white for the hour, sodium orange for the
// minute, red for the colon and the crossing, warm carriage light for the
// reflection and the patches of window light thrown on the embankment.
// Lights are hard sub-pixel splats with a soft square halo (so the slow
// drift is smooth); clocks and the reflection are anti-aliased.
import { rand, noise, mix } from '../js/kit.js';
import {
  W, H, FAR_H, FAR_M, journey, skyAt, darkness, valley, drawHills, drawTowns, drawMid, drawNear, drawMasts,
} from './nightrain-world.js';
import { drawDrops, drawReflection, drawFrame } from './nightrain-glass.js';
import {
  turnAt, stationAt, sightsAt, tunnelSpan, drawTunnel, freightSpan, drawFreight, drawStation, drawCrossing, drawHalt,
} from './nightrain-events.js';

export default {
  name: 'Night Train',
  blurb: 'The view from a night train in the rain: the hour is a far mountain village, the minutes a hill town, written in their street lamps; minutes turn in tunnels or behind freight trains, hours at a station with railway clocks.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields;
    const J = journey(ctx.date);
    const hf = J.T / 3600;
    ctx.lcd.backlight(1 - 0.55 * ctx.night);
    const sky = skyAt(hf), dark = darkness(hf);
    const vy = valley(f);
    const turn = turnAt(J, f.minuteKey);
    const st = stationAt(J);
    const tun = turn && turn.kind === 'tunnel' ? tunnelSpan(turn.u) : null;
    const fr = turn && turn.kind === 'freight' ? freightSpan(turn.u) : null;
    const hidden = (tun && tun[0] <= 0 && tun[1] >= W) || (st && Math.abs(st.R) < 0.55);

    if (!hidden) {
      g.gradient(0, 0, W, 58, [[0, sky.top], [0.55, sky.mid], [1, sky.hor]]);
      if (vy.clear && dark > 0) {
        for (let i = 0; i < 36; i++) {
          const x = rand(i, 1, 41) * W, y = rand(i, 2, 41) * 40;
          const tw = 0.4 + 0.6 * noise(J.T * 0.9 + i * 5.3, i);
          g.pixel(x, y, 0xdfe6ff, { a: dark * tw * (0.3 + 0.5 * rand(i, 3, 41)) });
        }
        const mx = 72 + ((hf + 6) % 24) * 3.2, my = 9 - 3 * Math.sin(((hf % 24) / 24) * Math.PI);
        g.radial(mx, my, 16, [[0, 0x3a4060], [1, sky.mid]], { box: [mx - 16, my - 16, 32, 32], a: 0.5 * dark });
        g.fillCircle(mx, my, 3.6, 0xf2ecd2, { aa: true, a: dark });
        g.fillCircle(mx + 1.4, my - 0.8, 3.2, sky.mid, { aa: true, a: dark * 0.9 });
      }
      const dh = J.drift * FAR_H, dm = J.drift * FAR_M;
      drawHills(g, vy, sky, dh, dm);
      drawTowns(g, vy, J.T, dh, dm, J.s);
      drawMid(g, J.X, 61);
      drawNear(g, J.X, 66);
    }
    let red = 0, wash = 0;
    for (const e of sightsAt(f.minuteKey, J)) {
      if (e.kind === 'crossing') red = drawCrossing(g, e.at, J);
      else wash = drawHalt(g, e.at, J);
    }
    if (st) drawStation(g, st, ctx.date, J.T);
    if (!(st && Math.abs(st.R) < 1.2) && !(tun && tun[0] <= 0 && tun[1] >= W)) drawMasts(g, J.X, J.v);
    if (fr) drawFreight(g, fr, turn.key);
    if (tun) drawTunnel(g, tun, J.X);

    // Light the line throws back at the glass.
    const ph = (J.s * 2) % 1 < 0.5;
    if (red > 0) g.fillRect(0, 0, W, H, 0xff2010, { a: 0.07 * red * (ph ? 1 : 0.5) });
    if (wash > 0) g.fillRect(0, 0, W, H, 0xffd090, { a: 0.1 * wash });
    if (fr && fr[2] > -60 && fr[2] < W) g.fillRect(0, 0, W, H, 0xfff4e0, { a: 0.12 * (1 - Math.abs(fr[2] - 60) / 120) });

    let k = 0.09;
    if (tun) k += 0.62 * (tun[1] - tun[0]) / W;
    if (fr) k += 0.1 * (fr[1] - fr[0]) / W;
    if (st && Math.abs(st.R) < 1.5) k = 0.04;
    const tint = red > 0 && ph ? 0xff6050 : tun ? 0xc89060 : wash > 0 ? 0xffe0b0 : 0x9aa8c0;
    drawDrops(g, J.T, J.v, 14 + Math.round(vy.rain * 16), tint);
    drawReflection(g, k, 0);
    drawFrame(g);
  },
};
