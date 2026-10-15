// Acrobats: a circus troupe on a teeterboard builds the time with its bodies.
//
// Every numeral is a formation of bold stick acrobats (round head with an
// eye, 4-px body, 2-px arms, split feet): a 1 is one acrobat standing on
// another's head, holding his ankles, the top one's arm out stiff as the
// flag; a 7 is a bar-lier and a handstand on the diagonal; a 2, 3, 4, 5 are
// chains of bodies head to feet. The closed bowls of 0, 6, 8, 9 are WHEELS:
// rings of contortionists holding ankles that turn all the time, so the
// outline never changes while the heads run round it (acrobats-glyphs.js).
// Arms reach only into a per-digit clearance mask, so no hand ever closes a
// counter, touches a stroke or bridges the gap to the neighbour.
//
// Alive every second: the whole troupe stands on one long teeterboard that
// rocks on a 2 s pendulum; each second the high end's pair is flung into a
// hop (squash, air, landing squash), the other pair bobs; arms wave, and are
// thrown up on every beat. A clown in the middle juggles a three-ball
// cascade. Every 12 s a flourish: the clown's back flip with a ta-da wave
// down the line, or the flying trapeze lowered into the hours/minutes gap,
// swung and piked. Two spotlight cones sweep the hatched tent wall.
// Minute turn: the changing formations crouch, leap at :59.45 and tumble
// apart in somersaults, each body flying to its place in the new numeral,
// landing at :00.45 with a squash; never a wrong number (the old digit is
// whole until it leaps; in the air the bodies are a scatter, not a glyph).
// Hour: the troupe stamps, the board catapults the clown off the top of the
// glass and he falls back in a triple somersault, while a hatched sunburst
// opens and turns behind the numerals (which keep their moats) for ~9 s.
//
// Pair: ink #16120e on circus yellow #f2c230, the two inks of an old circus
// poster's one-colour print: black on the yellow of the big top's canvas.
// Grey exists only as 1-bit hatching (the tent panels, the sunburst). Every
// actor is drawn twice: fat in yellow (its moat) then in ink. Night dims
// the backlight only.
//
// Cost: hard kit shapes only, plus one integer loop for the tent into g.buf;
// no per-minute caches. Tables: clearance masks 10 x 42 x 58 bytes and the
// tent's angle map 12.8 KB.
import { clockFields, hash } from '../js/kit.js';
import { GLYPHS, K, wheelPath, CH } from './acrobats-glyphs.js';
import { body, juggler, bigTop, trapeze, INK_C, GROUND_C } from './acrobats-draw.js';

const W = 160, H = 80;
const CELL_X = [5, 36, 98, 129];      // left edge of each 26-px cell
const BOARD_Y = 70;                   // the teeterboard's centre line at the fulcrum
const T_LAUNCH = 59.45, T_FLY = 1.0;  // the leap: off at :59.45, down at :00.45
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- the teeterboard
// It rocks all the time, a slow pendulum (period 2 s): each second one end
// comes down and the other goes up, and the troupe on the high end hops.
const TILT = 0.085;
function plank(T) { return { th: TILT * Math.cos(Math.PI * T), xc: 80 }; }
const boardY = (pl, x) => BOARD_Y + (x - pl.xc) * pl.th;

// ---------------------------------------------------------------- poses
/** Where slot i's cell sits at time T: { ox, base, k } (k: vertical squash). */
function cellAt(i, T, pl, hop) {
  const x0 = CELL_X[i];
  const top = boardY(pl, x0 + 13) - 2;
  let dy = 0, k = 1;
  if (hop) {
    const ti = T - (i & 1) * 0.08, n = Math.floor(ti), p = ti - n;
    // at even seconds the right end is down: the left (hours) are flung up
    const high = (n & 1) === 0 ? i < 2 : i >= 2;
    if (high) {
      if (p < 0.1) k = 1 - 0.06 * sm(p / 0.1);
      else if (p < 0.55) { const u = (p - 0.1) / 0.45; dy = -4 * 4 * u * (1 - u); k = 1 - 0.06 * (1 - sm(u / 0.25)); }
      else if (p < 0.7) k = 1 - 0.05 * Math.sin(Math.PI * (p - 0.55) / 0.15);
    } else if (p < 0.25) k = 1 - 0.035 * Math.sin(Math.PI * p / 0.25);
  }
  return { ox: x0, base: Math.round(top + dy), k };
}

