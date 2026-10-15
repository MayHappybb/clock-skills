// Lantern: three hexagonal palace lanterns (宫灯) hang in a row, and each is a
// trotting-horse lantern (走马灯). The board's pointed top is the lantern's
// hanging cords meeting at the hook, the flat sides carry red tassels, the
// pointed bottom the tassel knot. Inside, the candle's heat turns paper
// drums, and their cut-outs throw shadows on the red silk. The outer drum
// carries paper-cut (剪纸) numerals, three copies round it: their strokes are
// slits that let the candle through in gold, held to the sheet by bridges
// like any stencil. An inner drum carries galloping horsemen that run
// steadily round, overtaking the numerals and passing behind them. The hour
// rides in the first lantern, the minutes in the other two. The drums are
// round, so everything foreshortens and fades as it turns away.
//
// The numeral drum trots: it lingers while a numeral faces you, then runs to
// the next one. The three numeral drums turn in step, so the copies of the
// time line up across the row. At the minute the candle flares and the hot
// draught whirls the drums once round; each cut-out is swapped for the new
// numeral as it passes behind the candle, so the old time leaves on the
// right and the new one comes in on the left. A copy only ever shows the old
// or the new time, and changed lanterns spin together, so an aligned row
// never reads as a wrong time. At the hour the lanterns swing on their hooks
// and fireworks burst in the sky above them.
//
// Look: opal at 2 mm. The lantern's silk IS a diffuser: shadows must be
// continuous shapes, not missing dots (on bare LEDs the riders were
// unreadable), while 2 mm still keeps the gold slits and their dark margins
// apart.
//
// Stateless: everything is a closed-form function of the wall clock.
import * as kit from '../js/kit.js';

const TAU = Math.PI * 2;
const R = 34;                      // drum shadow radius (mm): screen x = R sin(angle)
const COPIES = 3, SLOT = TAU / COPIES;
const RIDERS = 3, HSLOT = TAU / RIDERS, HREV = 17;   // the riders' drum
const REV = 30;                    // seconds per turn of the drum at rest
const TROT = 0.85;                 // how much it lingers on each numeral (0 = steady)
const SPIN_DELAY = 0.35, SPIN = 2.9;
const PX = 29.5, PY = 19;           // the silk window, lantern mm
const SW = 4.4, BORDER = 5.4;      // numeral slit width, dark paper round it
const PIVOT_Y = -43;               // the board's top vertex: the lantern hangs here
const HX = 0.9, HOFF = 10.2;       // the hour's pair of numerals: condensed, spaced
const MX = 1.1;                    // a minute numeral alone: a little wider

// blue is left out of the dim colours: it would only ever sit at 1-3 of 255
const SILK_DEEP = [0.42, 0, 0], SILK_HOT = [1, 0.12, 0];
const GOLD = [1, 0.4, 0.02], FRAME = [0.85, 0.4, 0], TASSEL = [0.9, 0, 0];
// fireworks: gold, red and jade, with a white-hot start
const FIRE = [kit.hex('#ffc845'), kit.hex('#ff3018'), kit.hex('#40e070'), kit.hex('#fff4dc')];

const pad = (n) => String(n).padStart(2, '0');
/** The three lanterns' texts at a date: hour, minute tens, minute ones. */
const texts = (d) => { const m = pad(d.getMinutes()); return [pad(d.getHours()), m[0], m[1]]; };

