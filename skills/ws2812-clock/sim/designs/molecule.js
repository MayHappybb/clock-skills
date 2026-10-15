// Molecule: the time written as skeletal formulas, the chemist's own
// shorthand, on the chemist's own lattice. Every digit is a small molecule:
// carbon atoms at the corners of a zigzag on the triangular LED lattice,
// single and double bonds, the odd oxygen (red) or nitrogen (blue), and
// benzene rings whose pi electrons circle inside them.
//
// The assembly itself is a molecule too: three fused hexagons are
// phenalene, C13. Its 12 rim carbons sit on the board corners, which are
// exactly the 12 marks of a dial round the triple point, 43 mm apart, so a
// lone electron runs the rim once a minute: the ring current is the
// second hand.
//
// At rest the molecules are alive: atoms jiggle, each puckered molecule
// rocks slowly on its axis, pi electrons circle inside the benzene rings,
// the double bonds of cyclooctatetraene (the 0) walk round its ring, water
// molecules drift in the empty lobes reaching for O and N with dotted
// hydrogen bonds, and now and then a photon wriggles in and a bond rings.
//
// Minute turn: a reaction. The bonds about to break heat up amber and
// crackle, the places where atoms will land glow; at the turn the old bonds
// split from the middle and snap, atoms fly on curved paths trailing light,
// and the new bonds grow out of both atoms and zip shut. Once the old bonds
// are gone the new skeleton glows faintly, so a half-made molecule always
// reads as the new digit.
// Hour: combustion. A Bunsen flame lights at the central carbon (the triple
// point) and licks up round the hour molecules; they burn white-hot through
// their reaction, give off CO2, and the new hour condenses out of the fire.
// The minutes stay readable throughout.
//
// Stateless: everything is a function of the wall clock.
import * as kit from '../js/kit.js';

const DX = 2 * Math.sqrt(3);            // column step (mm)
const NB = 3;                           // LED steps per bond: bonds are 12 mm

// ------------------------------------------------------------------ glyphs
// Vertex grid of a digit, in bond units: a across (-1..1), b down (0..6),
// a + b even. Diagonal bonds go (+-1, +-1), vertical ones (0, +-2).
//
//         T                      b=0
//    UL       UR                 b=1
//         C2                     b=2
//    ML       MR                 b=3
//         C4                     b=4
//    BL       BR                 b=5
//         B                      b=6
const V = { T: [0, 0], UL: [-1, 1], UR: [1, 1], C2: [0, 2], ML: [-1, 3], MR: [1, 3], C4: [0, 4], BL: [-1, 5], BR: [1, 5], B: [0, 6] };

// "A-B" single bond, "A=B" double. el: heteroatoms. ring: benzene centre.
const GLYPHS = {
  0: { bonds: 'T=UR UR-MR MR=BR BR-B B=BL BL-ML ML=UL UL-T', shift: 'UR-MR BR-B BL-ML UL-T' },
  1: { bonds: 'UL-T T-C2 C2-C4 C4-B', el: { B: 'O' } },
  2: { bonds: 'UL-T T=UR UR-MR MR-C4 C4-BL BL-B B-BR', el: { BR: 'O' } },
  3: { bonds: 'UL-T T-UR UR-MR MR-BR BR-B B-BL MR=C2', el: { C2: 'O' } },
  4: { bonds: 'UL-ML ML-C4 C4-MR UR-MR MR-BR', el: { BR: 'N' } },
  5: { bonds: 'UR-T T-UL UL-ML ML-C2 C2-MR MR=BR BR-B B-BL', el: { UR: 'O' } },
  6: { bonds: 'T=UL UL-ML ML-C2 C2-MR MR-BR BR-B B-BL BL-ML', el: { T: 'O' }, ring: [0, 4] },
  7: { bonds: 'UL-T T=UR UR-MR MR-C4 C4-BL', el: { BL: 'N' } },
  8: { bonds: 'T-UR UR-MR MR-C4 C4-ML ML-UL UL-T ML-BL BL-B B=BR BR-MR', ring: [0, 2] },
  9: { bonds: 'T-UR UR-MR MR-C4 C4-ML ML-UL UL-T MR-BR BR-B B=BL', el: { BL: 'O' }, ring: [0, 2] },
};

/** Parsed glyph: bonds Map("A|B" -> order), atoms Map(name -> element). */
function parse(g) {
  const bonds = new Map(), atoms = new Map();
  for (const tok of g.bonds.split(/\s+/)) {
    const dbl = tok.includes('=');
    const [a, b] = tok.split(/[-=]/);
    bonds.set(a < b ? `${a}|${b}` : `${b}|${a}`, dbl ? 2 : 1);
    atoms.set(a, 'C'); atoms.set(b, 'C');
  }
  for (const [k, e] of Object.entries(g.el ?? {})) atoms.set(k, e);
  const vs = [...atoms.keys()].map((k) => V[k]);
  const cen = [vs.reduce((s, v) => s + v[0], 0) / vs.length, vs.reduce((s, v) => s + v[1], 0) / vs.length];
  const shift = g.shift ? new Set(g.shift.split(' ').map((tok) => { const [a, b] = tok.split('-'); return a < b ? `${a}|${b}` : `${b}|${a}`; })) : null;
  return { bonds, atoms, ring: g.ring ?? null, cen, shift };
}
const G = Object.fromEntries(Object.entries(GLYPHS).map(([d, g]) => [d, parse(g)]));

