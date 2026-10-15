// Luna — tonight's real moon beside Didone numerals.
//
// The moon is 54 pixels across and shows the true phase for ctx.date. The
// elongation of the Moon from the Sun comes from the main periodic terms of
// Meeus (Astronomical Algorithms, ch. 47 and 25); checked against NASA's
// hourly ephemeris for 2026 (SVS 5587) it is within 0.2% in lit fraction
// and finds new and full moons within minutes. The Sun's direction then
// lights a sphere: waxing moons lit on the right, waning on the left, as
// seen from the northern hemisphere, north up.
//
// The surface is real: an albedo map of the near side, area-averaged from
// the LROC WAC mosaic (NASA CGI Moon Kit, SVS 4720) and projected
// orthographically onto the disc, so the maria, Tycho's bright ray field
// and the southern highlands sit where they are in the sky. It was compared
// side by side with NASA's rendering of the same night. Brightness is the
// albedo on an S-curve (one bit needs contrast), times a soft terminator
// (a ramp over the first ~13 degrees of sunlit surface, which the dither
// draws as a gradient), a little limb darkening, a solid sunlit limb, and
// earthshine on the night side, strongest at a thin crescent. Dithered with
// blue noise anchored to the moon, its phase stepped each minute (burn-in).
//
// Stars drift slowly (the sky turning), hidden behind the moon's disc even
// at new moon; a few twinkle, the brightest flare into small crosses. They
// keep out of the text lines.
//
// The time is a Didone (Bodoni/Didot), the face of the classic moon-phase
// dial: each digit a centre-line drawn with a pen whose width follows the
// stroke direction (vertical stress, 3 px stems, 1 px hairlines), ball
// terminals on 2 3 5 6 9. Labels: date, phase name, % lit, days to full
// (at full, to new).
//
// Minute: a meteor streaks in from the right at :59.3; as its head passes
// a changing digit, the digit burns away from the meteor's path outward,
// throwing sparks into its wake (all gone by :59.98); at :00 the new digit
// condenses out of the dark. The train lingers as a fading dotted wake.
// Hour: a slower fireball with a flickering halo; then from :01.2 the moon
// runs through a whole lunation in five seconds (crescent, quarter, full,
// earthshine at new) with its labels counting along, and settles back on
// tonight.
//
// The moon is cached per minute (a few hundred microseconds to build);
// frame() is otherwise cheap. The moon walks a 3-pixel orbit, the text its own 2-pixel one.

import { font3x5, orbit, noise, smoothNoise, clamp, ease, progress, clockFields, previousMinute, OFF, ON } from '../js/kit.js';

// ------------------------------------------------------------ data

