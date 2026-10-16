// fighter: the skeleton, the pose library and the drawing of one fighter.
//
// A fighter is a 2D side-view rig: hip, torso, head, two arms of two bones,
// two legs of two bones. A pose is a set of absolute bone angles in degrees
// (0 = pointing straight down, 90 = pointing forward, at the opponent;
// the torso's `lean` is from straight up, forward positive), a height above
// the floor `h`, a forward hip shift `dx` and a whole-body rotation `rot`.
// Poses blend angle by angle, so every move is a smooth tween between a few
// key poses, like hand-keyed animation, but at 60 fps.
//
// The body is planted automatically: whatever joint is lowest touches the
// floor, plus `h`. So crouches crouch, lying down lies down, and jumps are a
// height curve on top.
//
// Drawn in hard pixels, in three groups each keylined before it is filled
// (far arm, far leg, body + near leg + head, near arm), which gives the
// inner keylines a 16-bit sprite has where a near limb crosses the body.
import { sin, cos } from '../js/kit.js';

const D2R = Math.PI / 180;
const dsin = (a) => sin(a * D2R), dcos = (a) => cos(a * D2R);

export const KEYS = ['lean', 'head', 'fu', 'ff', 'bu', 'bf', 'ft', 'fs', 'bt', 'bs', 'h', 'dx', 'rot'];

/** Build a pose from a partial object over the stance defaults. */
const P = (o) => ({ lean: 8, head: 0, fu: 55, ff: 150, bu: 25, bf: 130, ft: 26, fs: -6, bt: -26, bs: -14, h: 0, dx: 0, rot: 0, ...o });

export const POSE = {
  stance: P({}),
  stanceLow: P({ ft: 32, fs: -14, bt: -32, bs: -22, lean: 12 }),
  walkA: P({ ft: 34, fs: 6, bt: -6, bs: -30, lean: 10 }),
  walkB: P({ ft: 2, fs: -20, bt: -30, bs: -6, lean: 10 }),
  jabOut: P({ fu: 90, ff: 90, bu: 20, bf: 140, lean: 14, dx: 1 }),
  strongWind: P({ fu: 70, ff: 160, bu: -30, bf: 70, lean: 2, dx: -1 }),
  strongOut: P({ fu: 30, ff: 120, bu: 88, bf: 90, lean: 22, dx: 4, ft: 34, bt: -36, bs: -24 }),
  kickChamber: P({ ft: 95, fs: -10, bt: -6, bs: -6, lean: -8, fu: 40, ff: 140 }),
  kickOut: P({ ft: 100, fs: 96, bt: -8, bs: -8, lean: -26, fu: 20, ff: 120, bu: -20, bf: 40 }),
  crouch: P({ ft: 82, fs: -4, bt: 8, bs: -92, lean: 22, fu: 60, ff: 150, bu: 30, bf: 140 }),
  crouchBlock: P({ ft: 82, fs: -4, bt: 8, bs: -92, lean: 10, fu: 40, ff: 172, bu: 30, bf: 165, head: -8 }),
  sweepOut: P({ ft: 78, fs: -6, bt: 84, bs: 90, lean: 34, fu: 100, ff: 60, bu: -30, bf: -10, dx: 2 }),
  block: P({ fu: 40, ff: 172, bu: 30, bf: 165, lean: -6, head: -6, ft: 28, fs: -10, bt: -30, bs: -18 }),
  hurt: P({ lean: -26, head: -24, fu: -20, ff: 30, bu: -50, bf: -10, ft: 30, fs: 6, bt: -20, bs: -20, dx: -2 }),
  hurtLow: P({ lean: 34, head: 20, fu: 10, ff: 40, bu: -10, bf: 20, ft: 30, fs: -20, bt: -34, bs: -30 }),
  flyBack: P({ lean: -64, head: -30, fu: -110, ff: -150, bu: -130, bf: -170, ft: 70, fs: 40, bt: 50, bs: 20, rot: 0 }),
  lying: P({ lean: -90, head: -10, fu: -100, ff: -130, bu: 60, bf: 80, ft: 92, fs: 88, bt: 86, bs: 96 }),
  sitUp: P({ lean: -20, head: 0, fu: -40, ff: 0, bu: -50, bf: -10, ft: 86, fs: 90, bt: 70, bs: 70 }),
  kneel: P({ ft: 82, fs: -4, bt: 8, bs: -92, lean: 30, fu: 70, ff: 120, bu: 10, bf: 60 }),
  jumpTuck: P({ ft: 110, fs: -10, bt: 70, bs: -40, lean: 6, fu: 60, ff: 160, bu: 30, bf: 150 }),
  jumpKick: P({ ft: 58, fs: 62, bt: 40, bs: -70, lean: -12, fu: 70, ff: 160, bu: -30, bf: 30 }),
  fbWind: P({ fu: -50, ff: 40, bu: -60, bf: 30, lean: -4, ft: 36, fs: -8, bt: -40, bs: -20, dx: -1 }),
  fbOut: P({ fu: 86, ff: 90, bu: 82, bf: 86, lean: 18, ft: 44, fs: 0, bt: -42, bs: -22, dx: 3 }),
  upWind: P({ ft: 70, fs: -10, bt: -10, bs: -60, lean: 20, fu: 80, ff: 40, bu: 20, bf: 100 }),
  upRise: P({ fu: 172, ff: 176, bu: -20, bf: 40, lean: 2, ft: 100, fs: 10, bt: -6, bs: -8, head: 8 }),
  spinA: P({ ft: 92, fs: 90, bt: -40, bs: -60, lean: 0, fu: 30, ff: 140, bu: 30, bf: 140 }),
  dash: P({ lean: 30, ft: 60, fs: 0, bt: -50, bs: -40, fu: 60, ff: 150, bu: -10, bf: 100, dx: 2 }),
  charge: P({ lean: -4, head: -10, fu: -40, ff: 30, bu: -50, bf: 20, ft: 40, fs: -10, bt: -40, bs: -20 }),
  victory: P({ lean: 0, head: -8, fu: 176, ff: 178, bu: 30, bf: 140, ft: 12, fs: -2, bt: -14, bs: -4 }),
  bow: P({ lean: 34, head: 10, fu: 10, ff: 30, bu: 0, bf: 20, ft: 6, fs: 0, bt: -6, bs: 0 }),
  taunt: P({ lean: -4, head: -10, fu: 120, ff: 60, bu: 20, bf: 130, ft: 14, fs: -4, bt: -16, bs: -6 }),
  turn: P({ lean: 0, fu: 30, ff: 120, bu: 20, bf: 120, ft: 10, fs: -2, bt: -10, bs: -4 }),
};