// ------------------------------------------------------------------ palette
const C_ATOM = kit.hex('#fff0d8');
const C_BOND = kit.hex('#a9c4e8');
// one or two clean channels each: tiny side channels only add dim-end noise
const EL = { C: C_ATOM, O: [1, 0, 0], N: [0, 0.2, 1] };
const EL_BOND = { C: C_BOND, O: [0.85, 0.04, 0], N: [0.02, 0.26, 0.9] };
const PI = kit.hex('#9a7bff');          // pi electrons, ring currents
const ARROW = [1, 0.42, 0];             // reaction: hot bonds, landing sites, trails
const ELECTRON = kit.hex('#7fd4ff');    // the rim electron

// --------------------------------------------------------------- placement
// Hours sit in the two upper hexagons, close to their shared seam; minutes
// side by side in the lower one. c0: column of the digit's axis on its
// board; kc: half-row of its middle (c0 + kc odd, so vertices land on LEDs).
const SLOTS = [
  { board: 0, c0: 6, kc: -1 },
  { board: 1, c0: -6, kc: -1 },
  { board: 2, c0: -5, kc: 0 },
  { board: 2, c0: 5, kc: 0 },
];

const geoms = new Map();
function geometry(L) {
  if (geoms.has(L.key)) return geoms.get(L.key);
  const slots = SLOTS.map((s) => {
    const p = L.panels[s.board];
    const at = (a, b) => [p.x + (s.c0 + NB * a) * DX, p.y + (s.kc + NB * (b - 3)) * 2];
    const [cx, cy] = at(0, 3);
    const leds = L.index.near(cx, cy, 34);
    return { at, cx, cy, leds };
  });
  // the board molecule: corners grouped by position; 1 board = rim, 2 = notch, 3 = centre
  const groups = [];
  for (const p of L.panels) {
    for (let k = 0; k < 6; k++) {
      const a = (-90 + 60 * k) * Math.PI / 180;
      const nom = [p.x + 43 * Math.cos(a), p.y + 43 * Math.sin(a)];
      const led = [p.x + 40 * Math.cos(a), p.y + 40 * Math.sin(a)];
      let g = groups.find((q) => Math.hypot(q.nom[0] - nom[0], q.nom[1] - nom[1]) < 2);
      if (!g) groups.push(g = { nom, leds: [] });
      g.leds.push(led);
    }
  }
  for (const g of groups) g.pos = [g.leds.reduce((s, v) => s + v[0], 0) / g.leds.length, g.leds.reduce((s, v) => s + v[1], 0) / g.leds.length];
  const centre = groups.find((g) => g.leds.length === 3);
  const [ox, oy] = centre.nom;
  const ang = (g) => (Math.atan2(g.nom[0] - ox, -(g.nom[1] - oy)) + 2 * Math.PI + 1e-6) % (2 * Math.PI);
  const rim = groups.filter((g) => g !== centre).sort((a, b) => ang(a) - ang(b));
  const seams = rim.filter((g) => g.leds.length === 2);
  const G0 = { slots, rim, centre, seams };
  geoms.set(L.key, G0);
  return G0;
}

// ------------------------------------------------------------------ timing
// Seconds relative to the minute turn.
const BREAK_T = [0, 0.3], MOVE_T = [0.2, 1.0], FORM_T = [0.6, 1.4];
const span = (u, [a, b]) => kit.clamp((u - a) / (b - a));
const sm = (u, ab) => { const x = span(u, ab); return x * x * (3 - 2 * x); };