// The near side at 54 px across, orthographic, north up: the albedo of each
// pixel (0..63 in base64 digits, '.' off the disc), area-averaged from the
// LROC WAC global mosaic in NASA's CGI Moon Kit (SVS 4720).
const ALBEDO = [
  '......................xxxwwwwvut......................',
  '..................wwvuvwxyzyvttrssuw..................',
  '................wwurpqqnoqttqpropoqt22................',
  '..............srqokhecbbbcbfkhiikmprzzwv..............',
  '............fmlhdacgdbXbecbbbebcaaZcktvspj............',
  '...........YaaXdfijhfelhYfmgdccabaXXakopnqo...........',
  '.........dWWUQYjlideXSWZYdjmkddgidddbknnmlnmq.........',
  '........WQSUWgjjVSTPPQTUUVbhkhffhjfddhklnoglnp........',
  '.......ZPPQOUcdZOQMKMQQSRTVfhkhkmhebfgffhlihgms.......',
  '......bQMNOOaaYRKJLLMORPRUZafgljhgaXaccdjlklllrr......',
  '......OMNOPSVXONNKJLMORQSWaZZfkfYceWXZZUgjiknokm......',
  '.....RMOMNOPQPMPNMKLNOPOQUYcXajQPPUXSTaVbiollrmjn.....',
  '....ROMNMPPOQMQOLLKKOMONMRXcXZYNNPOPQShcgknompohno....',
  '....QLJMORRPPPPONMNMNNONTWZcaVQONNMQPLXfkmorpnpjlq....',
  '...TSLJMQURQOSPMPOMLOTRUZYVXbaPQNNNPOKJYmomntnlmmnr...',
  '...RLKKNaWUPNLNLONOMNQQVZcYRZZMKKMNPMNJUjrnliijifkp...',
  '..ZQMJLShWQMMNRQOQPPNPOMTXdheYJIJLPNJMKSdghkehgdUdhr..',
  '..TNKILPRSQPOPUTQORPPQPOMUehbTMILKPNLMKNbbXnjifTTPam..',
  '.jNLGIKLNOSOMPQSUQRSSRTPWacZWROOQKMMJJKNXUSWmrkSPMNji.',
  '.eNIHHJLMQURMRbaaWWYYXWWZYYRPOQTPVaRLLKHLQMReqtYNLKfc.',
  '.cLKGEGKMOTSPTcbbgebbZUQQPSOOLRbNTWPGHGIHIJJcfsaOMPhe.',
  '.dOJGGIKMPVXORdidjjcbaURMEPMKIIORYTHGEJKHFEEMXkkUMTji.',
  'njRJIHIIKTdbRUZehsocaZUNNRXZRMJQaaVHEFHIFGFIKUdmhaefhg',
  'tkTKNKKIOXhfUSVbccZXTVPIObaeaYVXdfXJHJJFHGGHPUTcjgdYdg',
  'qlbJIJIKLTbZTXaccYWQMRIFPZbbgiejjfZOMKHGIJKLMTaRbhhXdm',
  'mocKGIJIIRSRTSSZZcWPQSOLMSVbghjrpgcVJIJILMMKOVQLLYccee',
  'nmaJHHJJINPQQTUUYZeTOQPSUTQXglorplfZPKLKLYYPRQNLJITVeb',
  'knYKHGJIGJKMOPRTSSXXUSUbdaTbikmmlllhgXRMPkheaNOKJLTYca',
  'kifPGJLHGLIKPQTQNRWZWZhflffeimokllmosmcQWgefaOOLLQUeed',
  'mcaWIHLKKJKMORUQNVZZUSilhkkiimnlllnythUVagheZTNLNSUbed',
  'oghbNHJIJJMLPZbNNSXcVOYfhhhijmurnmouqgZXbgkoeSNLPVmggf',
  'nkkgTLLLJKMKNTWLNOQaVMQcjdcghjmllmspunldceiklbROTeqijj',
  '.kmldPVPPSRLLOOMLNNUcQRdfigggijklptqrttijXWfobWTVahhi.',
  '.mkimaUUWXaPMKOSZQURWNTVYghgjiilkmoms0tlbTWelggeUcegi.',
  '.ljhheXWZbbQPQMYcPRQRPOUbijijimqnkjnqu0kYUVhjgfcWbcfl.',
  '.mkmlfcbgeaOPQUaVQRQNOOYikmhonikkjknmrwlbVRffgYXeddgp.',
  '..orrjdfkUJIKZXZWcRPLQOZklhgikfkllmlnopqfcechcabpffl..',
  '..qoztmhhRLJITUTWVRQPNOZgmjlkhkmopkikrvnikkfjkijnhhj..',
  '...mzzoniaRMKMTXSWSMLMNTgljtmlsrqmjjpxsoolhoopomqmi...',
  '...qmrnppeVNOSaZSYVPRRUZlqtuuosrljlsqpornkknstvsqml...',
  '....lmnkrpgXWZgSbdjddXjouttvvtplkmrqmpnnlpnnt1ysrj....',
  '....oklklrlececSXXntmnrx060uwtqopstnrplkmqmoz32tnl....',
  '.....mkklikadffcdhlouux115xvvtsspommnmlkooosxxqmk.....',
  '......lkpihfbijjilpotw0232zyvttpnsnmmnonnnmttpnj......',
  '......mnokgjlkmnlkmtvyyx121ywvsrtqrrqlpqqrrmjjib......',
  '.......onmbihfmnmnoqux06xzyxxxsptnrnlnpsusmikfc.......',
  '........nmljgdhinolqszxyy0yywtplllnorurxsmjkje........',
  '.........nokjfehknmopwz1021yyutqppnooprpmnnea.........',
  '...........nlnhdkmmoutx0zywwwsqpqqqqrrqkljb...........',
  '............ooonkonotryyxwvtttqrrroqqnqnng............',
  '..............stvvsquvw22ytttvutrpqrqrqq..............',
  '................wvwwtvx331wxuwutvtuyxu................',
  '..................xxvuvuwwwvvxwvwuuu..................',
  '......................uuvvwyyxxv......................',];

// A 32x32 blue-noise threshold matrix (void-and-cluster), ranks 0..1023 as
// two base64 digits each: an ordered dither without the Bayer cross-hatch.
const BLUE =
  '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';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const R = 27, N = 2 * R;