const wheelRot = (T) => 26 * T + 9 * Math.sin(T * TAU);

/** Rest paths of digit d in cell c at time T: [{ P, shoes, wheel }] in world coords. */
function restBodies(d, c, T, out) {
  const G = GLYPHS[d];
  const tr = (src, P) => {
    for (let j = 0; j < K; j++) { P[2 * j] = c.ox + src[2 * j]; P[2 * j + 1] = c.base - (CH - src[2 * j + 1]) * c.k; }
    return P;
  };
  G.bodies.forEach((q, j) => out.push({ P: tr(q.p, new Float32Array(2 * K)), shoes: q.shoes, arms: q.arms, G, cell: c, flag: j === 0 && G.flag ? G.flag : null }));
  const rot = wheelRot(T);
  for (const w of G.wheels) for (let k = 0; k < w.n; k++) {
    out.push({ P: tr(wheelPath(w, k, rot, new Float32Array(2 * K)), new Float32Array(2 * K)), shoes: false, G, cell: c });
  }
  return out;
}

function centroid(P) {
  let x = 0, y = 0;
  for (let j = 0; j < K; j++) { x += P[2 * j]; y += P[2 * j + 1]; }
  return [x / K, y / K];
}

/** Bodies in flight from formation A (old) to B (new), u in 0..1. */
function flight(A, B, u, out) {
  A = A.slice().sort((a, b) => centroid(b.P)[1] - centroid(a.P)[1]);
  B = B.slice().sort((a, b) => centroid(b.P)[1] - centroid(a.P)[1]);
  const n = Math.max(A.length, B.length);
  const ue = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
  for (let j = 0; j < n; j++) {
    const a = A[j], b = B[j];
    const pa = a ? a.P : null, pb = b ? b.P : null;
    const ca = pa ? centroid(pa) : null, cb = pb ? centroid(pb) : null;
    const s0 = ca ?? [cb[0] - 8, cb[1] - 95], s1 = cb ?? [ca[0] + 8, ca[1] - 95];
    const hgt = 24 + (j % 3) * 4;
    const cx = s0[0] + (s1[0] - s0[0]) * u, cy = s0[1] + (s1[1] - s0[1]) * u - hgt * 4 * u * (1 - u);
    const dir = j & 1 ? 1 : -1, ang = dir * TAU * ue, cr = Math.cos(ang), sr = Math.sin(ang);
    const P = new Float32Array(2 * K), sh = sm(u);
    for (let k = 0; k < K; k++) {
      const ax = pa ? pa[2 * k] - ca[0] : pb[2 * k] - cb[0], ay = pa ? pa[2 * k + 1] - ca[1] : pb[2 * k + 1] - cb[1];
      const bx = pb ? pb[2 * k] - cb[0] : ax, by = pb ? pb[2 * k + 1] - cb[1] : ay;
      const lx = ax + (bx - ax) * sh, ly = ay + (by - ay) * sh;
      P[2 * k] = cx + lx * cr - ly * sr; P[2 * k + 1] = cy + lx * sr + ly * cr;
    }
    out.push({ P, shoes: false, G: null, cell: null, fly: true });
  }
}

/** The 1's flag: its top acrobat's arm, held out stiff and down-left. */
function flagArm(g, a, pass) {
  const c = a.cell, F = a.flag;
  const X = (p) => c.ox + p[0], Y = (p) => c.base - (CH - p[1]) * c.k;
  g.thickLine(X(F[0]), Y(F[0]), X(F[1]), Y(F[1]), pass ? 3 : 7, pass ? INK_C : GROUND_C);
}