// ---------------------------------------------------------------- reaction
const plans = new Map();
/** How digit d0 becomes d1: which atoms stay, move, leave or arrive; which bonds change. */
function plan(d0, d1) {
  const key = `${d0}${d1}`;
  if (plans.has(key)) return plans.get(key);
  const A = G[d0], B = G[d1];
  const atoms = [];
  const oldOnly = [...A.atoms.keys()].filter((k) => !B.atoms.has(k));
  const newOnly = [...B.atoms.keys()].filter((k) => !A.atoms.has(k));
  for (const k of A.atoms.keys()) if (B.atoms.has(k)) atoms.push({ from: k, to: k, e0: A.atoms.get(k), e1: B.atoms.get(k) });
  // movers: greedy nearest pairs, preferring the same element
  const pairs = [];
  for (const a of oldOnly) for (const b of newOnly) {
    const d = Math.hypot(V[a][0] - V[b][0], V[a][1] - V[b][1]) + (A.atoms.get(a) === B.atoms.get(b) ? 0 : 1.5);
    pairs.push([d, a, b]);
  }
  pairs.sort((p, q) => p[0] - q[0]);
  const usedA = new Set(), usedB = new Set();
  for (const [, a, b] of pairs) {
    if (usedA.has(a) || usedB.has(b)) continue;
    usedA.add(a); usedB.add(b);
    atoms.push({ from: a, to: b, e0: A.atoms.get(a), e1: B.atoms.get(b) });
  }
  const away = (k, c) => {
    const dx = V[k][0] - c[0], dy = V[k][1] - c[1], n = Math.hypot(dx, dy);
    return n < 0.3 ? [0, -1] : [dx / n, dy / n];
  };
  for (const a of oldOnly) if (!usedA.has(a)) atoms.push({ from: a, to: null, e0: A.atoms.get(a), dir: away(a, A.cen) });
  for (const b of newOnly) if (!usedB.has(b)) atoms.push({ from: null, to: b, e1: B.atoms.get(b), dir: away(b, B.cen) });
  const bonds = [];
  for (const k of new Set([...A.bonds.keys(), ...B.bonds.keys()])) {
    const [a, b] = k.split('|');
    bonds.push({ a, b, o0: A.bonds.get(k) ?? 0, o1: B.bonds.get(k) ?? 0 });
  }
  // every atom that travels gets a path, a quadratic curve that bows away
  // from the molecule: the curly arrow is drawn along it before it flies
  const cx = (A.cen[0] + B.cen[0]) / 2, cy = (A.cen[1] + B.cen[1]) / 2;
  for (const [j, at] of atoms.entries()) {
    if (at.from === at.to) continue;
    const p0 = at.from ? V[at.from] : [V[at.to][0] - at.dir[0] * 1.1, V[at.to][1] - at.dir[1] * 1.1];
    const p1 = at.to ? V[at.to] : [V[at.from][0] + at.dir[0] * 1.2, V[at.from][1] + at.dir[1] * 1.2];
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    let nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0];
    const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; }
    const bow = at.from && at.to ? 0.45 * len + 0.25 : 0.3;
    at.path = [p0, [mx + nx * bow, my + ny * bow], p1];
    at.arrow = !!at.from;
  }
  const p = { atoms, bonds, shift: d0 === d1 ? A.shift : null, ring0: A.ring, ring1: B.ring, cen0: A.cen, cen1: B.cen, same: d0 === d1 };
  plans.set(key, p);
  return p;
}

// ---------------------------------------------------------------- drawing
/** kit.splat without the faint skirt: light below ~4/255 only adds dim-end noise. */
function blob(ctx, x, y, r, c, a = 1) {
  const m = Math.max(c[0], c[1], c[2]) * a;
  if (m < 0.008) return;
  for (const i of ctx.layout.index.near(x, y, r)) {
    const l = ctx.leds[i], d = Math.hypot(l.x - x, l.y - y) / r, f = (1 - d * d) ** 2;
    if (f * m > 0.012) kit.add(ctx, i, c, a * f);
  }
}
const bez = ([p0, c, p1], w) => [(1 - w) ** 2 * p0[0] + 2 * (1 - w) * w * c[0] + w * w * p1[0], (1 - w) ** 2 * p0[1] + 2 * (1 - w) * w * c[1] + w * w * p1[1]];
// The molecules are puckered, as real ones are: the spine stands out of the
// board, the flanks sit back, and each one rocks slowly on its axis.
const zOf = (k) => (V[k][0] === 0 ? 4 : -3);
const ROCK = 0.32;
function setRock(S, t, sid) {
  const th = ROCK * Math.sin(t * 2 * Math.PI / 11 + sid * 1.9), c = Math.cos(th), sn = Math.sin(th);
  S.rock = (x, z) => [S.cx + (x - S.cx) * c + z * sn, 1 + 0.15 * (z * c - (x - S.cx) * sn) / 4];
}
const R_BOND = 3.3;                       // bond line half-width (mm): one LED wide on the lattice
const prof = (d) => (d >= R_BOND ? 0 : (1 - (d / R_BOND) ** 2) ** 2);

