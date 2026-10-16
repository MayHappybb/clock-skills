// dollduet: "Balloon Rally", a double act for the owner's two plush toys.
//
// The floppy black-and-tan puppy (hours) and the shaggy panda (minutes) sit
// on the floor at a party, each holding the strings of its own foil number
// balloons: the puppy's in the lavender of its sewn-in tag, the panda's in
// gold. Between them they keep a red latex balloon in the air: the puppy
// boops it up with its head (sometimes with a big flap of both ears), the
// deadpan panda bonks it back with its head or swats it with the paw that
// holds its strings.
//
// Reading the time: the two lavender balloons on the left are the hour, the
// two gold ones on the right the minutes (24 h).
//
// The minute turn is the gag. Three times a minute the panda swats with its
// string paw and nothing happens; on the last swat (:57.5) the strings of
// the changing digits slip, those balloons drift up and out of the top of
// the glass (gone before :00), the puppy flops its ears over its eyes, and
// the panda watches them go, then turns and stares at the puppy. After :00
// the new balloons float up from below and the panda catches their strings.
//
// The hour: on its last boop (:55) the puppy bounces up and does not come
// down: its hour balloons carry it off, limp and splayed, out of the top; the
// panda reaches after it and loses its minute balloons too. After :00 the
// new minutes float in and the puppy comes back down from the top, splayed
// like a skydiver under its NEW hour balloons, and lands flat (beanbag
// squash) right on the red balloon, which squirts out and starts the rally.
//
// Night (23:00-07:00): both doze, the red balloon rests on the puppy's
// head, little z's rise; at the turn the panda nods off and its paw lets go.
// The backlight dims and the room goes to night blue.
//
// Palette: teal party wall with paler polka dots, warm pale floor, the dolls'
// sampled colours, lavender + gold foil, one red balloon. Flat fills, hard
// pixels; the restrained effects are the foil's own: a lit band and glint on
// every balloon and a sheen that sweeps across each one every few seconds.
import { clockFields, previousMinute, hex, mix, hash, sin, clamp, font3x5 } from '../js/kit.js';
import { drawPuppy, drawPanda } from './dollduet-art.js';
import { drawBalloon, BALLOONS, BH } from './dollduet-balloons.js';

const PUP_X = 31, PUP_Y = 78, PAN_X = 134, PAN_Y = 80;
const SLOT_X = [30, 52, 85, 107], SLOT_Y = 1;
const FLOOR_Y = 61;

const T0 = 4.0, T1 = 57.5, K = 21, DT = (T1 - T0) / K;   // rally: hits at T0 + k DT, k = 0..21
const PUP_HIT = [PUP_X + 3, PUP_Y - 28];                  // red balloon centre at the puppy's boop
const PAN_HIT = [PAN_X - 18, PAN_Y - 31];                 // and at the panda's bonk / swat
const REST_FLOOR = [PUP_X + 15, PUP_Y - 4];               // where it lies after the puppy flies off
const RED = { base: hex('#e0443e'), shade: hex('#a82a2c'), lit: hex('#ff8a7a'), glint: hex('#fff4ee') };
const STRING = hex('#ece6da');

const DAY = { wall: hex('#3a7088'), dot: hex('#4a7f96'), floor: hex('#cfc3ab'), plank: hex('#bfb298'), skirt: hex('#2d5a6e'), shadow: hex('#a99c84') };
const NIGHT = { wall: hex('#1e3150'), dot: hex('#26395c'), floor: hex('#6e6a68'), plank: hex('#64605e'), skirt: hex('#172640'), shadow: hex('#55524f') };

const h01 = (a, b = 0, c = 0) => hash(a, b, c) / 4294967296;
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, u) => a + (b - a) * u;
const asleepAt = (h) => h >= 23 || h < 7;

// A quick pop at an impact: rises over 0.15 s before t = 0, decays by 0.5 s.
function pop(t) {
  if (t < -0.15 || t > 0.5) return 0;
  return t < 0 ? sm((t + 0.15) / 0.15) : (1 - t / 0.5) ** 2;
}
// Damped wobble after an impact.
const wob = (t, f = 17, k = 5) => (t <= 0 || t > 1.4 ? 0 : Math.sin(t * f) * Math.exp(-t * k));

