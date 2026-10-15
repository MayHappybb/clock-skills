// Choreography for "rubberhose": every pose is a closed-form function of the
// clock. The beat is two a second; on it every body bobs, squashes and
// stretches, feet tap in turn, arms pump; gags, the minute turn and the hour's
// chorus line blend over that with smooth weights, so nothing ever pops.
import { hash, sin } from '../js/kit.js';

export const SLOT_X = [22, 51, 109, 138];
export const REST_BY = 62, FLOOR = 73;
export const EXIT_T0 = 56.5;            // the bow starts; the dust is gone by :59.5
export const GAG_T = [8, 20, 32, 44], GAG_LEN = 3.6;
export const GAGS = ['tap', 'heel', 'note', 'rain'];

const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const env = (t, len, r = 0.3) => sm(t / r) * sm((len - t) / r);
const PI = Math.PI;

/** This minute's gag at second s: { kind, slot, t } or null. */
export function gagAt(mk, s) {
  for (let j = 0; j < GAG_T.length; j++) {
    const t = s - GAG_T[j];
    if (t >= 0 && t < GAG_LEN) return { kind: GAGS[(hash(mk, 11) + j) % 4], slot: hash(mk, j, 5) % 4, t };
  }
  return null;
}

/** A pose as plain numbers so poses can blend. */
function restPose(i, s, mk, hit) {
  const b = s * 2, n = Math.floor(b), p = b - n;
  const ph = b * 0.5 + i * 0.37;
  let sq = 0.05 * sin(PI * Math.min(p / 0.35, 1));
  if (hit) sq += 0.07 * sin(PI * Math.min(p / 0.4, 1));
  const bob = 3 * sin(PI * p);
  const cx0 = SLOT_X[i];
  const sway = 1.4 * sin(PI * ph), lean = 2.2 * sin(PI * ph + 0.6);
  const by = REST_BY - bob;
  const lift = (n + i) & 1, tap = p < 0.5 ? 2 * sin(PI * p * 2) : 0;
  const jz = ((b + i * 1.3) % 4) / 2, jazz = jz < 1 ? sin(PI * jz) ** 2 : 0;
  const swing = 3 * sin(PI * (b * 0.5 + i * 0.5));
  return {
    cx: cx0 + sway, by, sx: 1 + sq * 0.8, sy: 1 - sq, k: lean,
    flx: cx0 - 6, fly: FLOOR - 1 - (lift ? tap : 0), frx: cx0 + 6, fry: FLOOR - 1 - (lift ? 0 : tap),
    knee: 1.5 + (3 - bob) * 0.5,
    hlx: cx0 + sway - 13 - 2 * jazz, hly: by - 8 + swing - 7 * jazz, hrx: cx0 + sway + 13 + 2 * jazz, hry: by - 8 - swing - 7 * jazz,
    elbow: 2, up: jazz > 0.5,
  };
}

function blend(a, o, w) {
  if (w <= 0) return a;
  const r = { ...a };
  for (const key of ['cx', 'by', 'sx', 'sy', 'k', 'flx', 'fly', 'frx', 'fry', 'knee', 'hlx', 'hly', 'hrx', 'hry', 'elbow']) r[key] = a[key] + (o[key] - a[key]) * w;
  if (w > 0.5) { r.up = o.up; if (o.wheel !== undefined) r.wheel = o.wheel; }
  return r;
}

/**
 * Where digit slot i is, and what it is doing, at second s.
 * job: { exit: te } (te seconds since EXIT_T0), { enter: ti }, or null.
 * Returns { pose, show: 'body' | 'none', dust, lines, puff, zipX, star, taps }.
 */
