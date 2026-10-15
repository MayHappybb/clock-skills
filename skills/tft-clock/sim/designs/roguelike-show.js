// Roguelike: the hour. A red dragon 'D' slithers in from the left through
// the rock between the rooms (under the first digit, up the gap between the
// hours, over the second), stops between the two hour rooms and breathes:
// both rooms catch fire, the blaze running along their floors from the side
// it came in. Then it reaches the stair where the hero stands; they fight;
// it dies in a flash (the screen flips to reverse video for three frames, the
// display shakes a pixel), and its body turns to gold, head to tail.
// The dragon only ever occupies rock outside the rooms, so the time reads
// through all of it: the walls stay, lit white by the fire.
import { hash, rand } from '../js/kit.js';
import { COLS, ROWS, FLOOR } from './roguelike-level.js';
import { SCALE, BURN0, SHADES, code } from './roguelike-font.js';

// the dragon's track, head first along it: row 11 under D0, up column 9, along row 0 over D1, down column 18
const TRACK = [];
for (let x = -16; x <= 9; x++) TRACK.push([x, 11]);
for (let y = 10; y >= 0; y--) TRACK.push([9, y]);
for (let x = 10; x <= 18; x++) TRACK.push([x, 0]);
for (let y = 1; y <= 3; y++) TRACK.push([18, y]);
const ENTRY = 16, LEN = 15, BREATH_AT = ENTRY + 10 + 5;     // head beside the hour rooms, halfway up the gap
const HEAD_END = TRACK.length - 1;
const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export const SHOW_END = 11;
export const KILL_T = 6.2, BREATH_T = 3.1;

/** Where the head is along the track at second s of the hour minute (a fractional index). */
function headAt(s) {
  if (s < 1.5) return -1;
  if (s < 3.0) return ENTRY - 1 + (BREATH_AT - ENTRY + 1) * sm((s - 1.5) / 1.5);
  if (s < 3.7) return BREATH_AT;
  return BREATH_AT + (HEAD_END - BREATH_AT) * sm((s - 3.7) / 1.1);
}

const FIRE = new Map();
/** Per room: walking distance of each floor cell from the side the breath comes in. */
function fireDist(r) {
  let d = FIRE.get(r);
  if (d) return d;
  const [hx, hy] = TRACK[BREATH_AT];
  const fi = new Map(r.floor.map((c, n) => [c[1] * COLS + c[0], n]));
  let s0 = 0, best = 1e9;
  r.floor.forEach(([x, y], n) => { const e = (x - hx) ** 2 + (y - hy) ** 2 * 2; if (e < best) { best = e; s0 = n; } });
  d = new Int8Array(r.floor.length).fill(-1);
  const q = [s0]; d[s0] = 0;
  for (let h = 0; h < q.length; h++) {
    const [x, y] = r.floor[q[h]];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const m = fi.get((y + dy) * COLS + x + dx);
      if (m !== undefined && d[m] < 0) { d[m] = d[q[h]] + 1; q.push(m); }
    }
  }
  FIRE.set(r, d);
  if (FIRE.size > 8) FIRE.delete(FIRE.keys().next().value);
  return d;
}

/** Light from the blaze, into LV (before the map is drawn). */
export function hourLight(L, s, LV) {
  if (s < BREATH_T || s > BREATH_T + 3.5) return;
  for (const r of L.rooms.slice(0, 2)) {
    const d = fireDist(r);
    for (let n = 0; n < r.floor.length; n++) {
      const t = s - BREATH_T - d[n] / 14;
      if (t < 0 || t > 2.2) continue;
      const c = r.floor[n][1] * COLS + r.floor[n][0];
      LV[c] = 4;
    }
  }
}