// The rally balloon's flight between two points, with a floaty arc.
function flight(A, B, u, peak) {
  const e = u * (1.15 - 0.15 * u);           // a little drag: slower at the end
  return [lerp(A[0], B[0], e), lerp(A[1], B[1], e) - peak * 4 * u * (1 - u)];
}

// This minute's rally, as a list of segments for the red balloon plus the
// contact times of each doll. Hits at T0 + k DT, the puppy on even k, the
// panda on odd k; the panda swats with its string paw on k = 3, 9, 15 (nothing
// happens) and 21 (the strings slip). One gag a minute, chosen by the minute:
// "rest" (it lands on the puppy's head early and sits there while the puppy
// looks up at it and blinks twice) or "triple" (it bounces off the deadpan
// panda's cheek three times before going back).
const SCRIPTS = new Map();
function script(seed, hourStart, hourEnd) {
  const key = seed * 4 + (hourStart ? 1 : 0) + (hourEnd ? 2 : 0);
  if (SCRIPTS.has(key)) return SCRIPTS.get(key);
  const Hk = (k) => T0 + k * DT;
  const gagK = 7 + Math.floor(h01(seed, 99) * 9);
  const gag = gagK % 2 ? 'triple' : 'rest';
  const segs = [{ t0: -1, t1: T0, hold: hourStart ? 'FLOOR' : 'HEAD' }];
  const pup = [], pan = [];
  for (let k = 0; k <= K; k++) {
    if (hourEnd && k === 20) break;                     // the puppy floats off instead
    const fromPup = k % 2 === 0;
    let t0 = Hk(k), t1 = k === K ? 60 : Hk(k + 1);
    if (fromPup) pup.push({ t: t0, flap: k > 0 && h01(k, seed, 5) < 0.35, squirt: k === 0 && hourStart });
    else if (gag === 'triple' && k === gagK) {
      for (let j = 0; j < 3; j++) pan.push({ t: t0 + j * 0.45, swat: false });
      segs.push({ t0, t1: t0 + 0.9, hops: true });
      t0 += 0.9;
    } else pan.push({ t: t0, swat: k % 6 === 3 });
    let to = fromPup ? 'PAN' : 'PUP';
    if (k === K) to = 'HEAD';
    if (!fromPup && gag === 'rest' && k + 1 === gagK) { segs.push({ t0, t1: t1 - 1.1, A: 'PAN', B: 'HEAD', peak: 12 }); segs.push({ t0: t1 - 1.1, t1, hold: 'HEAD', rest: true }); continue; }
    const A = k === 0 && hourStart ? 'FLOOR' : fromPup ? 'PUP' : 'PAN';
    segs.push({ t0, t1, A, B: to, peak: (fromPup ? 14 : 12) + 6 * h01(k, seed) });
  }
  const out = { segs, pup, pan, gag, gagK };
  if (SCRIPTS.size > 8) SCRIPTS.clear();
  SCRIPTS.set(key, out);
  return out;
}