/** Linear blend of two poses. */
export function blend(a, b, u) {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const o = {};
  for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * u;
  return o;
}

/** Bone lengths at scale 1: a ~44 px fighter. */
const BONE = { shin: 10, thigh: 9.2, torso: 14, neck: 1.6, head: 3.9, upper: 7.6, fore: 7.4 };

/**
 * Joints of a pose, relative to the hip, x forward (+ towards the opponent), y down.
 */
function joints(p, s) {
  const r = p.rot;
  const dir = (a, len) => [dsin(a + r) * len * s, dcos(a + r) * len * s];
  const add = (o, d) => [o[0] + d[0], o[1] + d[1]];
  const hip = [p.dx * s, 0];
  const up = (a, len) => [dsin(a + r) * len * s, -dcos(a + r) * len * s];
  const neck = add(hip, up(p.lean, BONE.torso));
  const sh = add(hip, up(p.lean, BONE.torso - 1.5));
  const head = add(neck, up(p.lean + p.head, BONE.neck + BONE.head));
  const fk = add(hip, dir(p.ft, BONE.thigh)), fa = add(fk, dir(p.fs, BONE.shin));
  const bk = add(hip, dir(p.bt, BONE.thigh)), ba = add(bk, dir(p.bs, BONE.shin));
  const fe = add(sh, dir(p.fu, BONE.upper)), fh = add(fe, dir(p.ff, BONE.fore));
  const be = add(sh, dir(p.bu, BONE.upper)), bh = add(be, dir(p.bf, BONE.fore));
  // feet: flat on the floor while the shin is near vertical, along the kick otherwise
  const footA = (shin) => 90 + (Math.abs(shin) > 45 ? shin * 0.7 : 0);
  const ft = add(fa, dir(footA(p.fs), 3.6)), bt = add(ba, dir(footA(p.bs), 3.6));
  return { hip, neck, sh, head, fk, fa, bk, ba, fe, fh, be, bh, ft, bt, lean: p.lean + r, headA: p.lean + p.head + r };
}

/** How far below the hip the body reaches (to plant it on the floor). */
function lowest(j, s) {
  let m = -1e9;
  const pts = [[j.fa, 1.6], [j.ba, 1.6], [j.ft, 1.2], [j.bt, 1.2], [j.fk, 2.6], [j.bk, 2.6], [j.fh, 2], [j.bh, 2],
    [j.head, BONE.head], [j.hip, 3.5], [j.neck, 3.5], [j.fe, 2], [j.be, 2]];
  for (const [p, r] of pts) m = Math.max(m, p[1] + r * s);
  return m;
}

/**
 * Where a posed fighter is: screen positions of the joints, given the
 * fighter's ground x (screen), facing (+1 right, -1 left) and the floor y.
 */
