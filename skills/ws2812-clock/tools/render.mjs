// Render a design to PNG, a contact sheet or a GIF. Pure Node: no browser.
//
//   node tools/render.mjs <design> [options]
//
//   --layout <key>    assembly (default: the design's first); --layouts lists them
//   --t <s>           animation time (default 0)
//   --clock HH:MM:SS  wall clock at t = 0 (default 10:09:30)
//   --frames <n>      n frames over --duration seconds (default 4)
//   --clocks a,b,...  one frame at each wall clock (HH:MM:SS), as a sheet: e.g. a
//                     digits sheet. Each frame is rendered on its own (cold start)
//   --sheet           tile the frames into out/<design>-sheet.png (--cols, default 3)
//   --gif             frames to out/<design>.gif (needs ffmpeg); 50 fps is a GIF's limit
//   --scale <px/mm>   default: about 900 px across, at most 14 px/mm
//   --look <l>        bare | smoke | opal  (default: the design's)
//   --gap <mm>        opal diffuser distance (default: the design's, else 8)
//   --room <r>        dark (default) | lit
//   --night <m>       auto (default, by the clock) | off | on
//   --exposure <x>    camera exposure (default 1)
//   --out <path>      output file
//   --list            list designs
//
// Every frame is computed in order, so stateful designs are run, not guessed.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG, tilePNG } from './png.mjs';
import { runner, DESIGNS, LAYOUTS, layoutFor } from '../sim/js/player.js';
import { renderFrame, frameSize } from '../sim/js/render.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function parseArgs(argv, flags = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); if (flags.includes(k)) out[k] = true; else out[k] = argv[++i]; }
    else out._.push(a);
  }
  return out;
}

function ffmpeg() {
  if (process.env.FFMPEG && existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  for (const d of (process.env.PATH ?? '').split(delimiter)) if (d && existsSync(join(d, 'ffmpeg'))) return join(d, 'ffmpeg');
  return null;
}

const run = (cmd, argv) => new Promise((ok, fail) => {
  const p = spawn(cmd, argv, { stdio: 'inherit' });
  p.on('close', (c) => (c === 0 ? ok() : fail(new Error(`${cmd} exited ${c}`))));
});

/** Options shared by render.mjs and the live view: what the design asks for, overridden by args. */
export function lookOf(design, args) {
  const look = typeof design.look === 'object' ? design.look : { look: design.look ?? 'bare' };
  return {
    look: args.look ?? look.look ?? 'bare',
    gap: Number(args.gap ?? look.gap ?? 8),
    room: args.room ?? 'dark',
    exposure: Number(args.exposure ?? look.exposure ?? 1),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2), ['gif', 'sheet', 'list', 'layouts']);
  if (args.list) {
    for (const [k, d] of Object.entries(DESIGNS)) console.log(`${k.padEnd(12)} ${(d.layouts ?? ['*']).join(',').padEnd(16)} ${d.name}: ${d.blurb ?? ''}`);
    process.exit(0);
  }
  if (args.layouts) {
    for (const [k, v] of Object.entries(LAYOUTS)) console.log(`${k.padEnd(12)} ${v.label}`);
    process.exit(0);
  }
  const key = args._[0];
  const design = DESIGNS[key];
  if (!design) { console.error(key ? `unknown design '${key}'; --list shows them` : 'usage: node tools/render.mjs <design> [options]'); process.exit(2); }

  const L = layoutFor(design, args.layout);
  const ok = design.layouts ?? ['*'];
  if (!ok.includes('*') && !ok.includes(L.key)) console.error(`note: ${key} is drawn for ${ok.join(', ')}, not ${L.key}`);
  const look = lookOf(design, args);
  const scale = Number(args.scale ?? Math.min(14, 900 / Math.max(L.bbox.w + 8, L.bbox.h + 8)));
  const opts = { ...look, scale };
  const { width, height } = frameSize(L, opts);

  const clocks = args.clocks ? String(args.clocks).split(',') : null;
  const n = clocks ? clocks.length : Number(args.frames ?? 1), duration = Number(args.duration ?? 4), t0 = Number(args.t ?? 0);
  const r = runner(design, { layout: L.key, clock: args.clock, night: args.night });
  const times = Array.from({ length: n }, (_, i) => (n === 1 ? t0 : t0 + (i / n) * duration));
  const pngs = [];
  let maxA = 0;
  for (let k = 0; k < n; k++) {
    // the runner steps through the frames in between, so state evolves as live
    const f = clocks ? runner(design, { layout: L.key, clock: clocks[k], night: args.night }).at(t0) : r.at(times[k]);
    maxA = Math.max(maxA, f.amps);
    const img = renderFrame(L, f.duty, opts);
    pngs.push(encodePNG(img.width, img.height, img.rgba));
  }
  await mkdir(join(ROOT, 'out'), { recursive: true });
  const info = `${L.label}, ${L.n} LEDs, peak ${maxA.toFixed(2)} A`;
  if (n === 1) {
    const out = resolve(args.out ?? join(ROOT, 'out', `${key}${args.layout ? '-' + L.key : ''}.png`));
    await writeFile(out, pngs[0]);
    console.log(`${out}  ${width}x${height}  (${info})`);
  } else {
    const stem = `${key}${args.layout ? '-' + L.key : ''}`;
    if (args.sheet || clocks || !args.gif) {
      const out = resolve(args.out && !args.gif ? args.out : join(ROOT, 'out', `${stem}-sheet.png`));
      await writeFile(out, tilePNG(pngs, width, height, Number(args.cols ?? 3), 6, [40, 40, 46]));
      console.log(`sheet -> ${out}  (${info})`);
    }
    if (args.gif) {
      const ff = ffmpeg();
      if (!ff) throw new Error('--gif needs ffmpeg on PATH (or FFMPEG=/path)');
      const dir = join(ROOT, 'out', stem);
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
      for (let i = 0; i < pngs.length; i++) await writeFile(join(dir, `f${String(i).padStart(4, '0')}.png`), pngs[i]);
      const gfps = n / duration;
      if (gfps > 50) console.error(`note: ${gfps.toFixed(0)} fps is faster than a GIF plays (50 max)`);
      const gif = resolve(args.out ? args.out.replace(/\.png$/i, '.gif') : join(ROOT, 'out', `${stem}.gif`));
      await run(ff, ['-loglevel', 'error', '-y', '-framerate', String(gfps), '-i', join(dir, 'f%04d.png'),
        '-vf', 'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a', '-loop', '0', gif]);
      await rm(dir, { recursive: true, force: true });
      console.log(`gif -> ${gif}  (${info})`);
    }
  }
}
