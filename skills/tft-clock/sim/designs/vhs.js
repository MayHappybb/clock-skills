// VHS: a worn 1980s aerobics tape. The four numerals are the instructors:
// each body IS the numeral (a heavy, round, italic letter in a two-tone
// leotard with a belt at the waist, vhs-glyphs.js), with a permed or
// pony-tailed head on top, arms in wristbands out of the shoulders and legs
// in tights, scrunched leg warmers and white high-tops underneath. Ten
// numerals, ten instructors, each in their own costume. The class works out
// behind them, half a count late; a boombox pumps the beat on the floor
// between the hours and the minutes, and the TV set's marquee bulbs chase
// along the top of the cyc, one bulb a count.
//
// The time is never still: the routine is counted two counts a second in
// phrases of eight (jumping jacks, march with curls, step-touch and clap,
// side reach, kicks, punches, goal-post knees, hamstring curls): every count
// each body snaps into its next pose and holds, hops (up to 4.5 px), dips
// 2 px on the count, leans (the numeral shears, never turns) and squashes on
// the landing, while under every move the whole body rocks 4 px side to
// side over two counts; ponytails swing, mouths call the count. And the tape is never still: rows wander sideways, the top
// rows bend, a thin band of tracking noise rolls up through the picture,
// the head-switching seam frays the bottom rows. Flourishes: a kick line at
// :12 and :48; at :24 the tape is PAUSED on a held pose (the still frame
// shakes, a noise bar sits across it) and then PLAYs on; at :36 a heavy
// tracking glitch tears up through the whole picture.
//
// Minute turn: the VCR cues ahead (">>" on the OSD, search noise bars, the
// whole class at 3x speed): the changing instructors jog back into the class,
// shrinking with distance until they are gone (they only ever get smaller),
// and after :00 the new instructor jogs forward out of the back row to the
// front. Hour: the tape reaches the COOL DOWN chapter: the studio's lights
// change to sunset in a venetian-blind wipe, a striped 80s sun rises behind
// the class, and the whole class and the four instructors hold slow
// stretches together, the time reading all along.
//
// Palette: what a taped TV gym looked like: one seamless blue-violet cyc
// (wall and floor one sweep, kept dark and calm), dim class leotards, and
// loud leotard brights (hot pink, cyan, lemon, lime, violet, coral, mint)
// that are the only strong colours, so the time is the strongest contrast.
// Then the tape wears it all (vhs-tape.js): colour bleeds late to the right
// of its edges (the numerals' only outline is that soft fringe), blacks lift
// to grey, whites soften, odd field lines dim. The VCR's own OSD is drawn
// after the tape, crisp, as a VCR keys it in. Hard pixels throughout: the
// softness is the tape's. Night: the studio lights go down (a near-black
// cyc, the class barely lit), the backlight dims to 45 %.
//
// Cost: bodies are sampled from ten 26 x 42 distance fields (Int8, 11 KB
// flash) per pixel of each body box; limbs and heads are kit shapes; the
// tape pass is ~30 integer ops a pixel over the whole glass. Everything is
// closed form in the time (the "tape time" that the cue and the pause
// advance or hold is a formula of the wall clock): no caches, no scratch
// frame.
import { clockFields, hash, progress, ease } from '../js/kit.js';
import { W, H, FLOOR, BACK, COSTUME, SET, INK, studio, boombox, marquee, osdText, osdWidth } from './vhs-art.js';
import { newPose, perform, instructor, member, paint, ROUTINE } from './vhs-cast.js';
import { tape, band } from './vhs-tape.js';

const SLOT_X = [17, 50, 110, 143];
const CLASS_X = [17, 50, 64, 80, 96, 110, 143];
const CLASS_C = [
  { top: 0x8a4a9a, belt: 0x8a4a9a, tights: 0x5a4a8a, warm: 0x5a7a8a, rib: 0x4a6070, hair: 0x4a3030, skin: 0x9a7a70, style: 'bob' },
  { top: 0x3a8a8a, belt: 0x3a8a8a, tights: 0x7a4a7a, warm: 0x8a5a7a, rib: 0x6a4a60, hair: 0x8a7050, skin: 0x8a6a5a, style: 'bob' },
  { top: 0x9a6a3a, belt: 0x9a6a3a, tights: 0x4a5a8a, warm: 0x7a8a4a, rib: 0x5a6a3a, hair: 0x2a2028, skin: 0x9a7466, style: 'bob' },
];
const PAUSE0 = 23.75, PD = 1.5;     // the pause: held from :23.75 for 1.5 s
const FF0 = 58, FFD = 3, FFK = 1 + (4 + PD) / FFD;   // the cue: :58 to :01, fast enough to make up a phrase and the pause

