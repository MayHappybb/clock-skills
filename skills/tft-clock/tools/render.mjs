// Render a design to PNG, a contact sheet or a GIF. Pure Node, no browser.
//
//   node tools/render.mjs <design> [options]
//
//   --t <s>           animation time (default 0)
//   --clock HH:MM:SS  wall clock at t = 0 (default 10:09:30)
//   --frames <n>      n frames over --duration seconds (default 4)
//   --clocks a,b,...  one frame at each wall clock, as a sheet (a digits sheet)
//   --sheet           tile the frames into out/<design>-sheet.png (--cols, default 2)
//   --gif             frames to out/<design>.gif (needs ffmpeg); 50 fps is a GIF's limit
//   --px <n>          screen pixels per glass pixel (default 6)
//   --scale <px/mm>   or: screen pixels per millimetre (4 is about true size on a monitor)
//   --style <s>       photo (default: stripes, black level, backlight) | clean (flat pixels, exact colours)
//   --crop <c>        view (default: the active area) | glass | body (the board)
//   --room <r>        dark (default) | lit
//   --night <m>       auto (default, by the clock) | off | on
//   --tear            show one panel refresh while the frame is still on the bus
//   --no-smear        the settled frame, without the liquid crystal's lag
//   --fps <n>         send frames at this rate instead of the design's
//   --bus <b>         spi15 | spi20 | spi27 | spi40
//   --module <key>    another module (--modules lists them)
//   --out <path>      output file
//   --list            list designs

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve, delimiter, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG, tilePNG } from './png.mjs';
import { DESIGNS, MODULES, glassAt, moduleOf, fpsOf, dateFor } from '../sim/js/player.js';
import { paintGlass } from '../sim/js/panel.js';

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

/** Render one frame of `key` to { width, height, rgba }. Shared with the gallery. */
export function renderOne(key, o) {
  const design = DESIGNS[key];
  const mod = moduleOf(design, o.module);
  const scale = o.scale ? Number(o.scale) : Number(o.px ?? 6) / mod.pitch;
  const fps = fpsOf(design, o.fps);
  const t = Number(o.t ?? 0);
  const g = glassAt(key, {
    t, clock: o.clock, date: o.date, fps: o.fps, bus: o.bus, module: o.module, night: o.night,
    tear: !!o.tear, smear: !o['no-smear'],
  });
  void fps;
  return paintGlass(mod, g.levels, { scale, style: o.style ?? 'photo', crop: o.crop ?? 'view', backlight: g.backlight, room: o.room });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2), ['sheet', 'gif', 'list', 'modules', 'tear', 'no-smear']);
  if (args.list) {
    for (const [k, d] of Object.entries(DESIGNS)) console.log(`${k.padEnd(14)} ${String(d.fps ?? 30).padStart(3)} fps  ${d.name.padEnd(16)} ${d.blurb ?? ''}`);
    process.exit(0);
  }
  if (args.modules) {
    for (const [k, m] of Object.entries(MODULES)) console.log(`${k.padEnd(14)} ${m.label}`);
    process.exit(0);
  }
  const key = args._[0];
  if (!key || !DESIGNS[key]) {
    console.error(key ? `unknown design '${key}'; --list shows them` : 'usage: node tools/render.mjs <design> [options]  (--list)');
    process.exit(2);
  }
  await mkdir(join(ROOT, 'out'), { recursive: true });

  let jobs;
  if (args.clocks) jobs = args.clocks.split(',').map((c) => ({ clock: c, t: 0 }));
  else {
    const n = Number(args.frames ?? 1), dur = Number(args.duration ?? 4), t0 = Number(args.t ?? 0);
    jobs = Array.from({ length: n }, (_, i) => ({ clock: args.clock, t: n === 1 ? t0 : t0 + (i / n) * dur }));
  }
  const frames = jobs.map((j) => renderOne(key, { ...args, ...j }));
  const { width, height } = frames[0];
  const pngs = frames.map((f) => encodePNG(f.width, f.height, f.rgba));
  const label = MODULES[DESIGNS[key].module ?? 'air101-lcd']?.label;

  if (pngs.length === 1) {
    const out = resolve(args.out ?? join(ROOT, 'out', `${key}.png`));
    await writeFile(out, pngs[0]);
    const at = dateFor(args.clock ?? '10:09:30', Number(args.t ?? 0)).toTimeString().slice(0, 8);
    console.log(`${basename(out)}  ${width}x${height}  (${key} at ${at}, ${label})`);
  } else {
    const dir = join(ROOT, 'out', key);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < pngs.length; i++) await writeFile(join(dir, `f${String(i).padStart(3, '0')}.png`), pngs[i]);
    if (args.sheet || args.clocks) {
      const sheet = resolve(args.out && !args.gif ? args.out : join(ROOT, 'out', `${key}-sheet.png`));
      await writeFile(sheet, tilePNG(pngs, width, height, Number(args.cols ?? 2), 6, [40, 40, 46]));
      console.log(`sheet -> ${sheet}  (${pngs.length} frames)`);
    }
    if (args.gif) {
      const ff = ffmpeg();
      if (!ff) throw new Error('--gif needs ffmpeg on PATH (or FFMPEG=/path)');
      const fps = jobs.length / Number(args.duration ?? 4);
      if (fps > 50) console.error(`note: ${fps.toFixed(0)} fps is faster than a GIF can play (50 max)`);
      const gif = resolve(args.out ? args.out.replace(/\.png$/i, '.gif') : join(ROOT, 'out', `${key}.gif`));
      await run(ff, ['-loglevel', 'error', '-y', '-framerate', String(fps), '-i', join(dir, 'f%03d.png'),
        '-vf', 'split[a][b];[a]palettegen=reserve_transparent=0:stats_mode=full[p];[b][p]paletteuse=dither=none', '-loop', '0', gif]);
      console.log(`gif -> ${gif}`);
    }
    if (!args.sheet && !args.gif && !args.clocks) console.log(`frames -> ${dir} (${pngs.length})`);
  }
}