// ---------------------------------------------------------- the numerals
// Centre lines of the slits, mm, y down; box about x +-6.5, y +-13.
const arc = (cx, cy, rx, ry, a0, a1, n = 12) => Array.from({ length: n + 1 }, (_, i) => {
  const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
  return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
});
const bez = (p0, p1, p2, n = 8) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
});
const six = [[...bez([4.6, -13], [-6.2, -9.5], [-6, 5.5]), ...arc(0, 6.2, 6, 6.6, 180, 540, 18)]];
const PATHS = {
  0: [Array.from({ length: 29 }, (_, i) => { const a = (i / 28) * TAU, c = Math.cos(a), n = Math.sin(a); return [6.2 * Math.sign(c) * Math.abs(c) ** 0.7, 12.6 * Math.sign(n) * Math.abs(n) ** 0.7]; })],
  1: [[[-4.6, -8.4], [0, -13], [0, 13]]],
  2: [[...arc(0, -6.6, 6, 6.4, 195, 375, 10), ...bez([5.8, -4.9], [1.5, 4], [-6.3, 13]).slice(1), [6.6, 13]]],
  3: [[...arc(0, -7.2, 5.4, 5.8, 205, 450, 12), ...arc(0, 6.3, 6.2, 6.7, 270, 520, 14).slice(1)]],
  4: [[[3.6, 13], [3.6, -13], [-6.6, 5.4], [6.8, 5.4]]],
  5: [[[6, -13], [-4.8, -13], [-5.6, -1.4], ...arc(0.3, 6, 6, 7, 228, 520, 14)]],
  6: six,
  7: [[[-6.5, -13], [6.5, -13], ...bez([6.5, -13], [0.5, -2], [-1.4, 13]).slice(1)]],
  8: [arc(0, -7.1, 5, 5.8, 0, 360, 18), arc(0, 6.4, 6.2, 6.6, 0, 360, 20)],
  9: six.map((p) => p.map(([x, y]) => [-x, -y])),
};
// A paper cut cannot have islands: every counter is held to the sheet by a
// bridge (连线) across the slit, so these are stencil numerals by necessity.
// Bridges sit where a gap cannot turn one numeral into another: a 0 cut
// open at a corner would read as 6, so its two bridges are top and bottom.
const BRIDGES = {
  0: [[0, -12.6], [0, 12.6]], 4: [[-1.5, -3.8]], 6: [[4.4, 10.7]], 8: [[-3.7, -10.9], [4.6, 10.6]], 9: [[-4.4, -10.7]],
};
// The counters (closed holes) of each numeral: the paper inside them is
// solid, so the cut-out's shadow fills them.
const COUNTERS = {
  0: PATHS[0], 4: [[[3.6, -13], [-6.6, 5.4], [3.6, 5.4]]], 6: [arc(0, 6.2, 6, 6.6, 0, 360, 18)],
  8: PATHS[8], 9: [arc(0, 6.2, 6, 6.6, 0, 360, 18).map(([x, y]) => [-x, -y])],
};
function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Is (x, y) inside one of numeral d's counters (x scaled by sx)? */
const inCounter = (d, x, y, sx) => (COUNTERS[d] ?? []).some((p) => inside(p, x / sx, y));
/** Each numeral as flat segments [ax, ay, bx, by]. */
const SEGS = Object.fromEntries(Object.entries(PATHS).map(([d, paths]) => {
  const s = [];
  for (const p of paths) for (let k = 0; k + 1 < p.length; k++) s.push([p[k][0], p[k][1], p[k + 1][0], p[k + 1][1]]);
  return [d, s];
}));
/** Distance (mm) from (x, y) to the centre line of numeral d, x scaled by sx. */
function digitDist(d, x, y, sx) {
  const S = SEGS[d];
  let best = 1e9;
  x /= sx;
  for (let k = 0; k < S.length; k++) {
    const s = S[k], v = kit.segDist(x, y, s[0], s[1], s[2], s[3]);
    if (v < best) best = v;
  }
  return best * 0.5 * (1 + sx);
}
/** How much of the light a bridge holds back at (x, y): a thin paper strap across the slit. */
function bridge(d, x, y, sx) {
  let b = 0;
  for (const [bx, by] of BRIDGES[d] ?? []) b = Math.max(b, 1 - kit.smoothstep(1.2, 3.2, Math.hypot(x - bx * sx, y - by)));
  return b;
}