// ---------------------------------------------------------------- the face
export default {
  name: 'Acrobats',
  blurb: 'A circus troupe on a rocking teeterboard: each numeral is a human pyramid, handstand or turning wheel of acrobats; each minute they somersault into the new formation.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, mk = f.minuteKey;
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    const ms = ctx.date.getTime(), T = (ms % 86400000) / 1000;
    const prv = clockFields(new Date(ms - 60000)), nxt = clockFields(new Date(ms + 60000));
    const cur = f.hh + f.mm, old = prv.hh + prv.mm, nw = nxt.hh + nxt.mm;
    const pl = plank(T);

    // ---- the troupe
    const acts = [];
    for (let i = 0; i < 4; i++) {
      let tau = null, dA, dB;
      const n0 = acts.length;
      if (s >= 58.5 && cur[i] !== nw[i]) { tau = s - T_LAUNCH; dA = +cur[i]; dB = +nw[i]; }
      else if (s < 1.6 && old[i] !== cur[i]) { tau = s + 60 - T_LAUNCH; dA = +old[i]; dB = +cur[i]; }
      if (tau === null) {
        const c = cellAt(i, T, pl, true);
        for (const a of restBodies(+cur[i], c, T, [])) acts.push(a);
        for (let j = n0; j < acts.length; j++) acts[j].slot = i;
        continue;
      }
      if (tau < 0) {
        // the crouch before the leap
        const c = cellAt(i, T, pl, false);
        c.k = tau < -0.15 ? 1 - 0.08 * sm((tau + 0.95) / 0.8) : 0.92 + 0.08 * sm((tau + 0.15) / 0.15);
        for (const a of restBodies(dA, c, T, [])) { a.up = true; a.slot = i; acts.push(a); }
      } else if (tau < T_FLY) {
        const TA = T - tau, TB = T + (T_FLY - tau);
        const A = restBodies(dA, cellAt(i, TA, plank(TA), false), TA, []);
        const B = restBodies(dB, { ...cellAt(i, TB, plank(TB), false), k: 0.93 }, TB, []);
        flight(A, B, tau / T_FLY, acts);
      } else {
        const c = cellAt(i, T, pl, false), v = (tau - T_FLY) / 0.4;
        c.k = v >= 1 ? 1 : 0.93 + 0.07 * (1 + 2.7 * (v - 1) ** 3 + 1.7 * (v - 1) ** 2);
        for (const a of restBodies(dB, c, T, [])) { a.up = v < 1.2; a.slot = i; acts.push(a); }
      }
    }

    // ---- the tent
    const cones = [];
    for (let k = 0; k < 2; k++) cones.push(k ? 118 : 42, 80 + 74 * Math.sin(0.29 * T + k * 2.4));
    const hourShow = prv.h !== f.h && s < 11;
    let sunR = 0;
    if (hourShow) sunR = 112 * sm((s - 0.5) / 1.6) * (1 - sm((s - 8.8) / 1.6));
    bigTop(g, cones, sunR, Math.floor(T * 40) & 255);

    // flourishes, every 12 s: even ones the juggler's back flip (and a ta-da
    // wave down the line), odd ones the flying trapeze swings over the top
    const slot12 = Math.floor(s / 12), in12 = s - slot12 * 12;
    const flip = !hourShow && (slot12 & 1) === 0 && s < 57;
    const flo = flip ? in12 - 6 : hourShow && s > 5 ? (s - 5) % 2.2 : -9;
    const trap = !hourShow && (slot12 & 1) === 1 ? in12 - 3 : -9;
    // ---- the trapeze, in the gap between hours and minutes (it is the
    // colon): lowered from the rigging, swung, pumped into a pike, raised
    if (trap > 0 && trap < 6.4) {
      const e = Math.min(trap, 6.4 - trap), down = sm(e / 0.9);
      const w = (2 * Math.PI) / 1.6, A = 0.3 * sm((trap - 0.5) / 1.2) * sm((6.4 - trap - 0.3) / 1.2);
      const th = A * Math.sin(w * (trap - 0.5)), om = A * w * Math.cos(w * (trap - 0.5));
      const pike = 0.8 * Math.max(0, Math.sin(w * (trap - 0.5) - 0.4)) * sm((e - 1) / 0.6);
      for (let pass = 0; pass < 2; pass++) trapeze(g, pass, th, -0.12 * om, pike, -4, 18 - 40 * (1 - down));
    }

    // ---- arms: a slow wave, thrown up on the beat; a ta-da every 12 s
    const bp = s - Math.floor(s);
    const armA = (j, x) => {
      let w = 1.3 + 0.5 * Math.sin(T * 2.3 + j * 1.9);
      if (bp < 0.3) w -= (w - 0.5) * Math.sin(Math.PI * bp / 0.3);
      const wv = flo - (x - 10) / 140 * 0.8;
      if (wv > 0 && wv < 1.4) w = w + (0.15 - w) * Math.sin(Math.PI * Math.min(1, wv / 1.4));
      return w;
    };

    // moats, then the board, then ink
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < acts.length; j++) {
        const a = acts[j], x = a.P[0];
        let al = a.fly ? 2.6 : a.up ? 0.3 : armA(j, x), ar = a.fly ? 2.6 : a.up ? 0.3 : armA(j + 3, x);
        if (a.arms === 'none') { al = NaN; ar = NaN; }
        else if (a.arms === 'hold') { al = 0.2; ar = 0.2; }                 // holding the ankles above
        else if (a.arms === 'hands') { al = 0.42 + 0.06 * Math.sin(T * 6); ar = al; } // handstand: palms on the board
        body(g, a.P, pass, al, ar, a.shoes, a.cell ? { G: a.G, ox: a.cell.ox, base: a.cell.base, k: a.cell.k, left: a.slot % 2 === 0, right: a.slot % 2 === 1 } : null);
        if (a.flag) flagArm(g, a, pass);
      }
      if (pass) break;
      const x0 = 1, x1 = 159;
      g.thickLine(x0, boardY(pl, x0), x1, boardY(pl, x1), 3, INK_C);
      g.fillPolygon([[80, BOARD_Y], [71, 80], [89, 80]], INK_C);
      g.fillRect(0, 79, W, 1, INK_C);
    }

    // ---- the juggler on the middle of the board, with a cascade of three.
    // At the hour the troupe stamps and the board flings him up off the top
    // of the glass; he comes back down in a triple somersault.
    const jy = BOARD_Y - 1.5;
    let lift = 0, rot = 0, hgt = 12, lines = 0;
    const cat = hourShow ? s - 2.4 : -9, CT = 2.6;
    if (cat > 0 && cat < CT) {
      const u = cat / CT; lift = 115 * 4 * u * (1 - u);
      rot = u > 0.55 ? -Math.PI * 6 * sm((u - 0.55) / 0.42) : 0;
      if (u < 0.3) lines = 1;
    } else if (flo > 0 && flo < 1.1) { const u = flo / 1.1; lift = 13 * 4 * u * (1 - u); rot = -Math.PI * 2 * sm(u); hgt = 22; }
    const balls = [];
    for (let j = 0; j < 3; j++) {
      const ph = (s * 3 + j) % 3, back = ph >= 1.5, u = back ? (ph - 1.5) / 1.5 : ph / 1.5;
      balls.push(80 + (back ? 6 - 12 * u : -6 + 12 * u), jy - 12 - hgt * 4 * u * (1 - u) - Math.min(lift, 13) * 0.5);
    }
    const hand = 0.5 + 0.5 * Math.sin(s * 3 * Math.PI);
    if (lift < 90) {
      juggler(g, 0, 80, jy, lift, rot, hand, balls);
      juggler(g, 1, 80, jy, lift, rot, hand, balls);
    }
    if (lines) { const y0 = Math.round(jy - lift); for (const dx of [-5, 0, 5]) g.fillRect(80 + dx, y0 + 2, 1, 10 + (dx ? 0 : 6), INK_C); }
  },
};