/** Albedo of moon pixel (i, j), about 0.2..0.84, or -1 off the disc. */
const ALB = new Float32Array(N * N);
ALBEDO.forEach((row, j) => {
  for (let i = 0; i < N; i++) ALB[j * N + i] = row[i] === '.' ? -1 : 0.2 + (B64.indexOf(row[i]) / 63) * 0.64;
});

/** Pixels on the rim of the disc (a neighbour is off it). */
const EDGE = new Uint8Array(N * N);
for (let j = 0; j < N; j++)
  for (let i = 0; i < N; i++) {
    const off = (x, y) => x < 0 || y < 0 || x >= N || y >= N || ALB[y * N + x] < 0;
    if (!off(i, j) && (off(i - 1, j) || off(i + 1, j) || off(i, j - 1) || off(i, j + 1))) EDGE[j * N + i] = 1;
  }

const BN = new Float32Array(1024);
for (let k = 0; k < 1024; k++) BN[k] = (B64.indexOf(BLUE[2 * k]) * 64 + B64.indexOf(BLUE[2 * k + 1]) + 0.5) / 1024;
/** Blue-noise threshold at integer (x, y), 0..1. */
const blue = (x, y) => BN[((y & 31) << 5) | (x & 31)];

// ------------------------------------------------------------ the sky

const RAD = Math.PI / 180, SYNODIC = 29.530588853, DAY = 864e5;
const sind = (d) => Math.sin(d * RAD);

/**
 * The Moon's elongation from the Sun in ecliptic longitude, E (degrees: 0
 * new, 90 first quarter, 180 full, 270 last quarter), and the fraction of
 * the disc lit. The main periodic terms of Meeus, Astronomical Algorithms,
 * ch. 47 (Moon) and ch. 25 (Sun, low precision). Checked against NASA's
 * hourly ephemeris for 2026 (SVS 5587): lit fraction within 0.2%, new and
 * full moons within about 6 minutes.
 */
function lunar(ms) {
  const T = (ms / DAY + 2440587.5 - 2451545.0) / 36525;
  const Lp = 218.3164477 + 481267.88123421 * T;
  const D = 297.8501921 + 445267.1114034 * T;
  const M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T;
  const F = 93.2720950 + 483202.0175233 * T;
  const l = 6.288774 * sind(Mp) + 1.274027 * sind(2 * D - Mp) + 0.658314 * sind(2 * D) + 0.213618 * sind(2 * Mp)
    - 0.185116 * sind(M) - 0.114332 * sind(2 * F) + 0.058793 * sind(2 * D - 2 * Mp) + 0.057066 * sind(2 * D - M - Mp)
    + 0.053322 * sind(2 * D + Mp) + 0.045758 * sind(2 * D - M) - 0.040923 * sind(M - Mp) - 0.034720 * sind(D)
    - 0.030383 * sind(M + Mp);
  const b = 5.128122 * sind(F) + 0.280602 * sind(Mp + F) + 0.277693 * sind(Mp - F) + 0.173237 * sind(2 * D - F);
  const sun = 280.46646 + 36000.76983 * T + 1.914602 * sind(M) + 0.019993 * sind(2 * M);
  const E = (((Lp + l - sun) % 360) + 360) % 360;
  const cosPsi = Math.cos(b * RAD) * Math.cos(E * RAD);   // cos of the Sun-Moon angle seen from Earth
  return { E, lit: (1 - cosPsi) / 2 };
}

/** The next instant (ms) at which the elongation reaches `target` degrees. */
function nextAt(ms, target) {
  let t = ms + ((((target - lunar(ms).E) % 360) + 360) % 360) / 360 * SYNODIC * DAY;
  for (let k = 0; k < 4; k++) t += ((((target - lunar(t).E + 540) % 360) + 360) % 360 - 180) / 360 * SYNODIC * DAY;
  return t;
}

const NAMES = ['NEW MOON', 'WAXING CRESCENT', 'FIRST QUARTER', 'WAXING GIBBOUS',
  'FULL MOON', 'WANING GIBBOUS', 'LAST QUARTER', 'WANING CRESCENT'];
/** The phase's name. The four principal phases are named within half a day of the instant. */
function phaseName(E) {
  for (let q = 0; q < 4; q++) if (Math.abs(((E - q * 90 + 540) % 360) - 180) < 6.1) return NAMES[q * 2];
  return NAMES[1 + 2 * Math.floor(E / 90)];
}

// ------------------------------------------------------------ the moon