/** Where every atom of slot S is at reaction time u: maps by old and new vertex. */
function atomStates(S, P, u, t, sid, heat, exc) {
  const byOld = new Map(), byNew = new Map(), all = [];
  const amp = 0.5 + 1.3 * heat;
  for (const [j, A] of P.atoms.entries()) {
    const ph = sid * 7.13 + j * 2.71;
    const vib = [amp * Math.sin(t * (6.3 + (j % 3)) + ph), amp * Math.cos(t * (5.1 + (j % 4) * 0.7) + ph * 1.3)];
    // a bond that has just swallowed a photon stretches hard
    if (exc && A.from === A.to && (A.from === exc.a || A.from === exc.b)) {
      const p = V[exc.a], q = V[exc.b], sgn = A.from === exc.a ? 1 : -1;
      const ax = (p[0] - q[0]) * DX * NB, ay = (p[1] - q[1]) * 2 * NB, n = Math.hypot(ax, ay);
      const k = sgn * 1.8 * exc.e * Math.sin(exc.osc);
      vib[0] += ax / n * k; vib[1] += ay / n * k;
    }
    let x, y, a = 1, e0 = A.e0 ?? A.e1, e1 = A.e1 ?? A.e0, moving = 0;
    if (A.from && A.to) {
      const p0 = S.at(...V[A.from]), p1 = S.at(...V[A.to]);
      if (A.from === A.to) [x, y] = p0;
      else {
        const m = kit.ease.inOut(span(u, MOVE_T));
        [x, y] = S.at(...bez(A.path, m));
        moving = Math.sin(Math.PI * m);
      }
    } else if (A.from) {
      const m = kit.ease.inOut(span(u, [0.1, 1.0]));
      [x, y] = S.at(...bez(A.path, m));
      y -= heat * m * 14;
      a = 1 - sm(u, [0.3, 1.1]); moving = a;
    } else {
      const m = kit.ease.out(span(u, [0.25, 1.1]));
      [x, y] = S.at(...bez(A.path, m));
      a = sm(u, [0.25, 1.0]); moving = 1 - m;
    }
    const zf = A.from ? zOf(A.from) : zOf(A.to), zt = A.to ? zOf(A.to) : zf;
    const z = kit.lerp(zf, zt, sm(u, MOVE_T));
    const [rx, depth] = S.rock(x, z);
    x = rx;
    const k = sm(u, MOVE_T);
    const st = {
      x: x + vib[0], y: y + vib[1], a: a * depth, moving, depth,
      col: kit.mix(EL[e0], EL[e1], k), bc: kit.mix(EL_BOND[e0], EL_BOND[e1], k),
      hetero: kit.lerp(e0 === 'C' ? 0 : 1, e1 === 'C' ? 0 : 1, k),
    };
    all.push(st);
    if (A.from) byOld.set(A.from, st);
    if (A.to) byNew.set(A.to, st);
  }
  return { byOld, byNew, all };
}