export function perform(i, s, mk, job, gag, chorus, hit) {
  let P = restPose(i, s, mk, hit);
  const out = { pose: P, show: 'body', dust: 0, lines: null, puff: null, star: null, taps: false, shiver: false };
  const cx0 = SLOT_X[i];

  // ---- gags (additive, enveloped)
  if (gag && gag.slot === i && !job) {
    const t = gag.t, e = env(t, GAG_LEN, 0.25);
    if (gag.kind === 'tap') {
      const k = Math.floor(t * 10) & 1, sh = 3 * sin(PI * t * 2.5);
      P = { ...P, fly: P.fly - (k ? 3 : 0) * e, fry: P.fry - (k ? 0 : 3) * e, by: P.by + (k ? 1 : 0) * e - 2 * e,
        flx: P.flx + sh * e, frx: P.frx + sh * e, cx: P.cx + sh * 0.5 * e, k: P.k - sh * e,
        hly: P.hly + (k ? -4 : 3) * e, hry: P.hry + (k ? 3 : -4) * e, up: e > 0.5 };
      out.taps = e > 0.5 ? (k ? 'R' : 'L') : false;
    } else if (gag.kind === 'heel') {
      for (const t0 of [0.4, 1.9]) {
        const u = (t - t0) / 1.2;
        if (u <= 0 || u >= 1) continue;
        const hgt = 11 * 4 * u * (1 - u), tuck = sin(PI * u);
        P = { ...P, by: P.by - hgt, fly: P.fly - hgt * 0.75 - 2 * tuck, fry: P.fry - hgt * 0.75 - 2 * tuck,
          flx: P.flx + 4 * tuck, frx: P.frx - 4 * tuck, hly: P.hly - 6 * tuck, hry: P.hry - 6 * tuck, up: true };
        if (u > 0.42 && u < 0.62) out.star = [Math.round(cx0), Math.round(P.fly - 3)];
      }
    } else if (gag.kind === 'rain') {
      if (t > 0.7 && t < 2.9) out.shiver = true;
    }
  }
  // the big note ducks each digit as it passes over
  if (gag && gag.kind === 'note' && !job) {
    const nx = noteX(gag.t), d = Math.abs(nx - cx0);
    if (d < 16) { const w = sm(1 - d / 16) * 0.13; P = { ...P, sy: P.sy - w, sx: P.sx + w * 0.6 }; }
  }

  // ---- the hour's chorus line: all four kick in sync
  if (chorus >= 0 && !job) {
    const b = s * 2, n = Math.floor(b), p = b - n, w = env(chorus, 9.2, 0.6);
    const kk = sin(PI * p), side = n & 1 ? 1 : -1;
    const by = REST_BY - 3 * sin(PI * p);
    const O = { ...P, cx: cx0, by, k: 0, sx: 1, sy: 1,
      flx: cx0 - 6 - (side < 0 ? 8 * kk : 0), fly: FLOOR - 1 - (side < 0 ? 11 * kk : 0),
      frx: cx0 + 6 + (side > 0 ? 8 * kk : 0), fry: FLOOR - 1 - (side > 0 ? 11 * kk : 0),
      hlx: cx0 - 13, hly: by - 1 + 2 * sin(PI * b), hrx: cx0 + 13, hry: by - 1 - 2 * sin(PI * b), up: true };
    P = blend(P, O, w);
  }

  // ---- the minute turn: bow, wind up, zip off right, leave a digit of dust
  if (job && job.exit !== undefined) {
    const te = job.exit;
    const bow = sin(PI * Math.min(1, Math.max(0, te / 1.0)));
    const wu = sm((te - 1.0) / 0.5);
    const by = REST_BY + 2 * bow - 3 * wu;
    const O = { ...P, cx: cx0, by, k: -4 * wu, sy: 1 - 0.12 * bow - 0.05 * wu, sx: 1 + 0.05 * bow,
      hlx: cx0 - 15 + 3 * wu, hly: by - 3 - 12 * wu, hrx: cx0 + 15 - 4 * wu, hry: by - 3 - 2 * wu,
      flx: cx0 - 6, fly: FLOOR - 1, frx: cx0 + 6, fry: FLOOR - 1, knee: 3 + 2 * bow, up: false };
    if (te >= 1.0) O.wheel = te * 40;
    P = blend(P, O, sm(te / 0.25));
    out.blink = te > 0.25 && te < 0.85;
    out.lookRight = te >= 1.0;
    if (te >= 1.8) {
      const u = (te - 1.8) / 0.45;
      out.dust = Math.max(0, 0.6 * (1 - (te - 1.8) / 1.15));
      out.dustPose = { cx: cx0, by: REST_BY - 3, sx: 1, sy: 0.95, k: -4 };
      if (u < 1) {
        const dx = 175 * u ** 2.4;
        P = { ...P, cx: cx0 + dx, k: 5, sx: 1 + 0.4 * sm(u * 3), sy: 0.94, hlx: cx0 + dx - 16, hly: P.by - 16, hrx: cx0 + dx + 10, hry: P.by - 22 };
        out.lines = [cx0 - 6, Math.round(cx0 + dx - 12)];
      } else {
        out.show = 'none';
        const r = (te - 2.25) / 0.55;
        if (r < 1) out.lines = [Math.round(cx0 - 6 + r * (166 - cx0)), 166];
      }
      out.puff = te - 1.8;
    }
  }
  // ---- the entrance: POOF, and the new digit springs up out of the cloud
  if (job && job.enter !== undefined) {
    const ti = job.enter;
    out.poof = ti;
    const u = Math.min(1, Math.max(0, (ti - 0.12) / 0.9));
    const sc = 0.25 + 0.75 * u * (2 - u) + 0.18 * sin(PI * u) * u;
    if (ti < 0.12) out.show = 'none';
    const w = 1 - sm((ti - 1.0) / 0.5);
    const by = REST_BY;
    const O = { ...P, cx: cx0, by, sx: sc, sy: sc, k: 0,
      hlx: cx0 - 6 - 9 * sc, hly: by - 4 - 13 * sc, hrx: cx0 + 6 + 9 * sc, hry: by - 4 - 13 * sc, up: true,
      flx: cx0 - 2 - 4 * sc, fly: FLOOR - 1, frx: cx0 + 2 + 4 * sc, fry: FLOOR - 1 };
    P = blend(P, O, w);
  }
  out.pose = P;
  return out;
}

/** The big note's x during the 'note' gag: out of the horn, off the left edge, back in from the right. */
export function noteX(t) {
  if (t < 1.8) return 74 - (t / 1.8) * 96;
  return 182 - ((t - 1.8) / 1.8) * 100;
}
