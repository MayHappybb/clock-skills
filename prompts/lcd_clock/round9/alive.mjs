// Motion meter for round 9: how alive is a face BETWEEN minute turns?
//
//   cd .claude/skills/tft-clock && node ../../../prompts/round9/alive.mjs <design> [HH:MM:SS ...]
//
// For each start clock (default three rest moments, nowhere near a turn) it
// builds 60 consecutive frames (1 s at 60 fps) and reports:
//   frame   mean % of the glass that changes from one frame to the next
//   second  % of the glass that changes at least once in that second
//   ink     % of the INK of the time-strokes area that changes in that second:
//           pixels that are ink in at least one frame and not ink in another,
//           measured inside the box that holds the most stable ink (a proxy
//           for "do the digits themselves move", not just the background)
// The time at rest should read as alive: see the targets in the brief.

import { buildFrame } from '../../.claude/skills/tft-clock/sim/js/player.js';

const key = process.argv[2];
if (!key) { console.error('usage: node alive.mjs <design> [HH:MM:SS ...]'); process.exit(2); }
const starts = process.argv.length > 3 ? process.argv.slice(3) : ['10:09:20', '14:37:40', '21:52:10'];
const W = 160, H = 80, N = W * H;

function at(clock, k) {
  const [h, m, s] = clock.split(':').map(Number);
  const t = h * 3600 + m * 60 + s + k / 60;
  const ss = t % 60;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(t / 3600) % 24)}:${p(Math.floor(t / 60) % 60)}:${ss < 10 ? '0' : ''}${ss.toFixed(4)}`;
}

let sumF = 0, sumS = 0, sumI = 0;
for (const clock of starts) {
  const frames = [];
  for (let k = 0; k < 60; k++) frames.push(Uint16Array.from(buildFrame(key, { t: 0, clock: at(clock, k) }).canvas.buf));
  // the commonest value is taken as the ground; everything else is ink
  const count = new Map();
  for (const v of frames[0]) count.set(v, (count.get(v) ?? 0) + 1);
  const ground = [...count].sort((a, b) => b[1] - a[1])[0][0];
  let changedF = 0;
  const everChanged = new Uint8Array(N), inkSeen = new Uint8Array(N), groundSeen = new Uint8Array(N);
  for (let k = 0; k < 60; k++) {
    const f = frames[k];
    for (let i = 0; i < N; i++) {
      if (f[i] === ground) groundSeen[i] = 1; else inkSeen[i] = 1;
      if (k && f[i] !== frames[k - 1][i]) { changedF++; everChanged[i] = 1; }
    }
  }
  const frameP = (changedF / 59 / N) * 100;
  let ever = 0; for (let i = 0; i < N; i++) ever += everChanged[i];
  // the "time box": the central 2/3 of the glass, where faces put their numerals
  let ink = 0, inkMoving = 0;
  for (let y = 8; y < H - 8; y++) for (let x = 8; x < W - 8; x++) {
    const i = y * W + x;
    if (inkSeen[i]) { ink++; if (groundSeen[i]) inkMoving++; }
  }
  const secP = (ever / N) * 100, inkP = ink ? (inkMoving / ink) * 100 : 0;
  sumF += frameP; sumS += secP; sumI += inkP;
  console.log(`  ${clock}  frame ${frameP.toFixed(1).padStart(5)}%   second ${secP.toFixed(1).padStart(5)}%   ink ${inkP.toFixed(1).padStart(5)}%`);
}
const n = starts.length;
console.log(`${key}: mean frame ${(sumF / n).toFixed(1)}%  second ${(sumS / n).toFixed(1)}%  ink ${(sumI / n).toFixed(1)}%`);