/** One digit-molecule, mid-reaction at u (u < 0: the old one, u > 1.5: the new one). */
function drawDigit(ctx, S, P, u, t, sid, heat, dim, exc) {
  setRock(S, t, sid);
  const { byOld, byNew, all } = atomStates(S, P, u, t, sid, heat, exc);
  const segs = [];
  const toMM = (p) => { const [x, y] = S.at(p[0], p[1]); return [S.rock(x, 0)[0], y]; };
  const sparks = [];
  for (const b of P.bonds) {
    let sa, sb, piA, hot = 0;
    // sigma bond: breaking ones split from the middle and snap back into
    // their atoms; forming ones grow out of both atoms and zip shut
    const pieces = [];
    if (b.o0 && b.o1) { sa = byOld.get(b.a); sb = byOld.get(b.b); pieces.push([0, 1]); }
    else if (b.o0) {
      sa = byOld.get(b.a); sb = byOld.get(b.b);
      hot = sm(u, [-0.9, -0.1]);
      const g = 0.5 * kit.ease.in(span(u, BREAK_T));
      if (g < 0.5) pieces.push([0, 0.5 - g], [0.5 + g, 1]);
      const k = span(u, BREAK_T);
      if (k > 0 && k < 1) sparks.push([(sa.x + sb.x) / 2, (sa.y + sb.y) / 2, Math.sin(Math.PI * k) * 0.8]);
    } else {
      sa = byNew.get(b.a); sb = byNew.get(b.b);
      const k = span(u, FORM_T), g = 0.5 * kit.ease.inOut(k);
      if (g > 0) pieces.push([0, g], [1 - g, 1]);
      // the new bond's place glows faintly from the turn on, so the half-made
      // molecule already reads as the new digit, never as a third one
      const ghost = sm(u, [0.22, 0.5]) * (1 - sm(u, [1.2, 1.5]));
      const ga = toMM(V[b.a]), gb = toMM(V[b.b]);
      if (ghost > 0.002) segs.push({ ax: ga[0], ay: ga[1], bx: gb[0], by: gb[1], a: ghost * 0.38, ca: ARROW, cb: ARROW, s0: 0, s1: 1, hot: 0 });
      if (k > 0 && k < 1) {
        const x0 = kit.lerp(sa.x, sb.x, g), y0 = kit.lerp(sa.y, sb.y, g), x1 = kit.lerp(sa.x, sb.x, 1 - g), y1 = kit.lerp(sa.y, sb.y, 1 - g);
        const v = 0.7 * Math.min(sa.a, sb.a) * (k > 0.85 ? 1 + 2 * (k - 0.85) / 0.15 : 1);
        sparks.push([x0, y0, v * 0.6], [x1, y1, v * 0.6]);
      }
    }
    const alpha = Math.min(sa.a, sb.a);
    if (exc && b.o0 && b.o1 && ((b.a === exc.a && b.b === exc.b) || (b.a === exc.b && b.b === exc.a))) hot = 0.8 * exc.e;
    for (const [s0, s1] of pieces) if (alpha > 0.002 && s1 > s0) segs.push({ ax: sa.x, ay: sa.y, bx: sb.x, by: sb.y, a: alpha, ca: sa.bc, cb: sb.bc, s0, s1, hot });
    // the pi bond: a shorter parallel line on the inside
    piA = b.o0 === 2 && b.o1 === 2 ? 1 : b.o0 === 2 ? 1 - sm(u, BREAK_T) : b.o1 === 2 ? sm(u, [FORM_T[1] - 0.4, FORM_T[1] + 0.2]) : 0;
    // cyclooctatetraene's double bonds walk round the ring (bond shifting)
    if (P.shift) {
      const w = kit.smoothstep(0.35, 0.65, 0.5 + 0.5 * Math.sin(t * 2 * Math.PI / 9 + sid));
      const k = `${b.a < b.b ? b.a : b.b}|${b.a < b.b ? b.b : b.a}`;
      piA = P.shift.has(k) ? w : 1 - w;
    }
    piA *= alpha;
    if (piA > 0.002) {
      const useNew = b.o1 === 2;
      const ring = useNew ? P.ring1 : P.ring0, cen = useNew ? P.cen1 : P.cen0;
      const mg = [(V[b.a][0] + V[b.b][0]) / 2, (V[b.a][1] + V[b.b][1]) / 2];
      const ref = ring && Math.hypot(mg[0] - ring[0], mg[1] - ring[1]) < 1.3 ? ring : cen;
      const R = toMM(ref), mx = (sa.x + sb.x) / 2, my = (sa.y + sb.y) / 2;
      let nx = -(sb.y - sa.y), ny = sb.x - sa.x;
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      if (nx * (R[0] - mx) + ny * (R[1] - my) < 0) { nx = -nx; ny = -ny; }
      const off = 3.46;
      segs.push({ ax: sa.x + nx * off, ay: sa.y + ny * off, bx: sb.x + nx * off, by: sb.y + ny * off, a: piA * 0.8, ca: sa.bc, cb: sb.bc, s0: 0.3, s1: 0.7 });
    }
  }
  // bonds: the brightest segment wins at each LED (no hot joints)
  for (const i of S.leds) {
    const l = ctx.leds[i];
    let best = 0, col = null;
    for (const g of segs) {
      const dx = g.bx - g.ax, dy = g.by - g.ay, L2 = dx * dx + dy * dy;
      let s = L2 ? ((l.x - g.ax) * dx + (l.y - g.ay) * dy) / L2 : 0;
      const sc = kit.clamp(s, g.s0, g.s1);
      const d = Math.hypot(l.x - g.ax - sc * dx, l.y - g.ay - sc * dy);
      if (d >= R_BOND) continue;
      let v = prof(d) * g.a;
      if (g.hot) v *= 1 + g.hot * (0.5 + 0.5 * Math.sin(s * 9 - t * 25));
      if (v > best) { best = v; col = kit.mix(kit.mix(g.ca, g.cb, kit.smoothstep(0.3, 0.7, s)), ARROW, (g.hot || 0) * 0.85); }
    }
    if (best > 0) kit.add(ctx, i, col, best * 0.42 * dim * (1 + 0.5 * heat));
  }
  for (const [x, y, v] of sparks) blob(ctx, x, y, 3.6, ARROW, v * dim);
  // atoms: balls on the joints
  const hot = kit.blackbody(2300);
  for (const st of all) {
    if (st.a <= 0.002) continue;
    const r = 4.3 + 1.0 * st.hetero;
    let c = st.col;
    if (heat > 0) c = kit.mix(c, hot, heat * 0.8);
    blob(ctx, st.x, st.y, r, c, st.a * dim * ((0.62 + 0.3 * st.hetero) + 0.4 * st.moving + 0.5 * heat));
  }
  // aromatic rings: the pi electrons circle inside
  const rings = [];
  if (P.ring0 && P.ring1 && P.ring0[0] === P.ring1[0] && P.ring0[1] === P.ring1[1]) rings.push([P.ring0, 1]);
  else {
    if (P.ring0) rings.push([P.ring0, 1 - sm(u, BREAK_T)]);
    if (P.ring1) rings.push([P.ring1, sm(u, FORM_T)]);
  }
  for (const [rc, a] of rings) {
    if (a <= 0.002) continue;
    const [cx, cy] = toMM(rc);
    for (const i of ctx.layout.index.near(cx, cy, 4.6)) {
      const l = ctx.leds[i];
      if (Math.hypot(l.x - cx, l.y - cy) > 1) kit.add(ctx, i, PI, 0.1 * a * dim);
    }
    for (let e = 0; e < 2; e++) {
      const th = t * 2.6 + sid + e * Math.PI;
      blob(ctx, cx + 4.2 * Math.cos(th), cy + 4.2 * Math.sin(th), 3.6, PI, 0.75 * a * dim);
    }
  }
  // where the atoms will land glows faintly before the turn, and each
  // travelling atom leaves a comet trail along its curved path
  for (const A of P.atoms) {
    if (A.from === A.to) continue;
    if (A.to) {
      const g = sm(u, [-0.9, -0.2]) * (1 - sm(u, [0.6, 1.0]));
      if (g > 0.002) { const q = toMM(V[A.to]); blob(ctx, q[0], q[1], 3.6, ARROW, 0.3 * g * dim * (0.8 + 0.2 * Math.sin(t * 12))); }
    }
    const win = A.to && A.from ? MOVE_T : A.from ? [0.1, 1.0] : [0.25, 1.1];
    const k = (u - win[0]) / (win[1] - win[0]);
    if (k <= 0 || k >= 1.25) continue;
    const ease = A.from && !A.to ? kit.ease.inOut : A.from ? kit.ease.inOut : kit.ease.out;
    for (let j = 1; j <= 8; j++) {
      const kk = k - j * 0.045;
      if (kk <= 0 || kk >= 1) continue;
      const q = toMM(bez(A.path, ease(kk)));
      const tail = (1 - sm(k, [0.8, 1.2])) * (A.to ? 1 : 1 - sm(u, [0.5, 1.2]));
      blob(ctx, q[0], q[1], 3.4, ARROW, 0.45 * (1 - j / 9) * dim * (A.from ? 1 : 0.6) * tail);
    }
  }
  return all;
}