const POSES = Array.from({ length: 4 }, newPose), CPOSE = newPose();

/** Tape time: the wall clock, held by the pause and run ahead by the cue (continuous across minutes). */
function tapeTime(mk, s) {
  const base = 64 * (mk % 4096);
  if (s >= FF0) return base + FF0 - PD + FFK * (s - FF0);
  if (s < FFD - (60 - FF0)) return base - 64 + FF0 - PD + FFK * (s + 60 - FF0);
  if (s < PAUSE0) return base + s;
  if (s < PAUSE0 + PD) return base + PAUSE0;
  return base + s - PD;
}

function routineAt(c) {
  const ph = Math.floor(c / 8);
  let k = hash(ph, 7) % ROUTINE.length;
  if (k === hash(ph - 1, 7) % ROUTINE.length) k = (k + 3) % ROUTINE.length;
  return ROUTINE[k];
}

/** The move for count c, given the wall second the count falls in and whether this is the hour's minute. */
function moveAt(c, sw, hour) {
  if (hour && sw >= 1.45 && sw < 12.5) return 'cool';
  if ((sw >= 12 && sw < 14) || (sw >= 48 && sw < 50)) return 'kickline';
  return routineAt(c);
}

const sm = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export default {
  name: 'VHS',
  blurb: 'A worn 1980s aerobics tape: the numerals are the instructors, dancing on every count; each minute the VCR cues ahead and a new instructor jogs out of the class.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey, night = ctx.night;
    ctx.lcd.backlight(1 - 0.55 * night);
    const T = (ctx.date.getTime() % 86400000) / 1000, F = Math.floor(T * 60);
    const prv = clockFields(new Date(ctx.date.getTime() - 60000)), nxt = clockFields(new Date(ctx.date.getTime() + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const hour = prv.h !== f.h;
    const hourShow = hour && s < 13;
    const cue = s >= FF0 || s < FFD - (60 - FF0);
    const paused = s >= PAUSE0 && s < PAUSE0 + PD;

    // ---- tape time and the count
    const tau = tapeTime(mk, s), c2 = tau * 2, c = Math.floor(c2), p = c2 - c;
    const rate = cue ? FFK : 1;
    const swPrev = s - (p + 0.5) / (2 * rate);
    const mv = moveAt(c, s, hour), mvPrev = moveAt(c - 1, swPrev, hour);
    const slow = mv === 'cool';

    // ---- the set (the hour's blinds wipe between the studio and the sunset)
    const base = night >= 0.5 ? SET.night : SET.day;
    let blind = 0, sun = 0;
    if (hourShow) {
      blind = sm(progress(s, 1.2, 2.2)) * (1 - sm(progress(s, 11.6, 12.6)));
      sun = sm(progress(s, 2.0, 4.2)) * (1 - sm(progress(s, 10.4, 12.2)));
    }
    if (blind <= 0) studio(g, base, 0, H, 0, T);
    else if (blind >= 1) studio(g, SET.dusk, 0, H, sun, T);
    else {
      // each 8-row slat turns from its middle outwards
      for (let y0 = 0; y0 < H; y0 += 8) {
        const open = Math.round(blind * 4.6);
        const a = Math.max(y0, y0 + 4 - open), b = Math.min(y0 + 8, y0 + 4 + open);
        if (a > y0) studio(g, base, y0, a, 0, T);
        if (b > a) studio(g, SET.dusk, a, b, sun, T);
        if (b < y0 + 8) studio(g, base, b, y0 + 8, 0, T);
      }
    }
    const wallNow = blind >= 0.5 ? SET.dusk.wall : base.wall;
    marquee(g, c, mv === 'kickline' || (hourShow && s > 2 && s < 11 && (c & 1) === 0), night >= 0.5);

    // ---- the class, half a count behind (in unison for the cool-down)
    const lag = slow ? 0 : 0.5;
    const cc2 = c2 - lag, ccn = Math.floor(cc2);
    const cmv = slow ? 'cool' : moveAt(ccn, s - lag / (2 * rate), hour), cmvP = moveAt(ccn - 1, s - (lag + 0.5) / (2 * rate), hour);
    perform(CPOSE, cmv, ccn, cc2 - ccn, cmvP, cmv === 'cool');
    const cf = night >= 0.5 ? 0.55 : 0.25;
    for (let k = 0; k < CLASS_X.length; k++) member(g, CLASS_X[k], BACK, CPOSE, paint(CLASS_C[k % 3], cf, wallNow));
    boombox(g, p < 0.25 ? 1 - p / 0.25 : 0, c, p, night >= 0.5);

    // ---- the instructors: who is where (the cue: back into the class, and out of it)
    const acts = [];
    for (let i = 0; i < 4; i++) {
      let d = +cur[i], sc = 1, fl = FLOOR, fade = 0, show = true, jog = false;
      if (s >= FF0 && cur[i] !== nw[i]) {
        const u = ease.inOutQuad(progress(s, 58.2, 59.6));
        sc = 1 - 0.56 * u; fl = FLOOR - (FLOOR - BACK - 1) * u; jog = true;
        fade = progress(s, 59.25, 59.85); show = fade < 1;
      } else if (s < 1.6 && old[i] !== cur[i]) {
        const u = 1 - ease.outCubic(progress(s, 0.12, 1.45));
        sc = 1 - 0.56 * u; fl = FLOOR - (FLOOR - BACK - 1) * u; jog = u > 0.05;
        fade = 1 - progress(s, 0.02, 0.35); show = fade < 1;
      }
      if (show) acts.push({ i, d, sc, fl, fade, jog });
    }
    acts.sort((a, b) => a.sc - b.sc);
    for (const q of acts) {
      const P = POSES[q.i];
      if (q.jog) perform(P, 'jog', c, p, 'jog');
      else if (mv === 'kickline' && !slow) {
        // the kick line ripples left to right
        const dl = 0.35 * q.i * sm(progress(s % 36, 12, 12.4)) * (1 - sm(progress(s % 36, 13.6, 14)));
        const c3 = c2 - dl, cn = Math.floor(c3);
        perform(P, 'kickline', cn, c3 - cn, cn === c ? mvPrev : 'kickline');
      } else perform(P, mv, c, p, mvPrev, slow);
      const C = paint(COSTUME[q.d], q.fade, wallNow);
      instructor(g, q.d, SLOT_X[q.i] + (1 - q.sc) * (q.i < 2 ? 4 : -4), q.fl, q.sc, P, C, q.i);
    }

    // ---- recorded on the tape: the cool-down chapter title
    if (hourShow && s >= 2.2 && s < 11) {
      const txt = 'COOL DOWN', n = Math.min(txt.length, Math.floor((s - 2.2) * 12));
      const shown = txt.slice(0, n), x = Math.round(80 - osdWidth(txt) / 2);
      if (s < 10.5 || ((s * 8) | 0) % 2 === 0) {
        osdText(g, shown, x + 1, 4, 0xff3d9a, 0xff3d9a);
        osdText(g, shown, x, 3, 0xffe14a, INK);
      }
    }

    // ---- the tape
    const bands = [];
    // the worn tape's own band, always rolling up
    const ry = 86 - ((T * 13) % 120);
    bands.push(band(Math.round(ry), 4, 2.6, 0.3));
    if (cue) {
      const w = s >= FF0 ? s - FF0 : s + 60 - FF0, env = sm(progress(w, 0, 0.2)) * (1 - sm(progress(w, FFD - 0.3, FFD)));
      for (let k = 0; k < 2; k++) {
        const y = ((w * 16 + k * 46) % 92) - 8;
        bands.push(band(Math.round(y), 6, 5 * env, 0.9 * env));
      }
    }
    if (paused) bands.push(band(57, 5, 3, 0.7));
    if (s >= 36 && s < 38.2) {
      const u = (s - 36) / 2.2;
      bands.push(band(Math.round(86 - 104 * u), 11, 6 * Math.sin(Math.PI * u) + 1, 1));
    }
    const jy = paused && (F % 4 < 2) ? 1 : 0;
    tape(g, F, T, bands, { wob: paused ? 0.4 : 1, flag: 2.5, lift: 26, gain: 212, sat: 220, grain: 0, hs: true, jy });

    // ---- the VCR's on-screen display (crisp: keyed in after playback)
    let osd = null;
    if (cue) osd = '>>';
    else if (paused) osd = '| PAUSE';
    else if ((s >= 1 && s < 4 && !hourShow) || (hourShow && s >= 1 && s < 2.2) || (s >= PAUSE0 + PD && s < PAUSE0 + PD + 2.5)) osd = 'PLAY >';
    if (osd) osdText(g, osd, 5, 4, 0xeaf2ee, 0x101018);
  },
};