const TONE = { lo: 0.33, span: 0.27, floor: 0.24, top: 0.8 };

/**
 * The moon at elongation E as lit bits in moon-local pixels (N x N).
 * The Sun's direction in the viewer's frame is (sin E, 0, -cos E): behind
 * the Moon at new, to its right at first quarter (the waxing moon is lit on
 * the right, seen from the northern hemisphere), behind us at full.
 * Brightness is the albedo (tone-curved for one bit) times a
 * Lommel-Seeliger-like falloff, which keeps the full moon flat and lets the
 * light die away towards the terminator; a little limb darkening; and on
 * the night side earthshine, strongest when the Moon is a thin crescent.
 * The dither is blue noise anchored to the moon, so the face moves as one.
 */
function moonBits(E, out, key = 0) {
  // The dither's phase steps every minute, so even the brightest highland
  // pixel is not lit all the time (burn-in), and the pattern stays fixed
  // to the moon within the minute.
  const ox = (key * 7) & 31, oy = (key * 13) & 31;
  const e = E * RAD, sx = Math.sin(e), sz = -Math.cos(e);
  const earth = 0.11 * ((1 + Math.cos(e)) / 2) ** 5;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const k = j * N + i, a = ALB[k];
      if (a < 0) { out[k] = 0; continue; }
      const X = (i + 0.5 - R) / R, Y = (R - j - 0.5) / R, Z = Math.sqrt(Math.max(0, 1 - X * X - Y * Y));
      const u = clamp((a - TONE.lo) / TONE.span, 0, 1);
      const tone = TONE.floor + (TONE.top - TONE.floor) * u * u * (3 - 2 * u);
      const mu0 = X * sx + Z * sz;
      // A soft terminator: the light ramps up over a band of the surface
      // just sunward of it, which the dither draws as a gradient.
      const w = clamp((mu0 + 0.03) / 0.22, 0, 1);
      let v = tone * (w * w * (3 - 2 * w)) ** 0.8 * (0.82 + 0.18 * Z);
      v = Math.max(v, earth * (0.3 + 0.7 * tone));
      // The sunlit limb is drawn solid, so the disc keeps a clean edge.
      if (EDGE[k] && v > 0.18) v = 1;
      out[k] = v > blue(i + ox, j + oy) ? 1 : 0;
    }
  return out;
}

const moonCache = { key: null, bits: new Uint8Array(N * N) };
const liveBits = new Uint8Array(N * N);

function drawMoon(g, x0, y0, bits) {
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) if (bits[j * N + i]) g.pixel(x0 + i, y0 + j);
}

// ------------------------------------------------------------ stars

const SKY_W = 192;
const STARS = [];
for (let i = 0; i < 56; i++) STARS.push({ x: noise(i, 11) * SKY_W, y: 1 + noise(i, 12) * 62, m: noise(i, 13), i });

/**
 * Single-pixel stars on a slow drift (one pixel every 45 s, the sky turning).
 * The moon hides those behind it, dark side included, so even a new moon
 * shows as a round hole in the sky. A few twinkle; the brightest flare into
 * a small cross now and then.
 */
function drawStars(g, T, mx, my, tox, toy) {
  const drift = T / 45;
  for (const s of STARS) {
    const x = Math.floor((((s.x - drift) % SKY_W) + SKY_W) % SKY_W) - 32, y = Math.floor(s.y);
    if (x < 0 || x > 127) continue;
    if ((x + 0.5 - mx) ** 2 + (y + 0.5 - my) ** 2 < (R + 1.5) ** 2) continue;
    // Keep the text column's lines clear: stars only in the gaps between them.
    if (x >= 60) {
      const yy = y - toy;
      if (yy >= 1 && yy <= 9 || yy >= 10 && yy <= 39 || yy >= 41 && yy <= 58) continue;
    }
    const tw = smoothNoise(T * 1.7 + s.i * 7.3, s.i);
    if (s.m > 0.9 && x < 58) {
      g.pixel(x, y);
      if (tw > 0.62) g.pixel(x - 1, y).pixel(x + 1, y).pixel(x, y - 1).pixel(x, y + 1);
      if (tw > 0.86) g.pixel(x - 2, y).pixel(x + 2, y).pixel(x, y - 2).pixel(x, y + 2);
    } else if (s.m > 0.62) {
      if (tw > 0.22) g.pixel(x, y);
    } else g.pixel(x, y);
  }
}

// ------------------------------------------------------------ numerals