const pad = (n) => String(n).padStart(2, '0');
const digitsOf = (d) => { const s = pad(d.getHours()) + pad(d.getMinutes()); return [...s].map(Number); };

export default {
  name: 'Molecule',
  blurb: 'the time as skeletal formulas; each minute is a reaction, each hour the board molecule catalyses one',
  layouts: ['hex-trio'], look: { look: 'opal', gap: 1.2 }, fps: 60, brightness: 0.55, dither: true,
  frame(ctx) {
    const { t, date } = ctx;
    const GEO = geometry(ctx.layout);
    const dim = 1 - 0.8 * ctx.night;
    const now = date.getTime() / 1000;
    // the nearest minute turn decides which reaction is running
    const M = Math.round(now / 60) * 60, u = now - M;
    const d0 = digitsOf(new Date((M - 60) * 1000)), d1 = digitsOf(new Date(M * 1000));
    const hourTurn = M % 3600 === 0 || new Date(M * 1000).getMinutes() === 0;
    const hu = hourTurn ? u : 99;
    const heatH = hourTurn ? sm(hu, [-2.5, 0.2]) * (1 - sm(hu, [1.3, 2.6])) : 0;

    drawBoardMolecule(ctx, GEO, now, dim);
    if (hu > -3.5 && hu < 4.5) drawFlame(ctx, GEO, now, hu, dim, [[0, d0[0]], [1, d0[1]], [0, d1[0]], [1, d1[1]]]);
    const tt = ((now % 86400) + 86400) % 86400;      // wall-clock seconds drive all motion
    const ph = photon(GEO, now, M, d1);
    const polar = [];
    for (let s = 0; s < 4; s++) {
      const P = plan(d0[s], d1[s]);
      const exc = ph && ph.slot === s && ph.e > 0 ? ph : null;
      for (const a of drawDigit(ctx, GEO.slots[s], P, P.same ? 9 : u, tt, s, s < 2 ? heatH : 0, dim, exc)) if (a.hetero > 0.5 && a.a > 0.5 && !a.moving) polar.push(a);
    }
    if (ph) drawPhoton(ctx, ph, now, dim);
    drawSolvent(ctx, GEO, now, polar, dim);
  },
};

// ---------------------------------------------------------- board molecule
/** The phenalene skeleton of the three boards, its rim electron, and the hour's catalysis. */
function drawBoardMolecule(ctx, GEO, now, dim) {
  const { rim, centre, seams } = GEO;
  const sec = ((now % 60) + 60) % 60;
  const at = (s) => {
    const n = rim.length, f = ((s % n) + n) % n, i = Math.floor(f), w = f - i;
    const a = rim[i].pos, b = rim[(i + 1) % n].pos;
    return [kit.lerp(a[0], b[0], w), kit.lerp(a[1], b[1], w)];
  };
  // rim carbons: the dial's 12 marks; the electron lights each as it passes
  const sPos = sec / 5;
  for (const [k, g] of rim.entries()) {
    const dk = Math.abs(((sPos - k + 6) % 12 + 12) % 12 - 6);
    const flare = Math.exp(-dk * dk * 30);
    blob(ctx, g.pos[0], g.pos[1], 4.6, C_ATOM, dim * (0.07 + 0.35 * flare));
  }
  blob(ctx, centre.pos[0], centre.pos[1], 5.5, C_ATOM, dim * 0.12);
  // the rim electron: the second hand, with a fading wake
  for (let j = 0; j < 14; j++) {
    const p = at(sPos - j * 0.035);
    blob(ctx, p[0], p[1], 4.2, ELECTRON, dim * 0.85 * (1 - j / 14) ** 2);
  }
}