export default {
  name: 'Balloon Rally',
  blurb: 'The floppy puppy (hours) and the shaggy panda (minutes) keep a red balloon up between them, holding their foil number balloons; each minute the panda swats and loses the changing ones, and each hour the puppy floats off with its own and skydives back with the new.',
  fps: 60,

  frame(g, ctx) {
    const f = ctx.fields, s = f.sec;
    const nx = clockFields(new Date(ctx.date.getTime() + 60000));
    const pv = previousMinute(ctx.date);
    const cur = (f.hh + f.mm).split('').map(Number);
    const nxt = (nx.hh + nx.mm).split('').map(Number);
    const prv = (pv.hh + pv.mm).split('').map(Number);
    const hourEnd = nx.h !== f.h, hourStart = pv.h !== f.h;
    const sleep = asleepAt(f.h);
    const seed = f.minuteKey;
    const night = ctx.night;
    ctx.lcd.backlight(1 - 0.65 * night);

    // ---------------------------------------------------------- the room
    const P = {};
    for (const k of Object.keys(DAY)) P[k] = mix(DAY[k], NIGHT[k], night);
    g.clear(P.wall);
    for (let y = 4; y < FLOOR_Y; y += 10)
      for (let x = (y / 10) % 2 ? 3 : 8; x < 160; x += 10) g.fillRect(x, y, 2, 2, P.dot);
    g.fillRect(0, FLOOR_Y - 2, 160, 2, P.skirt);
    g.fillRect(0, FLOOR_Y, 160, 80 - FLOOR_Y, P.floor);
    for (const [y, x0] of [[65, 0], [70, 0], [76, 0]]) g.hline(x0, y, 160, P.plank);
    for (const [x, y] of [[20, 61], [70, 66], [104, 61], [44, 71], [88, 76], [150, 66], [8, 66], [125, 71]]) g.vline(x, y, Math.min(5, 80 - y), P.plank);
    // confetti from an earlier popper
    const CONF = [hex('#e0443e'), hex('#f0bc34'), hex('#a58ae8'), hex('#5ec8b0')];
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(h01(i, 3) * 160), y = FLOOR_Y + 2 + Math.floor(h01(i, 4) * 17);
      g.fillRect(x, y, 2, 1, mix(CONF[i % 4], P.floor, 0.25 + 0.5 * night));
    }

    // ---------------------------------------------------------- puppy timeline
    let pupDx = 0, pupDy = 0, droop = 0, sx = 1, sy = 1, hl = 0, earL = 0, earR = 0, pupVisible = true;
    let pupBlink = 0;
    const HUP = T0 + 20 * DT;                         // the puppy's last boop of an hour (~:55)
    if (hourEnd && s >= HUP) {
      const dt = s - HUP;
      pupDy = -(4 * dt + 4.6 * dt * dt) + 3 * pop(dt - 0.1);
      droop = Math.min(3, dt * 3);
      pupDx = 1.5 * Math.sin(dt * 2.4);
      earL = 0.7 + 0.45 * Math.sin(dt * 9); earR = 0.7 + 0.45 * Math.sin(dt * 9 + 1.3);
      if (pupDy < -100) pupVisible = false;
    } else if (hourStart && s < 4.0) {
      if (s < 0.6) pupVisible = false;
      const u = clamp((s - 0.6) / 3.4, 0, 1);
      pupDy = -96 * (1 - u) ** 1.1;
      pupDx = 7 * Math.sin(u * Math.PI * 2 * 0.9) * (1 - u);
      droop = 3 * (1 - u);
      earL = 1.3 * (1 - u) + 0.3 * Math.sin(s * 7) * (1 - u); earR = 1.3 * (1 - u) + 0.3 * Math.sin(s * 7 + 2) * (1 - u);
    }
    if (hourStart && s >= 4.0) {
      const t = s - 4.0;
      sy = 1 - 0.24 * (t < 0.6 ? Math.sin(Math.min(1, t / 0.6) * Math.PI) : 0) + 0.06 * wob(t - 0.6, 14, 4);
      sx = 1 + 0.14 * (t < 0.6 ? Math.sin(Math.min(1, t / 0.6) * Math.PI) : 0);
      earL += 0.9 * wob(t, 13, 4); earR += 0.9 * wob(t + 0.1, 13, 4);
    }
    const sc = script(seed, hourStart, hourEnd);
    // boops
    if (!sleep) {
      for (const hit of sc.pup) {
        const t = s - hit.t;
        if (t < -0.2 || t > 1.5 || hit.squirt) continue;
        hl += (hit.flap ? 2 : 3) * pop(t);
        const e = (hit.flap ? 1.9 : 0.7) * pop(t) + 0.35 * wob(t, 16, 4);
        earL += e; earR += e;
      }
    }
    // the turn: ears over the eyes (can't look), then back
    if (!hourEnd && !sleep) {
      const c = sm((s - 57.7) / 0.35) * (1 - sm((s - 59.5) / 0.4));
      earL -= 1.0 * c; earR -= 1.0 * c;
    }
    if (sleep) { hl -= 0.6; earL -= 0.1; earR -= 0.1; }
    // blinks
    {
      const per = 3.4 + h01(Math.floor(s / 3.4), seed, 11) * 1.2;
      pupBlink = (s % per) < 0.13 ? 1 : 0;
    }

    // ---------------------------------------------------------- the red balloon
    const pupHead = () => [PUP_X + pupDx + 3, PUP_Y + pupDy + (-14 - hl) * sy - 9 * sy - 4.6];
    let rb = null, rbSquash = 0, pupGazeUp = false, restT = 0;
    const lastPan = T0 + K * DT;     // :57.5
    if (sleep && !hourStart && !hourEnd) rb = pupHead();
    else if (hourStart && s < 4.0) rb = REST_FLOOR;
    else if (hourEnd && s >= HUP) {
      const dt = s - HUP;
      if (dt < 1.4) {
        const u = dt / 1.4;
        rb = [lerp(PUP_HIT[0], REST_FLOOR[0], u), lerp(PUP_HIT[1], REST_FLOOR[1], u * u) - 10 * Math.sin(u * Math.PI)];
      } else {
        const t = dt - 1.4;
        rb = [REST_FLOOR[0], REST_FLOOR[1] - 5 * Math.abs(Math.sin(t * 4.5)) * Math.exp(-t * 2.2)];
      }
    } else if (sleep && hourStart) {
      const t = s - 4.0;
      if (t < 1.4) {
        const u = t / 1.4, top = pupHead();
        rb = [lerp(REST_FLOOR[0], top[0], u), lerp(REST_FLOOR[1], top[1], u) - 16 * Math.sin(u * Math.PI)];
      } else rb = pupHead();
    } else if (sleep && hourEnd) rb = pupHead();
    else {
      let seg = sc.segs[0];
      for (const q of sc.segs) if (s >= q.t0) seg = q;
      const pt = (n) => (n === 'PUP' ? PUP_HIT : n === 'PAN' ? PAN_HIT : n === 'FLOOR' ? REST_FLOOR : pupHead());
      if (seg.hold) rb = pt(seg.hold);
      else if (seg.hops) {
        const u = ((s - seg.t0) / 0.45) % 1;
        rb = [PAN_HIT[0] - 5 * Math.sin(u * Math.PI), PAN_HIT[1] - 6 * Math.sin(u * Math.PI)];
      } else {
        const u = clamp((s - seg.t0) / (seg.t1 - seg.t0), 0, 1);
        rb = flight(pt(seg.A), pt(seg.B), u, seg.peak);
        if (seg.A === 'FLOOR' && u < 0.12) rbSquash = 1 - u / 0.12;
      }
      if (seg.rest) { pupGazeUp = true; restT = s - seg.t0; }
    }

    // ---------------------------------------------------------- panda timeline
    let armL = 0.35, armR = 0, phx = 0, phy = 0, pgx = 0, pgy = 0, panBlink = 0;
    const breathe = sin((s / 6.3) * Math.PI * 2);
    phy += 0.5 * breathe;
    if (!sleep) {
      for (const hit of sc.pan) {
        const t = s - hit.t;
        if (t < -0.4 || t > 1.6) continue;
        if (hit.swat) armL += 2.25 * (t < 0 ? sm((t + 0.35) / 0.35) : t < 0.5 ? 1 : 1 - sm((t - 0.5) / 0.6));
        else { phx += 1.6 * pop(t) + 0.8 * wob(t, 14, 4); phy += 0.8 * pop(t); }
      }
      if (hourEnd) {
        // reaching after the puppy as it floats off
        const t = s - lastPan;
        armL += 2.4 * (t < 0 ? sm((t + 0.6) / 0.6) : 1 - sm((t - 0.9) / 0.9));
      }
    } else {
      phy += 1.2 + 0.8 * sin((s / 9) * Math.PI * 2);
      armL -= 0.05;
      if (s > 56.8 && s < 59.0) { const c = Math.sin(((s - 56.8) / 2.2) * Math.PI); phy += 1.5 * c; armL -= 0.12 * c; }
    }
    // gaze: follow the red balloon, the escapes, the stare
    if (rb) {
      pgx = clamp((rb[0] - PAN_X) / 22, -1, 1);
      pgy = clamp((rb[1] - (PAN_Y - 34)) / 18, -1, 1);
    }
    let pupGx = rb ? clamp((rb[0] - PUP_X) / 26, -1, 1) : 0, pupGy = rb ? clamp((rb[1] - (PUP_Y - 14)) / 16, -1, 1) : 0;
    if (!sleep) {
      if (s > lastPan + 0.1) {                         // watch the balloons go, then stare at the puppy
        const up = sm((s - lastPan - 0.1) / 0.3) * (1 - sm((s - 59.3) / 0.4));
        const st = sm((s - 59.3) / 0.4);
        pgx = lerp(pgx, -0.4, up); pgy = lerp(pgy, -1, up);
        pgx = lerp(pgx, -1, st); pgy = lerp(pgy, 0.4, st);
        if (hourEnd) { pgx = -0.7; pgy = -1; }
      }
      if (s < 2.4 && !asleepAt(pv.h)) {
        const st = 1 - sm((s - 1.8) / 0.4);
        pgx = lerp(pgx, -1, st); pgy = lerp(pgy, 0.4, st);
        if (s > 1.8 && s < 2.6) { pgy = lerp(pgy, 1, 0.5); }
      }
      if (hourStart && s < 5) {
        const pupY = PUP_Y + pupDy - 14;
        pgx = -1; pgy = clamp((pupY - (PAN_Y - 34)) / 18, -1, 1);
      }
      const per = 5.1 + h01(Math.floor(s / 5.1), seed, 13) * 1.5;
      panBlink = (s % per) < 0.16 ? 1 : 0;
    } else { pgy = 0.8; }
    if (hourEnd && s >= HUP && !sleep) { pupGx = 0; pupGy = 1; }
    if (pupGazeUp) { pupGx = 0.2; pupGy = -1; if ((restT > 0.35 && restT < 0.47) || (restT > 0.6 && restT < 0.72)) pupBlink = 1; }

    // ---------------------------------------------------------- draw the dolls
    // shadows on the floor
    {
      const lift = Math.max(0, -pupDy);
      const k = Math.max(0, 1 - lift / 40);
      if (k > 0) g.fillEllipse(PUP_X + pupDx, PUP_Y - 1, 27 * sx * (0.5 + 0.5 * k), 2.6 * k + 0.4, P.shadow);
      g.fillEllipse(PAN_X, PAN_Y - 1, 18, 2.5, P.shadow);
    }
    const pan = drawPanda(g, PAN_X, PAN_Y, { hx: phx, hy: phy, gx: pgx, gy: pgy, blink: panBlink, sleep, armL, armR, slump: 0 });
    let pup = null;
    if (pupVisible) {
      pup = drawPuppy(g, PUP_X + pupDx, PUP_Y + pupDy, { sx, sy, hy: hl, gx: pupGx, gy: pupGy, blink: pupBlink, sleep, earL, earR, droop });
    }

    // ---------------------------------------------------------- the number balloons
    const pawP = pup ? pup.pawR : [PUP_X + pupDx + 23, PUP_Y + pupDy - 4];
    const pawM = pan.pawL;
    for (let i = 0; i < 4; i++) {
      const isH = i < 2, kind = isH ? 'lav' : 'gold';
      const ph = h01(i, 77) * 6.28;
      let x = SLOT_X[i] + Math.round(0.8 * sin(s * 1.45 + ph));
      let y = SLOT_Y + Math.round(1.0 + 1.0 * sin(s * 2.05 + ph * 1.7)) - 1;
      let d = cur[i], tied = true, show = true;
      if (isH) {
        // hour balloons go wherever the puppy goes
        x += Math.round(pupDx); y += Math.round(pupDy);
        if (hourEnd && s >= HUP && y + BH + 22 < 0) show = false;
        if (hourStart && s < 0.6) show = false;
      } else {
        const leaving = nxt[i] !== d, arriving = prv[i] !== d;
        const rel = lastPan + (sleep ? 0.2 : 0);
        if (leaving && s >= rel) {
          const dt = s - rel;
          y -= Math.round(5 * dt + 6.5 * dt * dt);
          x += Math.round(3 * Math.sin(dt * 1.6) * (i === 2 ? -1 : 1));
          tied = false;
          if (y + BH + 22 < 0) show = false;
        } else if (arriving && s < 2.6) {
          const u = clamp(s / 2.4, 0, 1);
          const e = 1 - (1 - u) ** 2.4;
          const over = 2.2 * Math.sin(clamp((s - 1.9) / 0.7, 0, 1) * Math.PI);
          y = Math.round(lerp(84, y, e) - over);
          x = Math.round(lerp(x - (i === 2 ? 14 : 4), x, e));
          tied = s >= 2.3;
        }
      }
      if (!show) continue;
      const sheenPhase = ((s + i * 0.45 + h01(i, 5)) % 6.5);
      const sheenAt = sheenPhase < 1.1 ? sheenPhase * 40 - 4 : null;
      // string first (under the balloon's valve)
      const vb = BALLOONS[kind][d];
      const vx = x + vb.tail[0] + 0.5, vy = y + vb.tail[1] + 2;
      const end = tied ? (isH ? pawP : pawM) : [vx + 2 * Math.sin(s * 3 + i), vy + 16];
      drawString(g, vx, vy, end[0], end[1], tied ? 1.5 : 3 * Math.sin(s * 4 + i));
      drawBalloon(g, kind, d, x, y, sheenAt);
    }

    // ---------------------------------------------------------- the red balloon, in front
    if (rb) drawRed(g, rb[0], rb[1], rbSquash);

    // night: z's drifting up from the sleepers
    if (sleep) {
      for (let k = 0; k < 2; k++) {
        const ph = (s / 2.6 + k * 0.5) % 1;
        const zc = mix(hex('#c8d0ff'), P.wall, ph * 0.8);
        if (pupVisible && !(hourEnd && s >= HUP) && !(hourStart && s < 4.5))
          g.text('z', PUP_X - 12 - ph * 4, PUP_Y - 26 - ph * 12, { font: font3x5, c: zc });
        g.text('z', PAN_X + 14 + ph * 3, PAN_Y - 44 - ph * 10, { font: font3x5, c: zc });
      }
    }
  },
};