// ------------------------------------------------------- horse and rider
const cap = (px, py, ax, ay, bx, by, r) => kit.segDist(px, py, ax, ay, bx, by) - r;
/** A two-bone leg from the hip, swung by a1 and bent by a2: its distance. */
function leg(px, py, hx, hy, a1, a2) {
  const kx = hx + 6.2 * Math.sin(a1), ky = hy + 6.2 * Math.cos(a1);
  const fx = kx + 6 * Math.sin(a1 + a2), fy = ky + 6 * Math.cos(a1 + a2);
  return Math.min(cap(px, py, hx, hy, kx, ky, 2.4), cap(px, py, kx, ky, fx, fy, 1.8));
}
/**
 * Signed distance to a horse and rider at the flying gallop, facing +x, in
 * mm at scale 1 (about 41 x 36 mm): chunky, because the lattice is 4 mm.
 * ph is the gait phase.
 */
function horseDist(x, y, ph, sc) {
  x /= sc; y /= sc;
  if (x < -21 || x > 24 || y < -23 || y > 18) return 9;
  y -= 1.1 * Math.sin(2 * ph);                                    // the body rises and falls
  let d = (Math.hypot(x / 11, (y - 0.5) / 6.6) - 1) * 6.6;        // barrel
  d = Math.min(d, Math.hypot(x - 8.5, y + 1) - 5.8);              // chest
  const nod = 0.9 * Math.sin(ph + 0.6);
  d = Math.min(d, cap(x, y, 9.5, -3, 14.5, -11 + nod, 3.8));      // neck
  d = Math.min(d, cap(x, y, 14.5, -11.5 + nod, 21, -8 + nod, 2.9)); // head
  d = Math.min(d, cap(x, y, 14, -13 + nod, 13, -17 + nod, 1.3));    // ears
  d = Math.min(d, cap(x, y, -10, -2, -18, -6.5 + 1.6 * Math.sin(ph * 2), 2.1)); // tail, streaming
  // legs flung out fore and aft, as in 马踏飞燕: the pose reads at 4 mm
  const s1 = Math.sin(ph), s2 = Math.sin(ph + 0.5);
  d = Math.min(d, leg(x, y, 8.5, 3, 0.75 + 0.45 * s1, -0.25 - 0.55 * Math.max(0, -s1)));
  d = Math.min(d, leg(x, y, -8.5, 3, -0.8 + 0.45 * s2, 0.3 + 0.5 * Math.max(0, s2)));
  // the rider, leaning into it
  d = Math.min(d, cap(x, y, 0.5, -4, 2.5, -12, 3.4));
  d = Math.min(d, Math.hypot(x - 3.8, y + 17.2) - 3.2);
  return d * sc;
}
// ------------------------------------------------------------ the drums
/**
 * Lantern k's drum at epoch seconds `now`: Mc is its last change, a0 the drum
 * angle then, a the angle now (unwrapped from a0), w its speed in rad/s.
 * At each change the drum turns once extra; a whole turn changes nothing at
 * rest, so all three drums stay in step.
 */
function drum(now, k, date) {
  // local time, so a half-hour time zone still turns the hour at :00
  const into = (k === 0 ? date.getMinutes() * 60 : k === 1 ? (date.getMinutes() % 10) * 60 : 0) + date.getSeconds() + date.getMilliseconds() / 1000;
  const Mc = Math.round((now - into) * 1000) / 1000;
  const p = kit.clamp((now - Mc - SPIN_DELAY) / SPIN);
  const de = p <= 0 || p >= 1 ? 0 : p < 0.5 ? 12 * p * p : 3 * (2 - 2 * p) ** 2;
  // the drum trots: it lingers while a numeral faces you, then runs on to
  // the next. F maps the steady angle th to the drum angle, slot by slot,
  // and F(th + 2pi) = F(th) + 2pi, so the extra turn keeps every copy in step.
  const m = TROT * (1 - Math.sin(Math.PI * p) ** 2);
  const th = TAU * ((Mc % REV) / REV) + (TAU * (now - Mc)) / REV + TAU * kit.ease.inOut(p);
  const F = (v) => { const j = Math.floor(v / SLOT), u = v / SLOT - j; return SLOT * (j + (1 - m) * u + m * kit.ease.inOut(u)); };
  const u = th / SLOT - Math.floor(th / SLOT), du = u < 0.5 ? 12 * u * u : 3 * (2 - 2 * u) ** 2;
  const dth = TAU / REV + (TAU * de) / SPIN;
  return { Mc, a0: F(TAU * ((Mc % REV) / REV)), a: F(th), w: dth * (1 - m + m * du), spin: p };
}

