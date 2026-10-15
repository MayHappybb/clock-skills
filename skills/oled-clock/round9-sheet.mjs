// scratch: render the round-9 pure animations to stills and tile them.
// node round9-sheet.mjs
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tilePNG, decodePNG } from './tools/png.mjs';

const KEYS = ['mandelbrot', 'attractor', 'flow', 'nebula'];
const run = (args) => new Promise((res, rej) => {
  const p = spawn('node', ['tools/render.mjs', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err += d; });
  p.on('close', (c) => (c === 0 ? res() : rej(new Error(err))));
});
await mkdir('out/_g9', { recursive: true });
const bufs = [];
for (const key of KEYS) {
  const out = `out/_g9/${key}.png`;
  try { await run([key, '--t', '2', '--px', '4', '--style', 'clean', '--crop', 'view', '--out', out]); bufs.push(await readFile(out)); console.log('ok', key); }
  catch (e) { console.error('fail', key, e.message.split('\n')[0]); }
}
const { width, height } = decodePNG(bufs[0]);
await writeFile('out/gallery-round9.png', tilePNG(bufs, width, height, 2, 6, [40, 40, 46]));
console.log(`sheet -> out/gallery-round9.png`);