// ----------------------------------------------------------------- solvent
// A few water molecules drift in the empty lobes, bump off the digits and
// reach for their oxygens and nitrogens with dotted hydrogen bonds.
const WATERS = [
  { board: 0, zx: -22, zy: 6, rx: 7, ry: 22 },
  { board: 0, zx: -21, zy: -6, rx: 8, ry: 24 },
  { board: 1, zx: 22, zy: 6, rx: 7, ry: 22 },
  { board: 1, zx: 21, zy: -6, rx: 8, ry: 24 },
];
const C_H = kit.hex('#e8eef8');
const hexd = (x, y) => Math.max(Math.abs(x), Math.abs(x) * 0.5 + Math.abs(y) * 0.866);

function waterAt(GEO, L, w, k, now) {
  const p = L.panels[w.board];
  let x = p.x + w.zx + w.rx * 2 * (kit.noise2(now * 0.09, k * 11.3) - 0.5) * 1.8;
  let y = p.y + w.zy + w.ry * 2 * (kit.noise2(k * 5.7 + 3, now * 0.08) - 0.5) * 1.8;
  // stay on the board, inside ring 9
  const hx = x - p.x, hy = y - p.y, hd = hexd(hx, hy);
  if (hd > 29) { x = p.x + hx * 29 / hd; y = p.y + hy * 29 / hd; }
  // bump off the digits: pushed out of each digit's box, sliding along it
  for (const S of GEO.slots) {
    const dx = x - S.cx, dy = y - S.cy, ex = 31, ey = 30;
    const q = Math.hypot(dx / ex, dy / ey);
    if (q < 1) { const f = 1 / Math.max(q, 1e-3); x = S.cx + dx * f; y = S.cy + dy * f; }
  }
  return [x, y];
}

function drawSolvent(ctx, GEO, now, polar, dim) {
  const L = ctx.layout;
  WATERS.forEach((w, k) => {
    const [x, y] = waterAt(GEO, L, w, k, now);
    const th = 6 * kit.noise2(now * 0.13 + k * 3.1, 7.7) + now * 0.25 * (k % 2 ? 1 : -1);
    blob(ctx, x, y, 3.9, EL.O, 0.5 * dim);
    for (const sgn of [-1, 1]) {
      const a = th + sgn * 0.91;
      blob(ctx, x + 4.4 * Math.cos(a), y + 4.4 * Math.sin(a), 3.1, C_H, 0.28 * dim);
    }
    // hydrogen bonds: dotted, to any O or N in reach
    for (const at of polar) {
      const dx = at.x - x, dy = at.y - y, d = Math.hypot(dx, dy);
      if (d < 7 || d > 19) continue;
      const v = kit.smoothstep(19, 13, d) * kit.smoothstep(7, 9, d);
      const n = Math.floor(d / 3.5);
      for (let j = 1; j < n; j++) {
        const f = j / n;
        blob(ctx, x + dx * f, y + dy * f, 2.4, C_H, v * 0.3 * dim * (0.6 + 0.4 * Math.sin(now * 6 - j * 1.4)));
      }
    }
  });
}

// ------------------------------------------------------------------- flame
// The hour: a Bunsen burner lights at the central carbon and the hour
// molecules burn. They glow white-hot, the old atoms leave as smoke and
// CO2, and the new hour condenses out of the flame.
const BLUE = [0, 0.1, 1];
const halos = new Map();
/** LEDs close to the bonds of digit d in slot S: the flame keeps clear of them. */
function haloOf(ctx, S, sid, d) {
  const key = `${ctx.layout.key}/${sid}/${d}`;
  if (halos.has(key)) return halos.get(key);
  const m = new Map();
  for (const k of G[d].bonds.keys()) {
    const [a, b] = k.split('|'), p = S.at(...V[a]), q = S.at(...V[b]);
    for (const i of S.leds) {
      const l = ctx.leds[i], dd = kit.segDist(l.x, l.y, p[0], p[1], q[0], q[1]);
      const v = 1 - kit.smoothstep(3, 6.5, dd);
      if (v > (m.get(i) ?? 0)) m.set(i, v);
    }
  }
  halos.set(key, m);
  return m;
}