/** The blaze, the dragon and its gold, over the cell screen (after the map). */
export function hourDraw(L, s, GL, FG, frameNo) {
  // the blaze in the hour rooms
  if (s >= BREATH_T && s < BREATH_T + 3.5) for (const r of L.rooms.slice(0, 2)) {
    const d = fireDist(r);
    for (let n = 0; n < r.floor.length; n++) {
      const t = s - BREATH_T - d[n] / 14;
      if (t < 0 || t > 2.2) continue;
      const c = r.floor[n][1] * COLS + r.floor[n][0];
      const h = hash(frameNo >> 2, c);
      if (t < 1.5) { GL[c] = BURN0 + (h % 3); FG[c] = t < 0.25 ? 15 : [14, 12, 14, 4][(h >> 3) & 3]; }
      else { GL[c] = SHADES[t < 1.9 ? 2 : 1]; FG[c] = 4; }
    }
  }
  // the dragon
  const hd = headAt(s);
  if (hd >= 0 && s < KILL_T) {
    const hi = Math.floor(hd);
    for (let k = LEN - 1; k >= 0; k--) {
      const ti = hi - k;
      if (ti < 0) continue;
      const [x, y] = TRACK[ti];
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
      const c = y * COLS + x;
      if (k === 0) { GL[c] = code('D'); FG[c] = 12; }
      else if (k >= LEN - 3) { GL[c] = SHADES[LEN - k]; FG[c] = 4; }
      else { GL[c] = SCALE; FG[c] = (k + (frameNo >> 3)) % 4 === 0 ? 14 : k & 1 ? 4 : 12; }
    }
    // its breath: flame licking out of the gap at the hour rooms; at the stair, at the hero
    const br = (s >= BREATH_T - 0.1 && s < 3.7) || (s > 5.0 && s < 5.6);
    if (br) {
      const [hx, hy] = TRACK[hi];
      for (const [dx, dy] of [[0, -1], [0, -2], [0, 1]]) {
        const x = hx + dx, y = hy + dy;
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS || L.kind[y * COLS + x] === FLOOR) continue;
        const c = y * COLS + x;
        GL[c] = BURN0 + ((frameNo >> 2) + dy + 3) % 3; FG[c] = (frameNo >> 1) & 1 ? 14 : 12;
      }
    }
  }
  // the death blast: a ring of fire runs out from the stair through all the open rock (never into a
  // counter), so for a moment every room stands black-and-white against flame
  const tb = s - KILL_T;
  if (tb > 0 && tb < 0.9) {
    const R = tb * 70, [sx, sy] = TRACK[HEAD_END];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const c = y * COLS + x;
      if (!L.out[c] || L.kind[c]) continue;
      const dx = (x - sx) * 0.67, dy = y - sy, d = Math.sqrt(dx * dx + dy * dy), u = R - d;
      if (u < 0 || u > 5) continue;
      const k = u < 1.5 ? 3 : u < 4 ? 2 : 1;
      GL[c] = SHADES[k]; FG[c] = k === 3 ? 14 : u < 2.5 ? 12 : 4;
    }
  }
  // dead: the body turns to gold from the head back, and the gold is gathered up
  if (s >= KILL_T && s < SHOW_END) {
    const hi = HEAD_END, run = (s - KILL_T) * 24;
    for (let k = 0; k < LEN; k++) {
      const ti = hi - k;
      const [x, y] = TRACK[ti];
      if (x < 0) continue;
      const c = y * COLS + x;
      const gone = 8.6 + rand(ti, 5) * 1.8;
      if (s > gone + 0.3) continue;
      if (k > run) { GL[c] = SCALE; FG[c] = 4; continue; }
      GL[c] = s > gone ? SHADES[1] : k > run - 2 ? code('*') : code('$');
      FG[c] = k > run - 2 ? 15 : (hash(frameNo >> 3, ti) % 7 === 0 ? 15 : 14);
    }
  }
}

/** The messages of the hour, overriding the hero's. */
export function hourMsg(s) {
  if (s < 1.0) return null;
  if (s < 2.9) return [1.0, 'You hear a deafening roar!'];
  if (s < 4.8) return [BREATH_T, 'The red dragon breathes fire!'];
  if (s < 5.6) return [4.8, 'You hit the red dragon! It bites!'];
  if (s < 8.2) return [KILL_T, 'You kill the red dragon!'];
  if (s < SHOW_END) return [8.2, 'You see here a great deal of gold.'];
  return null;
}

/** The kill flash (reverse video) and the shake (smooth-scroll registers), in pixels. */
export function hourShake(s, frameNo) {
  const roar = s > 1.0 && s < 1.5, kill = s > KILL_T && s < KILL_T + 0.4;
  if (!roar && !kill) return 0;
  return (frameNo >> 1) & 1 ? 1 : -1;
}
export const hourFlash = (s) => s >= KILL_T && s < KILL_T + 0.05;
