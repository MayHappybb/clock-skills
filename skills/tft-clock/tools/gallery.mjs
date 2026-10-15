// Stills of several designs, tiled into one image.
//
//   node tools/gallery.mjs [key,key,...] [--clock HH:MM:SS] [--px n] [--cols n] [--out path]
//
// Default: every design that is not a utility, at 10:09:30.

import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, renderOne } from './render.mjs';
import { encodePNG, tilePNG } from './png.mjs';
import { DESIGNS } from '../sim/js/player.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = parseArgs(process.argv.slice(2));
const keys = args._[0] ? args._[0].split(',') : Object.keys(DESIGNS).filter((k) => !DESIGNS[k].utility);
for (const k of keys) if (!DESIGNS[k]) { console.error(`unknown design '${k}'`); process.exit(2); }
const frames = keys.map((k) => renderOne(k, { clock: args.clock, px: args.px ?? 3, style: args.style }));
const { width, height } = frames[0];
await mkdir(join(ROOT, 'out'), { recursive: true });
const out = resolve(args.out ?? join(ROOT, 'out', 'gallery.png'));
await writeFile(out, tilePNG(frames.map((f) => encodePNG(f.width, f.height, f.rgba)), width, height, Number(args.cols ?? 2), 6, [40, 40, 46]));
console.log(`gallery -> ${out}  (${keys.join(', ')})`);
