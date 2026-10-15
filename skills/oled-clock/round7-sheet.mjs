// scratch: render each round-7 design to a clean still at a fixed size and
// tile them into out/gallery-round7.png.  node round7-sheet.mjs
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tilePNG, decodePNG } from './tools/png.mjs';

const KEYS = [
  'soroban', 'sliderule', 'spiderweb', 'dandelion', 'vault', 'pinball',
  'clepsydra', 'cuckoo', 'press', 'turntable', 'constellation', 'aurora',
  'goban', 'morse', 'honeycomb', 'zen', 'fireworks', 'ferris',
  'locomotive', 'potter',
];

const run = (args) => new Promise((res, rej) => {
  const p = spawn('node', ['tools/render.mjs', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  p.on('close', (c) => (c === 0 ? res() : rej(new Error(`${args.join(' ')}: ${err}`))));
});

await mkdir('out/_g7', { recursive: true });
const bufs = [];
for (const key of KEYS) {
  const out = `out/_g7/${key}.png`;
  try {
    await run([key, '--px', '3', '--style', 'clean', '--crop', 'view', '--out', out]);
    bufs.push(await readFile(out));
    console.log('ok', key);
  } catch (e) {
    console.error('fail', key, e.message.split('\n')[0]);
  }
}
const { width, height } = decodePNG(bufs[0]);
const sheet = tilePNG(bufs, width, height, 5, 6, [40, 40, 46]);
await writeFile('out/gallery-round7.png', sheet);
console.log(`sheet -> out/gallery-round7.png (${bufs.length}/${KEYS.length} tiles)`);
