// Binary check for round 8: is every frame exactly two colours, the same two all day?
//
//   cd .claude/skills/tft-clock && node ../../../prompts/round8/binary.mjs <design> [HH:MM:SS ...]
//
// Samples rest, night, the night fades, and dense runs across a minute turn,
// an hour turn and midnight (about 150 frames), plus any clocks given. PASS
// when the stored RGB565 values over every sample are at most two: one ink,
// one ground, like a 1-bit 12864 module.

import { buildFrame } from '../../.claude/skills/tft-clock/sim/js/player.js';
import { from565, hexOf } from '../../.claude/skills/tft-clock/sim/js/color.js';

const key = process.argv[2];
if (!key) { console.error('usage: node binary.mjs <design> [HH:MM:SS ...]'); process.exit(2); }

const pad = (n) => String(n).padStart(2, '0');
function run(h, m, s, n, step) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = h * 3600 + m * 60 + s + i * step;
    const d = ((t % 86400) + 86400) % 86400;
    const ss = d % 60;
    out.push(`${pad(Math.floor(d / 3600))}:${pad(Math.floor(d / 60) % 60)}:${ss < 10 ? '0' : ''}${ss.toFixed(2)}`);
  }
  return out;
}
const times = [
  '10:09:30', '10:09:05', '10:09:55', '02:47:30', '12:00:30', '18:05:30',
  '22:59:30', '23:00:30', '06:59:30', '07:00:30',
  ...run(10, 9, 58, 40, 0.1),
  ...run(10, 59, 57, 40, 0.25),
  ...run(23, 59, 58, 30, 0.2),
  ...process.argv.slice(3),
];

const total = new Map();
let worst = { n: 0, at: '' };
for (const clock of times) {
  const b = buildFrame(key, { t: 0, clock });
  const seen = new Set();
  for (const v of b.canvas.buf) { seen.add(v); total.set(v, (total.get(v) ?? 0) + 1); }
  if (seen.size > worst.n) worst = { n: seen.size, at: clock };
}
const list = [...total].sort((a, b) => b[1] - a[1]);
const sum = list.reduce((s, [, n]) => s + n, 0);
console.log(`${key}: ${times.length} frames sampled; ${list.length} distinct colours overall; most in one frame: ${worst.n} (at ${worst.at})`);
for (const [v, n] of list.slice(0, 6)) console.log(`  ${hexOf(from565(v))}  ${((n / sum) * 100).toFixed(2)}%`);
if (list.length > 6) console.log(`  ... ${list.length - 6} more`);
const ok = list.length <= 2;
console.log(`${ok ? 'PASS' : 'FAIL'}: ${ok ? 'binary, one ink and one ground' : 'more than two colours: every pixel must be ink or ground'}`);
process.exit(ok ? 0 : 1);