// A balloon string: a soft curve from the valve to the hand.
function drawString(g, x0, y0, x1, y1, sag) {
  const mx = (x0 + x1) / 2 + sag, my = (y0 + y1) / 2;
  let px = x0, py = y0;
  for (let i = 1; i <= 4; i++) {
    const u = i / 4;
    const x = (1 - u) * (1 - u) * x0 + 2 * u * (1 - u) * mx + u * u * x1;
    const y = (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * my + u * u * y1;
    g.line(px, py, x, y, STRING);
    px = x; py = y;
  }
}

// The red latex balloon: a round body, a shaded lower right, a glint, a knot.
function drawRed(g, x, y, squash = 0) {
  const rx = 4.6 + squash * 1.4, ry = 5.0 - squash * 1.6;
  g.fillEllipse(x, y, rx, ry, RED.shade);
  g.fillEllipse(x - 0.6, y - 0.7, rx - 0.9, ry - 1.0, RED.base);
  g.fillEllipse(x - 1.8, y - 2.3, 1.2, 0.9, RED.lit);
  g.pixel(x - 2.2, y - 2.8, RED.glint);
  g.fillPolygon([[x - 1.2, y + ry + 1.4], [x + 1.2, y + ry + 1.4], [x, y + ry - 0.2]], RED.shade);
}