/** Everything about lantern k this frame. */
function lantern(now, k, hAge, date) {
  const D = drum(now, k, date);
  const nu = texts(new Date(D.Mc * 1000 + 500))[k], old = texts(new Date(D.Mc * 1000 - 500))[k];
  // a copy carries the new text once it has passed behind the candle since the change
  const copies = [0, 1, 2].map((j) => {
    const c0 = Math.floor((D.a0 + j * SLOT - Math.PI) / TAU), c1 = Math.floor((D.a + j * SLOT - Math.PI) / TAU);
    return c1 > c0 ? nu : old;
  });
  const age = now - D.Mc, hour = hAge >= 0;
  const flare = 1 + (hour ? 0.7 : 0.45) * Math.exp(-(((age - 0.5) / 0.8) ** 2)) * (age < 6 ? 1 : 0);
  const flick = 0.9 + 0.13 * (kit.noise2(now * 2.3, k * 7) - 0.5) + 0.06 * (kit.noise2(now * 9.1, k * 3 + 1) - 0.5);
  const sway = hAge >= 0 ? 0.075 * kit.smoothstep(0, 0.5, hAge) * Math.exp(-hAge / 2.8) * Math.sin((TAU * hAge) / 1.7 + k * 0.9) : 0;
  const blur = D.w / 40;                       // angle swept while the eye integrates
  const nb = Math.min(5, 1 + Math.floor((blur * R) / 2.2));
  return {
    ...D, copies, light: flare * flick, sway, cs: Math.cos(sway), sn: Math.sin(sway),
    nb, step: blur / nb, hsc: 0.95,
    fx: 2.4 * (kit.noise2(now * 0.9, k * 5 + 2) - 0.5), fy: 7 + 2 * (kit.noise2(now * 0.7, k * 5 + 9) - 0.5),
    gait: (TAU * (now % 48)) / 0.5 + 2 * TAU * kit.ease.inOut(D.spin),
    // the same hot draught whirls the riders' drum once round too
    ah: (TAU * (now % HREV)) / HREV + TAU * kit.ease.inOut(D.spin) + k * 0.9,
  };
}

const caches = new Map();
function prep(ctx) {
  const L = ctx.layout;
  if (caches.has(L.key)) return caches.get(L.key);
  const n = ctx.n, lx = new Float32Array(n), ly = new Float32Array(n), board = new Int8Array(n);
  for (const l of ctx.leds) { const p = L.panels[l.panel]; lx[l.i] = l.x - p.x; ly[l.i] = l.y - p.y; board[l.i] = l.panel; }
  const c = { lx, ly, board, kind: new Int8Array(n), sky: new Float32Array(3 * n) };
  caches.set(L.key, c);
  return c;
}

