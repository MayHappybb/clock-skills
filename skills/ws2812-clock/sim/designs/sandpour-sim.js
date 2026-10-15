// Sand pour: the falling-sand automaton inside one mould.
//
// Each grain is one cell. A grain falls if the cell below is empty, else
// slides diagonally down, else (the moulds are vibrated, as a foundry shakes
// a sand mould to pack it) creeps sideways in the direction it was going.
// That last rule is what lets the sand reach under the glass ceilings of a
// 5 or a 7, and drain off the flat foot of a 2.
//
// A run is a pure function of (glyph, mode, seed, step): fill starts from an
// empty mould and pours exactly as many grains as the mould holds; drain
// starts from the end of that mould's fill, so the sand you watch draining
// is, grain for grain, the sand that was poured in. Runs advance
// incrementally and restart only when asked for an earlier step.
import { BW, BH } from './sandpour-glyphs.js';

const N = BW * BH;
const hashi = (a, b, c) => {
  let h = (a * 374761393 + b * 668265263 + c * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

/** The colour of the k-th grain poured: strata of a few sands, black specks. */
export function grainColour(seed, k) {
  const band = Math.floor(k / 30), hb = hashi(seed, band, 7) % 100;
  // amber dominant, then cream, rust, ochre
  let base = hb < 40 ? 0 : hb < 62 ? 1 : hb < 82 ? 2 : 3;
  const hk = hashi(seed, k, 11);
  if (hk % 100 < 4) base = 4;                       // a black grain
  return 1 + base * 4 + ((hk >>> 8) & 3);           // id 1..20: base * 4 + variant
}

export class Run {
  constructor(g, mode, seed, start, rate = 99) {
    this.rate = rate; this.g = g; this.mode = mode; this.seed = seed; this.start = start;
    this.grid = new Uint8Array(N); this.dir = new Int8Array(N);
    this.stamp = new Int32Array(N); this.moved = new Int32Array(N);
    this.events = [];       // fill: [step, cell, id] spawns; drain: [step, cell, id] exits
    this.reset();
  }
  reset() {
    const { grid, dir, g } = this;
    for (let i = 0; i < N; i++) {
      grid[i] = g.cav[i] ? (this.start ? this.start[i] : 0) : 255;
      dir[i] = (hashi(this.seed, i, 3) & 1) ? 1 : -1;
    }
    this.stamp.fill(-1); this.moved.fill(-100);
    this.step = 0; this.spawned = 0; this.grains = 0; this.events.length = 0;
    for (let i = 0; i < N; i++) if (grid[i] && grid[i] !== 255) this.grains++;
    this.quiet = 0; this.budget = 0; this.choke = 0;
  }
  /** Advance to step n (restarting if n is in the past). */
  to(n) {
    if (n < this.step) this.reset();
    while (this.step < n) this.once();
    return this;
  }
  get done() { return this.mode === 'fill' ? this.grains >= this.g.count && this.quiet > 2 : this.grains === 0; }

  once() {
    const s = ++this.step, { grid: g, dir, stamp, moved, seed } = this;
    const fill = this.mode === 'fill', ph = fill ? 0.55 : 0.8, dx = this.g.door.x - 0.5;
    const ltr = s & 1;
    let movedAny = 0;
    for (let y = BH - 2; y >= 1; y--) {
      for (let k = 1; k < BW - 1; k++) {
        const x = ltr ? k : BW - 1 - k, i = y * BW + x, c = g[i];
        if (c === 0 || c === 255 || stamp[i] === s) continue;
        let j = i + BW;
        if (g[j] === 0) { if (g[j + BW] === 0 && y < BH - 2) j += BW; }   // free fall: two cells a step
        else {
          const h = hashi(seed, i, s), f = (h & 1) ? 1 : -1;
          if (g[j + f] === 0) j += f;
          else if (g[j - f] === 0) j -= f;
          else if (((h >>> 1) & 1023) < ph * 1024) {
            let d = dir[i];
            // draining sand creeps toward the trapdoor
            if (!fill && ((h >>> 12) & 3)) d = x < dx ? 1 : -1;
            j = i + d;
            if (g[j] !== 0) { dir[i] = -d; continue; }
            if (g[j + d] === 0) { j += d; if (g[j + d] === 0) j += d; }    // creeps up to 3 cells
            dir[i] = d;
          } else if (fill && g[i - BW] !== 0 && g[i - BW] !== 255 && (h & 0x30000)) {
            // buried and pressed from above: the vibrated sand flows up into
            // a pocket beside it (fills the up-turned hooks of 3, 5, 9)
            j = i - BW + f;
            if (g[j] !== 0) { j = i - BW - f; if (g[j] !== 0) continue; }
          } else continue;
        }
        g[j] = c; g[i] = 0; dir[j] = dir[i]; stamp[j] = s; moved[j] = s; movedAny++;
      }
    }
    const rate = this.rate;                          // grains per step, poured or drained
    this.budget += rate;
    if (fill) {
      const sp = this.g.spawn;
      let blocked = true;
      for (let q = 0; q < sp.length && this.spawned < this.g.count && this.budget >= 1; q++) {
        const i = sp[(q + s) % sp.length];
        if (g[i] !== 0) continue;
        blocked = false;
        const id = grainColour(seed, this.spawned++);
        g[i] = id; moved[i] = s; this.grains++; movedAny++; this.budget--;
        this.events.push(s, i, id);
      }
      this.choke = blocked && this.spawned < this.g.count ? this.choke + 1 : 0;
      if (this.choke > 6) {
        // the mouth is choked and an air pocket is left (an up-turned hook):
        // the vibration packs it. One grain a step settles into the lowest void.
        for (const i of this.g.low) if (g[i] === 0) {
          g[i] = grainColour(seed, this.spawned++); moved[i] = s; this.grains++; movedAny++;
          break;
        }
      }
    } else {
      const sk = this.g.sinks;
      for (let q = 0; q < sk.length && this.budget >= 1; q++) {
        const i = sk[(q + s) % sk.length], c = g[i];
        if (c === 0) continue;
        g[i] = 0; this.grains--; movedAny++; this.budget--;
        this.events.push(s, i, c);
      }
    }
    if (this.budget > 2 * rate + 1) this.budget = 2 * rate + 1;
    this.quiet = movedAny ? 0 : this.quiet + 1;
  }
}

/** Run a fill to completion (capped) and return its final grid and length. */
export function fillResult(g, seed, rate, cap = 3000) {
  const r = new Run(g, 'fill', seed, null, rate);
  while (!r.done && r.step < cap) r.once();
  return { grid: r.grid.slice(), steps: r.step, missing: g.count - r.grains, events: r.events.slice() };
}