function drawFlame(ctx, GEO, now, hu, dim, hours) {
  const [ox, oy] = GEO.centre.pos;
  const clear = new Map();
  for (const [sid, d] of hours) for (const [i, v] of haloOf(ctx, GEO.slots[sid], sid, d)) clear.set(i, Math.max(v, clear.get(i) ?? 0));
  const cone = sm(hu, [-3.2, -2.4]) * (1 - sm(hu, [2.4, 3.6]));
  const fire = sm(hu, [-2.4, -0.6]) * (1 - sm(hu, [1.2, 3.6]));
  const hot = (k) => kit.blackbody(900 + 1500 * k);
  for (const l of ctx.leds) {
    const h = oy - l.y, dx = l.x - ox;              // height above the burner
    if (h < -4 || h > 75) continue;
    // the blue cone, roaring
    if (h < 14 && cone > 0) {
      const w = 1.5 + 0.28 * Math.max(h, 0);
      const c = Math.exp(-((dx / w) ** 2)) * kit.smoothstep(-4, 1, h) * (1 - kit.smoothstep(6, 14, h));
      if (c > 0.01) kit.add(ctx, l.i, BLUE, c * cone * dim * (0.55 + 0.1 * Math.sin(now * 40 + h)));
    }
    if (fire <= 0 || h < 3) continue;
    // the yellow flame above it, licking up round the hour digits
    const reach = 20 + 42 * fire;
    const w = 5 + 0.75 * h;
    const env = Math.exp(-((dx / w) ** 2)) * kit.smoothstep(3, 10, h) * (1 - kit.smoothstep(reach * 0.5, reach, h));
    if (env < 0.02) continue;
    const n = kit.fbm(dx * 0.13, h * 0.05 - now * 2.6, now * 0.8, 3);
    const f = kit.clamp(env * (3.2 * n - 1.45) * (1.3 - h / 70) * (0.6 + 0.6 * fire));
    if (f > 0.01) kit.add(ctx, l.i, hot(f), f ** 1.4 * dim * 0.85 * (1 - 0.85 * (clear.get(l.i) ?? 0)));
  }
  // combustion products: CO2 puffs drifting up and away
  if (hu > 0 && hu < 4.2) {
    for (let k = 0; k < 6; k++) {
      const t0 = 0.15 * k, age = hu - t0;
      if (age <= 0 || age > 3) continue;
      const S = GEO.slots[k % 2];
      const x = S.cx + (kit.hash(k, 3) - 0.5) * 20 + 4 * Math.sin(age * 2.5 + k);
      const y = S.cy - 6 - age * 22;
      const a = (1 - sm(age, [1.8, 3])) * sm(age, [0, 0.3]) * dim;
      const th = age * (k % 2 ? 1.3 : -1.1) + k;
      const cx = Math.cos(th) * 4.2, cy = Math.sin(th) * 4.2;
      blob(ctx, x, y, 3.4, C_ATOM, 0.4 * a);
      blob(ctx, x + cx, y + cy, 3.6, EL.O, 0.5 * a);
      blob(ctx, x - cx, y - cy, 3.6, EL.O, 0.5 * a);
    }
  }
}

// ------------------------------------------------------------------ photon
// Every few seconds a photon wriggles in from the rim and is swallowed by a
// bond, which glows and rings, stretching, before it settles again.
const GOLD = [1, 0.72, 0.1];
const PH_EVERY = 6.5, PH_FLY = 1.2, PH_RING = 2.2;
function photon(GEO, now, M, d1) {
  const j = Math.floor(now / PH_EVERY), t0 = j * PH_EVERY + 0.5 + 2 * kit.hash(j, 7);
  const age = now - t0;
  if (age < 0 || age > PH_FLY + PH_RING) return null;
  // not while a reaction is running
  const turn = Math.round(t0 / 60) * 60;
  if (t0 + PH_FLY + PH_RING > turn - 1.5 && t0 < turn + 2.5) return null;
  const slot = Math.floor(kit.hash(j, 1) * 4);
  const keys = [...G[d1[slot]].bonds.keys()];
  const [a, b] = keys[Math.floor(kit.hash(j, 2) * keys.length)].split('|');
  const S = GEO.slots[slot], p = S.at(...V[a]), q = S.at(...V[b]);
  const target = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const th = kit.hash(j, 3) * 2 * Math.PI;
  const start = [target[0] + 45 * Math.cos(th), target[1] + 45 * Math.sin(th)];
  const ring = age - PH_FLY;
  return {
    slot, a, b, target, start, age,
    e: ring > 0 ? Math.exp(-ring * 1.8) * kit.smoothstep(0, 0.08, ring) : 0,
    osc: ring * 2 * Math.PI * 4.5,
  };
}

function drawPhoton(ctx, ph, now, dim) {
  if (ph.age >= PH_FLY) return;
  const w = kit.ease.in(ph.age / PH_FLY);
  const dx = ph.target[0] - ph.start[0], dy = ph.target[1] - ph.start[1], n = Math.hypot(dx, dy);
  const ux = dx / n, uy = dy / n;
  const hx = ph.start[0] + dx * w, hy = ph.start[1] + dy * w;
  for (let k = 0; k < 9; k++) {
    const back = k * 2.2, env = Math.sin(Math.PI * (k + 0.5) / 9);
    const off = 3 * Math.sin(k * 1.2 - now * 22);
    const x = hx - ux * back - uy * off, y = hy - uy * back + ux * off;
    blob(ctx, x, y, 3.2, GOLD, 0.7 * env * dim);
  }
}