// A Didone (Bodoni, Didot): the face of the classic moon-phase watch dial.
// Each digit is centre-lines drawn with a pen whose width follows the
// stroke's direction, vertical stress: upright strokes are full stems,
// horizontal ones hairlines, curves swell and thin between. Ball terminals
// on 2 3 5 6 9, hairline serifs on 1 and 4. Drawn once, supersampled.
const GW = 13, GH = 24, STEM = 3.1, HAIR = 1.0;

const DIGITS = {
  0: [{ d: 'E 6.5 12 4.95 11.5' }],
  1: [{ d: 'M 6.8 0.6 L 6.8 23.3' }, { d: 'M 6.4 0.9 L 2.8 4.2', w: 1.2 },
    { d: 'M 2.6 23.5 L 11.0 23.5', w: HAIR }],
  2: [{ ball: [3.0, 5.4, 2.0] },
    { d: 'M 2.3 5.0 C 2.4 2.2 4.4 0.5 6.9 0.5 C 9.8 0.5 11.4 2.6 11.4 5.6 C 11.4 10.0 6.0 15.5 1.6 23.0' },
    { d: 'M 1.6 23.0 L 11.8 23.0', w: 2.0 }, { d: 'M 11.8 23.4 L 12.1 20.4', w: HAIR }],
  3: [{ ball: [2.9, 4.8, 1.9] },
    { d: 'M 2.3 4.6 C 2.8 1.8 4.6 0.5 6.8 0.5 C 9.4 0.5 10.9 2.4 10.9 5.3 C 10.9 8.6 8.6 10.9 5.6 10.9' },
    { d: 'M 5.6 10.9 C 9.4 10.9 11.6 13.6 11.6 17.2 C 11.6 21.2 9.4 23.5 6.4 23.5 C 3.9 23.5 2.1 22.1 1.8 19.6' },
    { ball: [2.7, 19.3, 1.9] }],
  4: [{ d: 'M 9.4 0.6 L 9.4 23.3' }, { d: 'M 9.2 0.8 L 0.9 16.6', w: HAIR },
    { d: 'M 0.9 16.6 L 12.6 16.6', w: HAIR }, { d: 'M 6.0 23.5 L 12.6 23.5', w: HAIR }],
  5: [{ d: 'M 2.8 1.0 L 11.6 1.0', w: 2.0 }, { d: 'M 2.8 1.0 L 2.4 11.0', w: 1.2 },
    { d: 'M 2.4 11.0 C 3.8 9.6 5.3 9.0 6.9 9.0 C 10.0 9.0 11.6 12.0 11.6 16.2 C 11.6 21.0 9.3 23.5 6.4 23.5 C 3.9 23.5 2.1 22.1 1.8 19.6' },
    { ball: [2.7, 19.3, 1.9] }],
  6: [{ ball: [10.2, 4.1, 1.9] },
    { d: 'M 10.8 3.7 C 10.4 1.6 8.8 0.5 7.0 0.5 C 3.4 0.5 1.55 5.2 1.55 12.5 C 1.55 19.8 3.6 23.5 6.6 23.5 C 9.6 23.5 11.45 20.8 11.45 17.0 C 11.45 13.0 9.4 10.3 6.6 10.3 C 4.2 10.3 2.4 12.0 1.7 14.4' }],
  7: [{ d: 'M 1.0 0.9 L 12.2 0.9', w: 1.6 }, { d: 'M 12.2 1.0 C 9.0 6.0 6.2 13.0 5.4 23.3' },
    { d: 'M 1.0 0.6 L 0.8 3.8', w: HAIR }],
  8: [{ d: 'E 6.5 5.9 4.1 5.4' }, { d: 'E 6.5 17.15 4.95 6.35' }],
};
// 9 is 6 turned half a turn.
DIGITS[9] = DIGITS[6].map((s) => (s.ball
  ? { ball: [GW - s.ball[0], GH - s.ball[1], s.ball[2]] }
  : { ...s, d: s.d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, x, y) => `${+(GW - x).toFixed(3)} ${+(GH - y).toFixed(3)}`) }));

