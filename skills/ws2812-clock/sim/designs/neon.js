// Neon: the time bent from glass tube, sign-shop style: hours in neon's own
// red-orange, minutes in argon blue. Gas shimmers along the tubes; the
// electrodes at the tube ends glow. When a digit changes, its tube stutters
// out and the new one strikes: violet ionisation flicker, then its colour.
//
// Drawn in vector strokes sampled at each LED, so it runs on ANY layout:
// one row "HH:MM" on wide assemblies, HH over MM on tall ones, sized to fit.
import * as kit from '../js/kit.js';

const NEON = kit.hex('#ff4a1c'), ARGON = kit.hex('#2f8cff'), STRIKE = kit.hex('#b46bff');
const pad = (n) => String(n).padStart(2, '0');
const digits = (d) => pad(d.getHours()) + pad(d.getMinutes());

const plans = new Map();
/** Where the four digits go on this layout: segments per digit, and the colon. */
function plan(L) {
  if (plans.has(L.key)) return plans.get(L.key);
  const b = L.bbox, tall = b.h / b.w > 0.62;
  const rows = [];
  if (tall) {
    const h = Math.min(0.36 * b.h, (0.78 * b.w) / kit.textWidth('00', 1));
    const w = kit.textWidth('00', h), gap = 0.16 * h;
    rows.push({ txt: [0, 1], x: b.cx - w / 2, y: b.cy - gap / 2 - h, h });
    rows.push({ txt: [2, 3], x: b.cx - w / 2, y: b.cy + gap / 2, h });
  } else {
    const h = Math.min(0.72 * b.h, (0.9 * b.w) / kit.textWidth('00:00', 1));
    const w = kit.textWidth('00:00', h);
    rows.push({ txt: [0, 1, -1, 2, 3], x: b.cx - w / 2, y: b.cy - h / 2, h });
  }
  const p = { rows, h: rows[0].h, tube: Math.max(L.pitch * 1.15, rows[0].h / 7.5) };
  plans.set(L.key, p);
  return p;
}

/** Segments for the digit string s, tagged with the digit slot (0..3, colon -1). */
function segsFor(P, s) {
  const out = [];
  for (const r of P.rows) {
    const txt = r.txt.map((k) => (k < 0 ? ':' : s[k])).join('');
    for (const sg of kit.strokes(txt, { x: r.x, y: r.y, h: r.h, slant: 0.08 })) out.push([...sg.slice(0, 4), r.txt[sg[4]]]);
  }
  return out;
}

/** How lit a tube is (0..1) and how violet (0..1), from the minute's turn. */
function tubeState(slot, age, changed, now) {
  if (!changed) return [1, 0];
  const flick = kit.hash(Math.floor(now * 24), slot) > 0.45 ? 1 : 0.15;
  if (age < 0.55) return [(1 - age / 0.55) * flick, 0];                 // old tube stutters out
  if (age < 0.75) return [0, 0];
  if (age < 1.6) { const k = (age - 0.75) / 0.85; return [k > 0.6 ? 1 : flick * (0.4 + k), 1 - k]; }  // strike
  return [1, 0];
}

export default {
  name: 'Neon', blurb: 'glass-tube digits that stutter out and strike; fits any layout',
  layouts: ['*'], look: 'bare', fps: 60, brightness: 0.6,
  frame(ctx) {
    const L = ctx.layout, P = plan(L);
    const now = ctx.date.getTime() / 1000, M = Math.floor(now / 60) * 60, age = now - M;
    const prev = digits(new Date((M - 60) * 1000)), next = digits(ctx.date);
    const dim = 1 - 0.75 * ctx.night;
    const showOld = age < 0.55;
    const segs = [];
    for (const sg of segsFor(P, next)) if (sg[4] < 0 || !(showOld && prev[sg[4]] !== next[sg[4]])) segs.push(sg);
    if (showOld) for (const sg of segsFor(P, prev)) if (sg[4] >= 0 && prev[sg[4]] !== next[sg[4]]) segs.push(sg);

    const W = P.tube;
    kit.drawStrokes(ctx, segs, {
      width: W, soft: W * 0.6,
      paint(l, d, sg) {
        const slot = sg[4];
        const base = slot < 0 ? kit.mix(NEON, ARGON, 0.5) : slot < 2 ? NEON : ARGON;
        let [lit, vio] = slot < 0 ? [0.55 + 0.45 * Math.sin(now * Math.PI), 0] : tubeState(slot, age, prev[slot] !== next[slot], now);
        if (lit <= 0) return;
        const col = kit.mix(base, STRIKE, vio);
        // gas shimmer travelling along the tube, and mains hum
        const sh = 0.82 + 0.18 * kit.noise2(l.x * 0.12 - now * 1.7, l.y * 0.12 + now * 0.4);
        const hum = 0.97 + 0.03 * Math.sin(now * 2 * Math.PI * 50);
        const core = 1 - kit.smoothstep(0, W * 0.5, d), halo = 1 - kit.smoothstep(W * 0.3, W * 1.1, d);
        const c = kit.mix(col, [1, 0.9, 0.85], 0.25 * core);
        kit.add(ctx, l.i, c, dim * lit * sh * hum * (0.25 * halo + 0.75 * core));
      },
    });
    // electrodes: the ends of each digit's tube glow warm
    for (const r of P.rows) {
      for (const k of r.txt) {
        if (k < 0) continue;
        const [lit] = tubeState(k, age, prev[k] !== next[k], now);
        const tubeSegs = segs.filter((s) => s[4] === k);
        if (!tubeSegs.length || lit <= 0) continue;
        const a = tubeSegs[0], z = tubeSegs[tubeSegs.length - 1];
        kit.splat(ctx, a[0], a[1], W * 0.9, [1, 0.55, 0.2], 0.35 * lit * dim);
        kit.splat(ctx, z[2], z[3], W * 0.9, [1, 0.55, 0.2], 0.35 * lit * dim);
      }
    }
  },
};