// --------------------------------------------------------------- fireworks
const BURSTS = [0.1, 0.7, 1.3, 1.9, 2.6, 3.3, 4.0, 4.8, 5.6, 6.4];
const RISE = 0.55;
function dab(ctx, C, x, y, r, c, a) {
  for (const i of ctx.layout.index.near(x, y, r)) {
    const l = ctx.leds[i], d = Math.hypot(l.x - x, l.y - y) / r, f = (1 - d * d) ** 2 * a;
    C.sky[3 * i] += c[0] * f; C.sky[3 * i + 1] += c[1] * f; C.sky[3 * i + 2] += c[2] * f;
  }
}
/**
 * The hour's fireworks, in world mm, into C.sky. Each rocket climbs from
 * below the lanterns (seen under them, lost behind the silk), bursts above
 * them in a peony of streaking stars that sag as they fall. Returns the
 * light the bursts throw on the silk.
 */
function fireworks(ctx, C, hAge, H) {
  const flash = [0, 0, 0];
  for (let b = 0; b < BURSTS.length; b++) {
    const tau = hAge - BURSTS[b];
    if (tau < 0 || tau > RISE + 2.6) continue;
    const k = b % 3, p = ctx.layout.panels[(k + Math.floor(kit.hash(H, b, 1) * 2)) % 3];
    const cx = p.x + (kit.hash(H, b, 2) - 0.5) * 30, cy = p.y - 32 + (kit.hash(H, b, 3) - 0.5) * 8;
    const col = FIRE[Math.floor(kit.hash(H, b, 4) * 3)];
    if (tau < RISE) {
      // the rocket: a spark and its tail, climbing and slowing
      const e = kit.ease.out(tau / RISE), y = kit.lerp(p.y + 44, cy, e), x = cx + (1 - e) * 3;
      dab(ctx, C, x, y, 2.6, FIRE[0], 0.9);
      dab(ctx, C, x + 0.6, y + 5, 2.4, FIRE[0], 0.35);
      continue;
    }
    const t = tau - RISE, life = 2.6, fade = (1 - t / life) ** 1.6;
    const rad = 17 + 9 * kit.hash(H, b, 5), N = 16;
    for (let s = 0; s < N; s++) {
      const ang = (s / N) * TAU + kit.hash(H, b, 10 + s) * 0.35;
      const sp = rad * (0.8 + 0.2 * kit.hash(H, b, 40 + s));
      const r = sp * (1 - Math.exp(-3 * t)), r0 = sp * (1 - Math.exp(-3 * Math.max(0, t - 0.12)));
      const g = 12 * t * t, g0 = 12 * Math.max(0, t - 0.12) ** 2;
      const tw = 0.65 + 0.35 * Math.sin(t * 37 + s * 2.3);
      const c = t < 0.1 ? FIRE[3] : kit.mix(col, FIRE[3], 0.25 * tw);
      dab(ctx, C, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r + g, 3.4, c, 1.6 * fade * tw);
      dab(ctx, C, cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0 + g0, 2.8, col, 0.6 * fade);
    }
    const fl = Math.exp(-t * 3) * 0.03;
    flash[0] += col[0] * fl; flash[1] += col[1] * fl; flash[2] += col[2] * fl;
  }
  return flash;
}