/** Flatten a path ('M x y', 'L x y', 'C x1 y1 x2 y2 x y', 'E cx cy rx ry') to points with unit tangents. */
function flatten(d) {
  const tok = d.trim().split(/\s+/), pts = [];
  let i = 0, x = 0, y = 0;
  const push = (px, py, tx, ty) => { const l = Math.hypot(tx, ty) || 1; pts.push([px, py, tx / l, ty / l]); };
  while (i < tok.length) {
    const c = tok[i++], n = () => Number(tok[i++]);
    if (c === 'M') { x = n(); y = n(); }
    else if (c === 'L') {
      const x1 = n(), y1 = n(), steps = Math.ceil(Math.hypot(x1 - x, y1 - y) / 0.15) || 1;
      for (let k = 0; k <= steps; k++) push(x + ((x1 - x) * k) / steps, y + ((y1 - y) * k) / steps, x1 - x, y1 - y);
      x = x1; y = y1;
    } else if (c === 'C') {
      const a = n(), b = n(), cc = n(), dd = n(), x1 = n(), y1 = n();
      for (let k = 0; k <= 80; k++) {
        const t = k / 80, s = 1 - t;
        push(s * s * s * x + 3 * s * s * t * a + 3 * s * t * t * cc + t * t * t * x1,
          s * s * s * y + 3 * s * s * t * b + 3 * s * t * t * dd + t * t * t * y1,
          3 * s * s * (a - x) + 6 * s * t * (cc - a) + 3 * t * t * (x1 - cc),
          3 * s * s * (b - y) + 6 * s * t * (dd - b) + 3 * t * t * (y1 - dd));
      }
      x = x1; y = y1;
    } else if (c === 'E') {
      const cx = n(), cy = n(), rx = n(), ry = n();
      for (let k = 0; k <= 160; k++) {
        const a = (k / 160) * 2 * Math.PI;
        push(cx + rx * Math.sin(a), cy - ry * Math.cos(a), rx * Math.cos(a), ry * Math.sin(a));
      }
    }
  }
  return pts;
}

/** Pen width for a stroke heading along unit tangent (tx, ty): vertical stress. */
const pen = (ty) => HAIR + (STEM - HAIR) * Math.abs(ty) ** 2.2;

/** Render a glyph spec to a sprite, 4x4 supersampled. */
function buildGlyph(spec) {
  const discs = [];
  for (const s of spec) {
    if (s.ball) { discs.push(s.ball); continue; }
    for (const [x, y, , ty] of flatten(s.d)) discs.push([x, y, (s.w ?? pen(ty)) / 2]);
  }
  const data = new Uint8Array(GW * GH);
  for (let py = 0; py < GH; py++)
    for (let px = 0; px < GW; px++) {
      let hit = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const x = px + (sx + 0.5) / 4, y = py + (sy + 0.5) / 4;
          for (const [cx, cy, r] of discs) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { hit++; break; }
        }
      data[py * GW + px] = hit >= 7 ? 1 : 0;
    }
  return { w: GW, h: GH, data };
}

export const GLYPHS = {};
for (let d = 0; d <= 9; d++) GLYPHS[d] = buildGlyph(DIGITS[d]);

/** Glyph pixels as a list of [x, y] (for dissolving one pixel at a time). */
const GLYPH_PIX = {};
for (let d = 0; d <= 9; d++) {
  GLYPH_PIX[d] = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (GLYPHS[d].data[y * GW + x]) GLYPH_PIX[d].push([x, y]);
}

/** Clear a one-pixel keyline round the glyph, so it reads over stars and meteor trails. */
function keyline(g, d, x, y) {
  for (const [px, py] of GLYPH_PIX[d])
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) g.pixel(x + px + dx, y + py + dy, OFF);
}

// ------------------------------------------------------------ layout

const MOON_X = 4, MOON_Y = 5;                 // top-left of the moon's 54 x 54 box
const DIG_X = [64, 78, 97, 111], DIG_Y = 13;  // the time, right of the moon
const COLON_X = 93;
const COL_MID = 94;                           // centre of the text column
const DAY_CONTRAST = 0xcf, NIGHT_CONTRAST = 0x12;

/** A 3x5 label on a cleared box, so no star sits in a letter. */
function label(g, s, x, y) {
  g.fillRect(x - 1, y - 1, font3x5.measure(s) + 2, 7, OFF);
  g.text(s, x, y, { font: font3x5 });
}
const centred = (g, s, cx, y) => label(g, s, Math.round(cx - font3x5.measure(s) / 2), y);

/**
 * Phase name, lit fraction and the days to full (at full, to new) for a
 * moon at elongation E; `until(target)` gives the days to that elongation.
 */
function labels(g, E, lit, until, x, y) {
  const name = phaseName(E);
  centred(g, name, COL_MID + x, 43 + y);
  const pct = `${Math.round(lit * 100)}%`;
  const next = name === 'FULL MOON' ? 'NEW' : 'FULL';
  const days = until(next === 'NEW' ? 0 : 180);
  const full = days < 1 ? `${next} ${Math.max(1, Math.round(days * 24))}H` : `${next} ${Math.round(days)}D`;
  label(g, pct, 64 + x, 52 + y);
  label(g, full, 125 + x - font3x5.measure(full), 52 + y);
}

