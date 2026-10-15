// scratch: render the round-11 faces to stills and tile them.
// node round11-sheet.mjs
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tilePNG, decodePNG } from './tools/png.mjs';

const KEYS = ['ouroboros', 'glassblower', 'cloudchamber', 'mobile', 'octopus', 'acrobats', 'popcorn', 'eightball'];
const run = (args) => new Promise((res, rej) => {
  const p = spawn('node', ['tools/render.mjs', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err += d; });
  p.on('close', (c) => (c === 0 ? res() : rej(new Error(err))));
});
await mkdir('out/_g11', { recursive: true });
const bufs = [];
for (const key of KEYS) {
  const out = `out/_g11/${key}.png`;
  try { await run([key, '--clock', '10:09:30', '--px', '4', '--style', 'clean', '--crop', 'view', '--out', out]); bufs.push(await readFile(out)); console.log('ok', key); }
  catch (e) { console.error('fail', key, e.message.split('\n')[0]); }
}
const { width, height } = decodePNG(bufs[0]);
await writeFile('out/gallery-round11.png', tilePNG(bufs, width, height, 4, 6, [40, 40, 46]));
console.log(`sheet -> out/gallery-round11.png`);