/** Shadow, gold and rib cover at drum content angle psi, height y. */
function drumAt(S, psi, y, aa, out) {
  const j = Math.round(psi / SLOT), du = R * (psi - j * SLOT);
  const txt = S.copies[((j % COPIES) + COPIES) % COPIES], two = txt.length === 2;
  const hw = (two ? 6.5 * HX + HOFF : 6.5 * MX) + SW / 2 + BORDER + aa;
  let plate = 0, gold = 0, shadow = 0;
  if (Math.abs(du) < hw && Math.abs(y) < 13 + SW / 2 + BORDER + aa) {
    const d = two ? Math.min(digitDist(txt[0], du + HOFF, y, HX), digitDist(txt[1], du - HOFF, y, HX)) : digitDist(txt, du, y, MX);
    const br = two ? Math.max(bridge(txt[0], du + HOFF, y, HX), bridge(txt[1], du - HOFF, y, HX)) : bridge(txt, du, y, MX);
    gold = (1 - kit.smoothstep(SW / 2 - aa, SW / 2 + aa, d)) * (1 - 0.6 * br);
    // the paper the numeral is cut from: the numeral's own shape, fattened,
    // its counters solid
    const cin = two ? inCounter(txt[0], du + HOFF, y, HX) || inCounter(txt[1], du - HOFF, y, HX) : inCounter(txt, du, y, MX);
    plate = cin ? 1 : 1 - kit.smoothstep(SW / 2 + BORDER - aa, SW / 2 + BORDER + aa, d);
  }
  // the riders are on a second, inner drum: they run steadily round,
  // overtaking the numerals and passing behind their paper
  const ph = psi + S.a - S.ah, hj = Math.floor(ph / HSLOT), dh = R * (ph - (hj + 0.5) * HSLOT);
  if (Math.abs(dh) < 26) shadow = 1 - kit.smoothstep(-aa, aa, horseDist(dh - 1.5, y, S.gait + hj * 1.9, S.hsc));
  const RIB = TAU / 12, rp = R * RIB * Math.abs(psi / RIB - Math.round(psi / RIB));
  out[0] += Math.max(plate, shadow); out[1] += gold; out[2] += 1 - kit.smoothstep(0.2, 0.2 + 1.4 * aa, rp);
}