// ------------------------------------------------------------ the minute: a meteor

// The minute's event runs from :59 to :01 of the next minute, as tau 0..2;
// the new time is due at tau = 1. The meteor's head crosses the middle of
// the time at TC, burning each changing digit away as it passes; every old
// digit is gone by tau 0.985, and only then do the new ones condense, so
// old and new are never on the glass together.
const TC = 0.70, DONE = 0.985;

/** This minute's meteor: direction, crossing point, speed, size. */
function meteorOf(key, tox, toy, hour) {
  const dx = -1, dy = 0.26 + 0.24 * noise(key, 31), l = Math.hypot(dx, dy);
  return {
    dir: [dx / l, dy / l],
    at: [95 + tox, 25 + toy + (noise(key, 32) - 0.5) * 8],
    v: hour ? 130 : 165,
    len: hour ? 44 : 26,
    width: hour ? 3 : 2,
    start: TC - (hour ? 60 : 44) / (hour ? 130 : 165),
    end: TC + 78 / (hour ? 130 : 165),
  };
}

const headAt = (m, tau) => [m.at[0] + m.dir[0] * m.v * (tau - TC), m.at[1] + m.dir[1] * m.v * (tau - TC)];

/**
 * The meteor at tau: a bright head and a tapering, fading train behind it.
 * It burns out at `end`; its train lingers a moment as a faint dotted wake.
 */
function drawMeteor(g, m, tau) {
  if (tau < m.start || tau > m.end + 0.6) return;
  const t = Math.min(tau, m.end);
  const [hx, hy] = headAt(m, t);
  const grow = Math.min(1, ((t - m.start) * m.v) / m.len);   // the train grows from nothing
  const L = m.len * grow;
  const burning = tau <= m.end;
  const fade = burning ? 1 : 1 - (tau - m.end) / 0.6;
  // A dark keyline along the train and round the head, so it reads as one
  // object in front of the moon and the digits.
  if (burning) {
    g.thickLine(hx - m.dir[0] * L * 0.6, hy - m.dir[1] * L * 0.6, hx, hy, 3, OFF);
    g.fillCircle(hx, hy, m.width / 2 + 1.6, OFF);
  }
  for (let d = 0; d <= L; d += 0.4) {
    const x = hx - m.dir[0] * d, y = hy - m.dir[1] * d, u = d / m.len;
    // Solid near the head, then breaking up into a dotted, fading wake.
    const lvl = burning ? (u < 0.45 ? 1 : (1 - (u - 0.45) / 0.55) ** 1.3) : 0.5 * fade * (1 - u);
    if (lvl >= 1 || lvl > blue(Math.floor(x), Math.floor(y))) g.pixel(x, y);
  }
  if (burning) g.fillCircle(hx, hy, m.width / 2 + 0.3, ON);
  // The hour's fireball glows: a flickering dithered halo round the head.
  if (burning && m.width > 2) {
    const r = 4.5 + Math.sin(tau * 40) * 0.8;
    g.fillWhere((px, py, ix, iy) => {
      const q = Math.hypot(px - hx, py - hy) / r;
      return q < 1 && q > 0.3 ? 0.45 * (1 - q) : false;
    }, ON, [hx - r - 1, hy - r - 1, 2 * r + 2, 2 * r + 2]);
  }
}

/**
 * An old digit being burnt away as the meteor passes: each pixel goes out
 * as the head draws level with it, later the further it is from the path
 * (a front spreading out from the meteor), and never after DONE. About
 * one in four throws a spark that is swept along in the wake, cooling.
 */
function burnDigit(g, d, x, y, m, tau) {
  for (const [px, py] of GLYPH_PIX[d]) {
    const X = x + px + 0.5, Y = y + py + 0.5;
    const rx = X - m.at[0], ry = Y - m.at[1];
    const along = rx * m.dir[0] + ry * m.dir[1], across = Math.abs(rx * m.dir[1] - ry * m.dir[0]);
    const tv = Math.min(DONE - 0.01, TC + along / m.v + across / 150 + 0.05 * blue(X, Y));
    if (tau < tv) { g.pixel(X, Y); continue; }
    if (tau < tv) { g.pixel(X, Y); continue; }
    const h = noise(X * 7.1 + Y * 1.3, 5);
    if (h > 0.27) continue;
    const age = tau - tv, life = 0.12 + h;
    if (age > life) continue;
    const k = (1 - Math.exp(-age * 6)) / 6;            // decelerating drift
    const vx = m.dir[0] * (30 + 90 * h) + (noise(X, Y + 3) - 0.5) * 24;
    const vy = m.dir[1] * (30 + 90 * h) + (noise(Y, X + 4) - 0.5) * 24;
    g.pixel(X + vx * k, Y + vy * k + 10 * age * age);
  }
}

