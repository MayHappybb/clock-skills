// Render a design to PNG (or a GIF, or a contact sheet) through headless Chrome.
//
//   node tools/render.mjs <design> [options]
//
//   --out <path>      output file: the png, or with --gif the gif (else --sheet's png)
//   --t <seconds>     animation time (default 0)
//   --clock HH:MM:SS  wall clock shown at t=0 (default 10:09:30)
//   --colour <c>      emission colour: white | blue | yellow | green | yellow-blue
//   --module <key>    run on a different module (see --modules)
//   --bus <name>      i2c100 | i2c400 | i2c1000 | spi4 | spi8 | spi10
//   --fps <n>         send frames at this rate instead of the design's own
//   --night <m>       night dimming: auto (default, by the clock) | off | on
//   --px <n>          screen pixels per OLED pixel (default 6)
//   --scale <n>       or: screen pixels per millimetre (overrides --px)
//   --style <s>       photo (default) | clean
//   --crop <c>        view (default: the active area) | glass | body (the whole module)
//   --tear            show one panel refresh while the frame is still on the
//                     bus, instead of the settled frame
//   --frames <n>      render n frames spanning --duration seconds
//   --duration <s>    span for --frames (default 4)
//   --gif             assemble the frames into out/<design>.gif (needs ffmpeg or ImageMagick)
//   --sheet           tile the frames into out/<design>-sheet.png, read left
//                     to right then down (cols with --cols, default 2)
//   --list            list designs;  --modules  list modules
//
// All frames of a run are drawn in one page load and captured in one
// screenshot, then cut apart, so a 40-frame GIF costs one browser launch.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, stat, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, basename, delimiter, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listen } from './serve.mjs';
import { decodePNG, cropDecoded, tilePNG } from './png.mjs';
import { canvasSize } from '../sim/js/panel.js';
import { MODULES } from '../sim/js/modules.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function findTool(envVar, candidates) {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const locate = (c) => {
    if (isAbsolute(c)) return existsSync(c) ? c : null;
    for (const d of dirs) if (existsSync(join(d, c))) return join(d, c);
    return null;
  };
  if (process.env[envVar]) {
    const found = locate(process.env[envVar]);
    if (found) return found;
    console.error(`${envVar}=${process.env[envVar]} was not found; ignoring it.`);
  }
  for (const c of candidates) { const f = locate(c); if (f) return f; }
  return null;
}

// Set CHROME=/path/to/chrome if yours lives somewhere else.
const CHROME = findTool('CHROME', [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'msedge',
]);
const MAGICK = findTool('MAGICK', ['magick']);
const FFMPEG = findTool('FFMPEG', ['ffmpeg']);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (['gif', 'list', 'sheet', 'tear', 'modules'].includes(key)) out[key] = true;
      else out[key] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const { default: DESIGNS } = await import('../sim/designs/index.js');

if (args.list) {
  for (const [k, d] of Object.entries(DESIGNS))
    console.log(`${k.padEnd(14)} ${(d.module ?? '096-128x64').padEnd(12)} ${d.name.padEnd(16)} ${d.blurb ?? ''}`);
  process.exit(0);
}
if (args.modules) {
  for (const [k, m] of Object.entries(MODULES))
    console.log(`${k.padEnd(12)} ${m.label.padEnd(34)} colours: ${m.colours.join(', ')}`);
  process.exit(0);
}

const design = args._[0];
if (!design || !DESIGNS[design]) {
  console.error(design ? `unknown design '${design}'; --list shows them` : 'usage: node tools/render.mjs <design> [options]  (--list)');
  process.exit(2);
}
if (!CHROME) {
  console.error('render.mjs needs Chrome, Chromium or Edge. Set CHROME=/path/to/browser,\n' +
    'or use `node tools/frame.mjs` for text frames without one.');
  process.exit(1);
}

const { moduleOf } = await import('../sim/js/player.js');
const mod = moduleOf(DESIGNS[design], args.module, args.bus);
const crop = args.crop ?? 'view';
const scale = args.scale ? Number(args.scale) : Number(args.px ?? 6) / mod.pitch.x;
const colour = args.colour ?? DESIGNS[design].colour ?? mod.colours[0];
const { width, height } = canvasSize(mod, { scale, crop, colour });

const n = args.frames ? Number(args.frames) : 1;
const duration = Number(args.duration ?? 4);
const t0 = Number(args.t ?? 0);
const times = Array.from({ length: n }, (_, i) => (n === 1 ? t0 : t0 + (i / n) * duration));

