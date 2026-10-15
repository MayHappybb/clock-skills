// Slide puzzle choreography. Slots are numbered s = row * 3 + col.
//
//   H1 H2 .        the four digit tiles sit on a stair: hours top-left,
//   .  .  .        minutes bottom-right; the five other slots (a path:
//   .  M1 M2       6-3-4-5-2) hold four picture tiles and the empty tray.
//
// Rules that keep the time honest:
// - a digit tile only ever moves into a picture slot, never into another
//   digit's slot (so no digit is ever read in the wrong place);
// - an old digit leaves and sinks before :00, a new one rises after :00, so
//   every digit on show is either right or absent.
// The empty tray is a trapdoor: a tile pushed into it can sink, and a new
// tile can rise through any empty slot.
//
// A script covers one minute boundary B, local times t in [-30, 30) s.

export const DIG = [0, 1, 7, 8];               // H1 H2 M1 M2
export const PATH = [6, 3, 4, 5, 2];
const PIDX = new Map(PATH.map((s, i) => [s, i]));
const NEIGH = { 0: [3], 1: [4, 2], 7: [4, 6], 8: [5] };
// the tray's home moves every hour; never onto the lighthouse's piece (3)
const HOMES = [4, 6, 2, 5];
export const homeOfHour = (h) => HOMES[h % 4];

export const SLIDE = 0.4, OUT = 0.5, SINK = 0.55, RISE = 0.7, FLURRY = 0.21;

const hashi = (a, b) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ b; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function digitsAt(minuteIndex) {
  const d = new Date(minuteIndex * 60000);
  const h = d.getHours(), m = d.getMinutes();
  return { h, d: [Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10] };
}

/**
 * Tiles: { id, frag (the slot whose piece of picture it carries), glyph (-1
 * or digit), slot0, birth, death, rise0, sink0, dip0, dipDepth, slides: [t0, t1, from, to]... }
 */
class Builder {
  constructor() { this.tiles = []; this.board = new Array(9).fill(null); }
  tile(frag, glyph, slot, birth = -1e9) {
    const t = { id: this.tiles.length, frag, glyph, slot0: slot, slot, birth, death: 1e9, rise0: -1e9, sink0: 1e9, dip0: -1e9, dipDepth: 0, slides: [] };
    this.tiles.push(t); this.board[slot] = t; return t;
  }
  slide(from, to, t0, dur) {
    const t = this.board[from];
    t.slides.push(t0, t0 + dur, from, to);
    this.board[from] = null; this.board[to] = t; t.slot = to;
    return t0 + dur;
  }
  sink(slot, t0) { const t = this.board[slot]; t.sink0 = t0; t.death = t0 + SINK; this.board[slot] = null; return t0 + SINK; }
  rise(frag, glyph, slot, t0) { const t = this.tile(frag, glyph, slot, t0); t.rise0 = t0; return t; }
  /** Move the empty tray along the path from index a to b; returns the end time. */
  travel(a, b, t, step) {
    while (a !== b) {
      const n = a + Math.sign(b - a);
      t = this.slide(PATH[n], PATH[a], t, step) + 0.03;
      a = n;
    }
    return t;
  }
}

function build(B) {
  const P = digitsAt(B - 1), Q = digitsAt(B);
  const homeA = homeOfHour(P.h), homeB = homeOfHour(Q.h), hourTurn = P.h !== Q.h;
  const S = new Builder();
  for (let k = 0; k < 4; k++) S.tile(DIG[k], P.d[k], DIG[k]);
  for (const s of PATH) if (s !== homeA) S.tile(s, -1, s);
  const changed = [3, 2, 1, 0].filter((k) => P.d[k] !== Q.d[k]);
  let hi = PIDX.get(homeA);

  // an idle peek in the second half of the previous minute
  const peek = (t0, seed) => {
    const r = hashi(B, seed), dir = hi === 0 ? 1 : hi === 4 ? -1 : r < 0.5 ? -1 : 1;
    const far = Math.max(0, Math.min(4, hi + dir * (r > 0.7 ? 2 : 1)));
    const t1 = S.travel(hi, far, t0, 0.5);
    S.travel(far, hi, t1 + 1.6, 0.5);
  };
  peek(-17, 1);

  if (!hourTurn) {
    // dry run to find how long the exits take, then schedule them to end at :00
    const plan = (S2, t0) => {
      let q = hi, t = t0;
      for (const k of changed) {
        const D = DIG[k], Ns = NEIGH[D];
        let N = Ns[0];
        for (const c of Ns) if (Math.abs(PIDX.get(c) - q) < Math.abs(PIDX.get(N) - q)) N = c;
        t = S2.travel(q, PIDX.get(N), t, SLIDE);
        t = S2.slide(D, N, t, OUT);
        t = S2.sink(N, t + 0.02);
        q = PIDX.get(N);
      }
      return [t, q];
    };
    const dry = new Builder();
    dry.board = S.board.slice();
    // the dry run must not touch the real tiles' slides: clone shallowly
    dry.board = dry.board.map((t) => (t ? { ...t, slides: [] } : null));
    const [len] = plan(dry, 0);
    const [, q] = plan(S, -len);
    changed.slice().reverse().forEach((k, i) => S.rise(DIG[k], Q.d[k], DIG[k], 0.02 + i * 0.14));
    S.travel(q, hi, 0.55, SLIDE);
  } else {
    // the hour: a flurry of the empty tray up and down the path...
    const W0 = -1.45, seq = [];
    let a = hi;
    const ends = hi < 2 ? [4, 0, 4] : [0, 4, 0];
    for (const e of ends) { seq.push(e); a = e; }
    seq.push(hi);
    let steps = 0, x = hi;
    for (const e of seq) { steps += Math.abs(e - x); x = e; }
    let t = W0 - 0.2 - steps * (FLURRY + 0.03);
    x = hi;
    for (const e of seq) { t = S.travel(x, e, t, FLURRY); x = e; }
    // ...then a wave of key-presses from the tray across the board: tiles
    // whose digit changes sink all the way and come back new; the others
    // dip and pop; the tray's piece comes home and a new tray opens.
    const cx = homeA % 3, cy = Math.floor(homeA / 3);
    for (let s = 0; s < 9; s++) {
      const dl = W0 + (Math.abs(s % 3 - cx) + Math.abs(Math.floor(s / 3) - cy)) * 0.22;
      const k = DIG.indexOf(s);
      if (s === homeA) { S.rise(s, -1, s, dl + 0.1); continue; }
      if (s === homeB) { S.sink(s, dl); continue; }
      if (k >= 0 && P.d[k] !== Q.d[k]) {
        S.sink(s, dl);
        S.rise(s, Q.d[k], s, Math.max(dl + SINK + 0.05, 0.02));
        continue;
      }
      const tl = S.board[s];
      tl.dip0 = dl; tl.dipDepth = 1;
    }
    hi = PIDX.get(homeB);
  }
  peek(14, 2);
  return { tiles: S.tiles, hourTurn, homeA, homeB };
}

const cache = new Map();
export function scriptFor(B) {
  let s = cache.get(B);
  if (!s) {
    s = build(B);
    cache.set(B, s);
    if (cache.size > 4) cache.delete(cache.keys().next().value);
  }
  return s;
}