export function place(p, X, face, floorY, s = 1) {
  const j = joints(p, s);
  const hipY = floorY - lowest(j, s) - p.h * s;
  const out = {};
  for (const k of Object.keys(j)) {
    const v = j[k];
    out[k] = Array.isArray(v) ? [X + face * v[0], hipY + v[1]] : v;
  }
  out.face = face;
  out.s = s;
  return out;
}

const OL = 0x140a12;

/**
 * Draw a placed fighter. `look` holds colours and build; `t` drives the
 * headband tails and hair; `flash` (0..1) whitens it (a hit flash).
 */
export function drawFighter(g, J, look, t, { flash = 0, a = 1 } = {}) {
  const s = J.s, face = J.face;
  const mixc = (c) => (flash > 0 ? lerpC(c, 0xffffff, flash) : c);
  const W = look.build;
  const seg = (p0, p1, w, c) => ({ k: 's', p0, p1, w: w * s, c: mixc(c) });
  const circ = (p, r, c) => ({ k: 'c', p, r: r * s, c: mixc(c) });
  const poly = (pts, c) => ({ k: 'p', pts, c: mixc(c) });

  const torsoPoly = () => {
    const ux = J.neck[0] - J.hip[0], uy = J.neck[1] - J.hip[1];
    const L = Math.hypot(ux, uy) || 1, nx = -uy / L, ny = ux / L;
    const hw = 3.0 * W * s, sw = 4.4 * W * s * look.chest;
    const top = [J.neck[0] + ux / L * 0.5, J.neck[1] + uy / L * 0.5];
    return [[J.hip[0] + nx * hw, J.hip[1] + ny * hw], [top[0] + nx * sw, top[1] + ny * sw],
      [top[0] - nx * sw, top[1] - ny * sw], [J.hip[0] - nx * hw, J.hip[1] - ny * hw]];
  };

  const legW = look.legW * W, armW = look.armW * W;
  const leg = (k, a2, f, shade) => {
    const pc = shade ? look.pantsD : look.pants;
    const out = [seg(J.hip, k, legW + 0.6, pc), seg(k, a2, legW, pc)];
    out.push(seg(a2, f, 2.6, shade ? look.feetD : look.feet));
    if (look.boots) out.push(seg([lerp(k[0], a2[0], 0.55), lerp(k[1], a2[1], 0.55)], a2, legW + 0.4, shade ? look.feetD : look.feet));
    return out;
  };
  const arm = (sh, e, h, shade) => {
    const sl = shade ? look.sleeveD : look.sleeve, sk = shade ? look.skinD : look.skin;
    return [seg(sh, e, armW + 0.4, sl), seg(e, h, armW, sk), circ(h, look.fist, shade ? look.gloveD : look.glove)];
  };

  const headParts = () => {
    const hc = J.head, r = 3.9;
    const hA = J.headA;
    const uX = face * dsin(hA), uY = -dcos(hA); // head's up
    const fX = face * dcos(hA), fY = dsin(hA);  // head's forward
    const out = [];
    const hair = look.hair;
    // hair mass behind and above
    if (hair !== null) out.push(circ([hc[0] - fX * 1.2 * s + uX * 0.8 * s, hc[1] - fY * 1.2 * s + uY * 0.8 * s], r * 0.98, hair));
    out.push(circ([hc[0] + fX * 0.7 * s - uX * 0.3 * s, hc[1] + fY * 0.7 * s - uY * 0.3 * s], r * 0.86, look.skin));
    if (look.hairStyle === 'spike' && hair !== null) {
      for (let i = -1; i <= 1; i++) {
        const bx = hc[0] + uX * 3.2 * s - fX * (1 + i * 1.6) * s, by = hc[1] + uY * 3.2 * s - fY * (1 + i * 1.6) * s;
        const tx = bx + (uX * 2 - fX * 1.6) * s, ty = by + (uY * 2 - fY * 1.6) * s;
        out.push(seg([bx, by], [tx, ty], 2.2, hair));
      }
    } else if (look.hairStyle === 'mohawk' && hair !== null) {
      out.push(seg([hc[0] + uX * 3.6 * s + fX * 1.5 * s, hc[1] + uY * 3.6 * s + fY * 1.5 * s],
        [hc[0] + uX * 2.6 * s - fX * 4.2 * s, hc[1] + uY * 2.6 * s - fY * 4.2 * s], 2.6, hair));
    } else if (look.hairStyle === 'tail' && hair !== null) {
      const sw = sin(t * 9) * 1.2;
      out.push(seg([hc[0] - fX * 3.5 * s, hc[1] - fY * 3.5 * s],
        [hc[0] - fX * 8 * s + uX * sw * s, hc[1] - fY * 8 * s + (uY * sw + 3) * s], 2.2, hair));
    }
    if (look.mask) out.push(seg([hc[0] - fX * 3 * s - uX * 1.3 * s, hc[1] - fY * 3 * s - uY * 1.3 * s],
      [hc[0] + fX * 3.6 * s - uX * 1.3 * s, hc[1] + fY * 3.6 * s - uY * 1.3 * s], 3, look.mask));
    if (look.band) {
      const b0 = [hc[0] - fX * 3.4 * s + uX * 1.6 * s, hc[1] - fY * 3.4 * s + uY * 1.6 * s];
      const b1 = [hc[0] + fX * 3.4 * s + uX * 1.6 * s, hc[1] + fY * 3.4 * s + uY * 1.6 * s];
      out.push(seg(b0, b1, 1.6, look.band));
      // tails flutter behind
      const w1 = sin(t * 11 + look.seed) * 1.2, w2 = sin(t * 11 + 1.7 + look.seed) * 1.4;
      const k1 = [b0[0] - face * 3.2 * s, b0[1] + (1.2 + w1) * s];
      const k2 = [k1[0] - face * 2.8 * s, k1[1] + (1 + w2) * s];
      out.push(seg(b0, k1, 1.4, look.band), seg(k1, k2, 1.2, look.band));
    }
    return out;
  };

  const torso = [poly(torsoPoly(), look.top)];
  if (look.belt) {
    const bx = lerp(J.hip[0], J.neck[0], 0.12), by = lerp(J.hip[1], J.neck[1], 0.12);
    const ux = J.neck[0] - J.hip[0], uy = J.neck[1] - J.hip[1], L = Math.hypot(ux, uy) || 1;
    const nx = -uy / L * 4 * W * s, ny = ux / L * 4 * W * s;
    torso.push(seg([bx + nx, by + ny], [bx - nx, by - ny], 1.8, look.belt));
  }
  if (look.vee) {
    // the open gi: a skin vee at the chest
    const ux = J.neck[0] - J.hip[0], uy = J.neck[1] - J.hip[1], L = Math.hypot(ux, uy) || 1;
    const nx = -uy / L, ny = ux / L, w = 2.6 * s;
    const top = [J.neck[0] + ux / L * 0.4, J.neck[1] + uy / L * 0.4];
    const tip = [lerp(J.hip[0], J.neck[0], 0.45), lerp(J.hip[1], J.neck[1], 0.45)];
    torso.push(poly([[top[0] + nx * w, top[1] + ny * w], [top[0] - nx * w, top[1] - ny * w], tip], look.skin));
  }

  const groups = [
    arm(J.sh, J.be, J.bh, true),
    leg(J.bk, J.ba, J.bt, true),
    [...torso, ...leg(J.fk, J.fa, J.ft, false), ...headParts()],
    arm(J.sh, J.fe, J.fh, false),
  ];
  const o = { a };
  for (const grp of groups) {
    for (const p of grp) {
      if (p.k === 's') g.thickLine(p.p0[0], p.p0[1], p.p1[0], p.p1[1], p.w + 2, OL, o);
      else if (p.k === 'c') g.fillCircle(p.p[0], p.p[1], p.r + 1, OL, o);
      else g.fillPolygon(grow(p.pts, 1), OL, o);
    }
    for (const p of grp) {
      if (p.k === 's') g.thickLine(p.p0[0], p.p0[1], p.p1[0], p.p1[1], p.w, p.c, o);
      else if (p.k === 'c') g.fillCircle(p.p[0], p.p[1], p.r, p.c, o);
      else g.fillPolygon(p.pts, p.c, o);
    }
  }
  // the eye: one dark pixel on the face, a white one when the face is big enough
  {
    const hA = J.headA, fX = face * dcos(hA), fY = dsin(hA), uX = face * dsin(hA), uY = -dcos(hA);
    const ex = J.head[0] + fX * 2.6 * s + uX * 0.6 * s, ey = J.head[1] + fY * 2.6 * s + uY * 0.6 * s;
    g.pixel(ex, ey, mixc(look.eye ?? OL), o);
  }
}

/** Grow a convex quad/triangle outward by d pixels (for its keyline). */
function grow(pts, d) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= pts.length; cy /= pts.length;
  return pts.map(([x, y]) => {
    const dx = x - cx, dy = y - cy, L = Math.hypot(dx, dy) || 1;
    return [x + dx / L * d * 1.3, y + dy / L * d * 1.3];
  });
}

export const lerp = (a, b, u) => a + (b - a) * u;
export function lerpC(a, b, u) {
  const r = (a >> 16) & 255, g = (a >> 8) & 255, bl = a & 255;
  const r2 = (b >> 16) & 255, g2 = (b >> 8) & 255, b2 = b & 255;
  return (Math.round(r + (r2 - r) * u) << 16) | (Math.round(g + (g2 - g) * u) << 8) | Math.round(bl + (b2 - bl) * u);
}