/** A new digit condensing out of the dark, pixel by pixel, from tau 1. */
function condenseDigit(g, d, x, y, tau) {
  const u = progress(tau, 1.0, 1.42);
  for (const [px, py] of GLYPH_PIX[d]) if (blue(x + px + 13, y + py + 7) < u) g.pixel(x + px, y + py);
}

// ------------------------------------------------------------ the hour: a lunation

// From :00:01.2 the moon runs once through its whole month in five seconds
// (new, crescent, quarter, full and round again, earthshine at new), with
// its labels counting along, and settles back on tonight's phase.
const SWEEP = [1.2, 6.2];

/** Elongation shown during the hour's sweep, or null outside it. */
function sweepE(f, E) {
  if (f.m !== 0 || f.sec < SWEEP[0] || f.sec > SWEEP[1]) return null;
  return (E + 360 * ease.inOutCubic(progress(f.sec, SWEEP[0], SWEEP[1]))) % 360;
}

export default {
  name: 'Luna',
  blurb: 'Tonight\'s real moon, maria and all, beside Didone numerals; a meteor rewrites each minute, the hour runs a whole lunation.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,

  frame(g, ctx) {
    const { fields: f, date, oled } = ctx;
    const ms = date.getTime(), T = ms / 1000, sec = f.sec;
    const [mox, moy] = orbit(date, 3, 3);
    const [tox, toy] = orbit(date, 2, 5);
    const mx = MOON_X + mox, my = MOON_Y + moy;

    // The minute's event: tau 0..2 from :59 to :01, the turn at tau = 1.
    let tau = null, oldF = f, newF = f;
    if (sec >= 59) { tau = sec - 59; newF = clockFields(new Date(ms + 60000)); }
    else if (sec < 1) { tau = sec + 1; oldF = previousMinute(date); }
    const hour = tau !== null && newF.m === 0;
    const meteor = tau === null ? null : meteorOf(newF.minuteKey, tox, toy, hour);

    // The moon: cached for the minute, live during the hour's sweep.
    const sky = lunar(ms);
    const swept = sweepE(f, sky.E);
    let bits = moonCache.bits;
    if (swept !== null) bits = moonBits(swept, liveBits, f.minuteKey);
    else if (moonCache.key !== f.minuteKey) { moonBits(sky.E, moonCache.bits, f.minuteKey); moonCache.key = f.minuteKey; }

    drawStars(g, T, mx + R, my + R, tox, toy);
    drawMoon(g, mx, my, bits);

    // The time. Outside the event, or for a digit that is not changing, the
    // digit is simply drawn; a changing one burns away, then condenses.
    const was = oldF.hh + oldF.mm, now = newF.hh + newF.mm;
    for (let k = 0; k < 4; k++) {
      const x = DIG_X[k] + tox, y = DIG_Y + toy;
      if (tau === null || was[k] === now[k]) {
        keyline(g, +now[k], x, y);
        g.blit(GLYPHS[now[k]], x, y);
      } else if (tau < 1) {
        burnDigit(g, +was[k], x, y, meteor, tau);
      } else condenseDigit(g, +now[k], x, y, tau);
    }
    g.fillRect(COLON_X + tox, DIG_Y + 7 + toy, 2, 2);
    g.fillRect(COLON_X + tox, DIG_Y + 15 + toy, 2, 2);

    centred(g, `${f.dow} ${f.day} ${f.month}`, COL_MID + tox, 3 + toy);
    if (swept === null) labels(g, sky.E, sky.lit, (target) => (nextAt(ms, target) - ms) / DAY, tox, toy);
    else labels(g, swept, (1 - Math.cos(swept * RAD)) / 2,
      (target) => ((((target - swept) % 360) + 360) % 360) / 360 * SYNODIC, tox, toy);

    if (meteor) drawMeteor(g, meteor, tau);

    oled.contrast(DAY_CONTRAST + (NIGHT_CONTRAST - DAY_CONTRAST) * ctx.night);
  },
};