// Lay the frames out in a grid that headless Chrome can screenshot in one go.
// Each screenshot is decoded in full (4 bytes a pixel), so its size sets the
// tool's peak memory: 4096 square is about 64 MB.
const MAX_SIDE = 4096;
const perRow = Math.max(1, Math.min(n, Math.floor(MAX_SIDE / width)));
const perPage = perRow * Math.max(1, Math.floor(MAX_SIDE / height));

async function waitForFile(path, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    try {
      const { size } = await stat(path);
      if (size > 0 && size === last) return true;
      last = size;
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function screenshot(url, outPath, w, h, profile) {
  const common = [
    '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${Math.max(w, 1024)},${Math.max(h, 768)}`,
    '--virtual-time-budget=20000', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', `--screenshot=${outPath}`, url,
  ];
  for (const mode of ['--headless=new', '--headless']) {
    await rm(outPath, { force: true });
    const child = spawn(CHROME, [mode, ...common], { stdio: 'ignore' });
    const ok = await waitForFile(outPath);
    child.kill('SIGKILL');
    if (ok) return true;
  }
  return false;
}

function pageUrl(port, ts) {
  const q = new URLSearchParams({ design, capture: '1', scale: String(scale), crop, style: args.style ?? 'photo',
    times: ts.join(','), perRow: String(perRow) });
  for (const k of ['clock', 'colour', 'bus', 'module', 'fps', 'night']) if (args[k]) q.set(k, args[k]);
  if (args.tear) q.set('tear', '1');
  return `http://127.0.0.1:${port}/sim/index.html?${q}`;
}

function run(cmd, argv) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, argv, { stdio: 'inherit' });
    p.on('close', (c) => (c === 0 ? ok() : fail(new Error(`${basename(cmd)} exited ${c}`))));
  });
}

const { server, port } = await listen(0);
const profile = await mkdtemp(join(tmpdir(), 'chrome-oled-'));
await mkdir(join(ROOT, 'out'), { recursive: true });

try {
  const frames = [];
  for (let p = 0; p < times.length; p += perPage) {
    const ts = times.slice(p, p + perPage);
    const cols = Math.min(perRow, ts.length), rows = Math.ceil(ts.length / perRow);
    const shot = join(profile, 'shot.png');
    if (!(await screenshot(pageUrl(port, ts), shot, cols * width, rows * height, profile))) throw new Error('render failed: Chrome wrote no screenshot');
    const img = decodePNG(await readFile(shot));   // once per screenshot, not once per frame
    ts.forEach((_, i) => frames.push(cropDecoded(img, (i % perRow) * width, Math.floor(i / perRow) * height, width, height)));
  }

  if (n === 1) {
    const out = resolve(args.out ?? join(ROOT, 'out', `${design}.png`));
    await writeFile(out, frames[0]);
    console.log(`${basename(out)}  ${width}x${height}  (${design} @ t=${t0}s, ${mod.label})`);
  } else {
    const dir = resolve(join(ROOT, 'out', design));
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < frames.length; i++) await writeFile(join(dir, `f${String(i).padStart(3, '0')}.png`), frames[i]);
    console.log(`frames -> ${dir} (${frames.length})`);
    if (args.sheet) {
      const sheet = resolve(args.out && !args.gif ? args.out : join(ROOT, 'out', `${design}-sheet.png`));
      await writeFile(sheet, tilePNG(frames, width, height, Number(args.cols ?? 2), 6, [40, 40, 46]));
      console.log(`sheet -> ${sheet}`);
    }
    if (args.gif) {
      const gif = resolve(args.out ? args.out.replace(/\.png$/i, '.gif') : join(ROOT, 'out', `${design}.gif`));
      const fps = n / duration;
      // GIF delays are whole hundredths of a second, and browsers slow any
      // delay under 2 to 10: so 50 fps is the fastest a GIF really plays.
      if (fps > 50) console.error(`note: ${fps.toFixed(0)} fps is faster than a GIF can play (50 max); use --frames ${Math.round(duration * 50)} for --duration ${duration}`);
      if (FFMPEG) {
        await run(FFMPEG, ['-loglevel', 'error', '-y', '-framerate', String(fps), '-i', join(dir, 'f%03d.png'),
          '-vf', 'split[a][b];[a]palettegen=reserve_transparent=0[p];[b][p]paletteuse=dither=none', '-loop', '0', gif]);
      } else if (MAGICK) {
        await run(MAGICK, ['-delay', String(Math.round(100 / fps)), '-loop', '0', join(dir, 'f*.png'), '-layers', 'Optimize', gif]);
      } else throw new Error('--gif needs ffmpeg or ImageMagick on PATH');
      console.log(`gif -> ${gif}`);
    }
  }
} finally {
  server.close();
  await rm(profile, { recursive: true, force: true });
}