export default {
  name: 'Lantern',
  blurb: 'three trotting-horse lanterns: paper-cut numerals ride the turning drums with the horsemen',
  layouts: ['hex-row'], look: { look: 'opal', gap: 2 }, fps: 60, brightness: 0.6, dither: true,
  frame(ctx) {
    const C = prep(ctx), { lx, ly, board, kind, sky } = C, out = ctx.out, n = ctx.n;
    const now = ctx.date.getTime() / 1000, dim = 1 - 0.72 * ctx.night;
    const d = ctx.date, intoHour = d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
    const H = Math.round(now - intoHour), hAge = intoHour < 9 ? intoHour : -1;
    const S = [0, 1, 2].map((k) => lantern(now, k, hAge, d));
    let flash = [0, 0, 0];
    if (hAge >= 0) { sky.fill(0); flash = fireworks(ctx, C, hAge, H); }
    const acc = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const s = S[board[i]];
      // into the lantern's own frame (it may be swinging on its hook)
      const bx = lx[i], by = ly[i] - PIVOT_Y;
      const x = bx * s.cs + by * s.sn, y = -bx * s.sn + by * s.cs + PIVOT_Y;
      const ax = Math.abs(x), ay = Math.abs(y);
      let r = 0, g = 0, b = 0;
      if (ax < PX && ay < PY) {
        kind[i] = 0;
        const sn = kit.clamp(x / R, -1, 1), phi = Math.asin(sn), cphi = Math.sqrt(1 - sn * sn);
        const aa = Math.min(3, 0.9 / Math.max(cphi, 0.3));
        acc[0] = acc[1] = acc[2] = 0;
        for (let q = 0; q < s.nb; q++) drumAt(s, phi - s.a + (q - (s.nb - 1) / 2) * s.step, y, aa, acc);
        const shade = acc[0] / s.nb, gold = acc[1] / s.nb, rib = acc[2] / s.nb;
        const dx = x - s.fx, dy = y - s.fy, G = 0.5 + 0.5 / (1 + (dx * dx + dy * dy) / 700);
        // orange only in the hot core, so its green never sits at the dim end
        const silk = kit.mix(SILK_DEEP, SILK_HOT, (G - 0.5) * 2); silk[1] = 0.26 * kit.smoothstep(0.66, 1, G);
        const lam = 0.3 + 0.7 * cphi;              // a round lantern: the sides turn away
        const k = 0.5 * G * lam * s.light * (1 - kit.clamp(shade)) * (1 - 0.12 * rib);
        const kg = 0.85 * gold * (0.55 + 0.45 * G) * (cphi * cphi) ** 2 * s.light;   // a slit seen edge-on fades
        r = silk[0] * k + GOLD[0] * kg + flash[0]; g = silk[1] * k + GOLD[1] * kg + flash[1]; b = silk[2] * k + GOLD[2] * kg + flash[2];
        if (hAge >= 0) {
          // a burst behind the lantern glows through the silk, softly, round the drum's shadows
          const th = 0.8 * (1 - 0.6 * kit.clamp(shade));
          r += sky[3 * i] * th; g += sky[3 * i + 1] * th; b += sky[3 * i + 2] * th;
        }
      } else if (ax > 33 && ax < 37.5 && y > -21.5 && y < 21.5) {
        // red silk tassels hang from the eaves down both sides, swinging
        kind[i] = 1;
        const u = (y + 20) / 40, wave = Math.sin(y * 0.45 - now * 2.1 + (x > 0 ? 1.3 : 0) + board[i] * 2.1);
        const knot = y < -18 ? 1 : 0;
        const th = (0.34 + 0.12 * wave) * (1 - 0.4 * u);
        r = TASSEL[0] * th + FRAME[0] * 0.5 * knot + flash[0] * 2; g = TASSEL[1] * th + FRAME[1] * 0.5 * knot + flash[1] * 2;
        b = TASSEL[2] * th + FRAME[2] * 0.5 * knot + flash[2] * 2;
      } else if (ax < 37.5 && ay < 23.3) {
        // gold posts and rails, catching the candle at the corners
        kind[i] = 1;
        const post = ax >= PX, glint = 0.75 + 0.25 * s.light * (post ? 1 : 0.6);
        const k = (post ? 0.17 : 0.14) * glint * (ay > 19 && post ? 1.8 : 1);
        r = FRAME[0] * k + flash[0] * 3; g = FRAME[1] * k + flash[1] * 3; b = FRAME[2] * k + flash[2] * 3;
      } else if (y < 0) {
        // cords from the eaves up to the hook, and the hook itself
        kind[i] = 2;
        const d = Math.min(kit.segDist(x, y, -35, -22, 0, -40.5), kit.segDist(x, y, 35, -22, 0, -40.5));
        const k = 0.13 * (1 - kit.smoothstep(0.8, 2.4, d)) + 0.4 * (1 - kit.smoothstep(1, 3, Math.hypot(x, y + 40)));
        r = FRAME[0] * k; g = FRAME[1] * k; b = FRAME[2] * k;
      } else {
        // the tassel: a gold knot, then red silk threads that swing
        kind[i] = 3;
        const swing = (y - 24) * 0.11 * Math.sin(now * 1.3 + board[i] * 1.7);
        const kn = 0.45 * (1 - kit.smoothstep(1.2, 3.4, Math.hypot(x - swing * 0.3, y - 25.5)));
        let th = 0;
        if (y > 26.5) {
          const w = 2.4 + (y - 26.5) * 0.24, u = Math.abs(x - swing);
          th = 0.26 * (1 - kit.smoothstep(w - 1.4, w + 1.2, u)) * (0.6 + 0.4 * Math.sin((x - swing) * 1.8)) * (1 - 0.4 * (y - 26.5) / 16);
        }
        r = FRAME[0] * kn + TASSEL[0] * th; g = FRAME[1] * kn + TASSEL[1] * th; b = FRAME[2] * kn + TASSEL[2] * th;
      }
      // fireworks are behind the lanterns: they show only where the sky is open
      if (hAge >= 0 && kind[i] >= 2) {
        const open = kind[i] === 2 ? Math.max(0, 1 - 4 * r) : Math.max(0, 1 - 3 * r);
        r += sky[3 * i] * open; g += sky[3 * i + 1] * open; b += sky[3 * i + 2] * open;
      }
      out[3 * i] = r * dim; out[3 * i + 1] = g * dim; out[3 * i + 2] = b * dim;
    }
  },
};
