// Render a design to a PNG through headless Chrome.
//
//   node tools/render.mjs <design> [options]
//
//   --out <path>      output png (default out/<design>.png)
//   --t <seconds>     animation time (default 0)
//   --clock HH:MM:SS  wall clock shown at t=0 (default 10:09:30)
//   --preset <name>   green | blue | gray | amber
//   --bus <name>      i2c100 | i2c400 | parallel4 | parallel8   (affects the printed report)
//   --scale <n>       pixels per millimetre (default 16)
//   --style <s>       photo | clean
//   --crop <c>        body (with bezel) | view (just the glass)
//   --frames <n>      render n frames spanning --duration seconds
//   --duration <s>    animation span for --frames (default 4)
//   --gif             also assemble an animated gif (ImageMagick, or ffmpeg)
//   --sheet           also tile the frames into one contact sheet, read in
//                     time order left to right then down: out/<design>-sheet.png
//   --response <r>    liquid-crystal lag: typ (default) | max | off
//   --list            list available designs

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, stat, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, basename, delimiter, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listen } from './serve.mjs';
import { cropPNG } from './png.mjs';
import { MODULE } from '../sim/js/panel.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * First usable executable: the env override, then absolute candidates, then
 * bare names looked up on PATH. Returns null if none is found.
 */
function findTool(envVar, candidates) {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const locate = (c) => {
    if (isAbsolute(c)) return existsSync(c) ? c : null;
    for (const d of dirs) if (existsSync(join(d, c))) return join(d, c);
    return null;
  };
  const fromEnv = process.env[envVar];
  if (fromEnv) {
    const found = locate(fromEnv);
    if (!found) console.error(`${envVar}=${fromEnv} was not found; ignoring it.`);
    else return found;
  }
  for (const c of candidates) { const found = locate(c); if (found) return found; }
  return null;
}

// Set CHROME=/path/to/chrome if yours lives somewhere else.
const CHROME = findTool('CHROME', [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'msedge',
]);
// Either one is enough for --gif and --sheet. Stills need neither.
const MAGICK = findTool('MAGICK', ['magick']);
const FFMPEG = findTool('FFMPEG', ['ffmpeg']);

// ------------------------------------------------------------------- options

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (['gif', 'list', 'sheet'].includes(key)) out[key] = true;
      else out[key] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.list) {
  const { default: designs } = await import('../sim/designs/index.js');
  for (const [k, d] of Object.entries(designs)) console.log(`${k.padEnd(16)} ${d.name.padEnd(18)} ${d.blurb ?? ''}`);
  process.exit(0);
}

const design = args._[0];
if (!design) {
  console.error('usage: node tools/render.mjs <design> [--out path] [--t s] [--preset p] ...');
  process.exit(2);
}

const scale = Number(args.scale ?? 16);
const crop = args.crop ?? 'body';
const style = args.style ?? 'photo';
// A portrait design (`rotate: 90`) is captured turned, so its canvas is tall.
const { default: DESIGNS } = await import('../sim/designs/index.js');
const turned = DESIGNS[design]?.rotate === 90;

function canvasSize() {
  const w = Math.round((crop === 'view' ? MODULE.viewW : MODULE.bodyW) * scale);
  const h = Math.round((crop === 'view' ? MODULE.viewH : MODULE.bodyH) * scale);
  return turned ? { width: h, height: w } : { width: w, height: h };
}

// ------------------------------------------------------------------- capture

const { width, height } = canvasSize();

/** Resolve once `path` exists and has stopped growing, or the deadline passes. */
async function waitForFile(path, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    try {
      const { size } = await stat(path);
      if (size > 0 && size === last) return true;
      last = size;
    } catch { /* not written yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

// Headless Chrome mishandles small windows (some sizes come back blank), so
// capture in a window at least this big, with the canvas pinned top-left, and
// crop to the canvas afterwards.
const MIN_WINDOW = { width: 1024, height: 768 };

/** The image tool to use, or a clear failure saying what to install. */
function imageTool(why) {
  if (MAGICK || FFMPEG) return MAGICK ? 'magick' : 'ffmpeg';
  console.error(`${why} needs ImageMagick or ffmpeg on PATH (or set MAGICK / FFMPEG).`);
  process.exit(1);
}

/** Crop a full-window capture down to the canvas, in Node: no image tool needed. */
async function cropToCanvas(file) {
  if (width >= MIN_WINDOW.width && height >= MIN_WINDOW.height) return true;
  try {
    await writeFile(file, cropPNG(await readFile(file), width, height));
    return true;
  } catch (err) {
    console.error(`crop failed: ${err.message}`);
    return false;
  }
}

async function screenshot(url, outPath, profile) {
  const common = [
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${Math.max(width, MIN_WINDOW.width)},${Math.max(height, MIN_WINDOW.height)}`,
    '--virtual-time-budget=6000',
    `--user-data-dir=${profile}`,
    `--no-first-run`,
    '--no-default-browser-check',
    `--screenshot=${outPath}`,
    url,
  ];
  for (const mode of ['--headless=new', '--headless']) {
    await rm(outPath, { force: true });
    // Chrome writes the screenshot and then frequently sits in its event loop
    // instead of exiting, so watch for the file rather than for process exit.
    const child = spawn(CHROME, [mode, ...common], { stdio: ['ignore', 'ignore', 'ignore'] });
    const ok = await waitForFile(outPath);
    child.kill('SIGKILL');
    if (ok) return cropToCanvas(outPath);
  }
  return false;
}

function urlFor(p) {
  const q = new URLSearchParams({ design, capture: '1', scale: String(scale), crop, style, t: String(p.t),
    response: args.response ?? 'typ' });
  if (p.clock) q.set('clock', p.clock);
  if (p.preset) q.set('preset', p.preset);
  if (p.bus) q.set('bus', p.bus);
  return `http://127.0.0.1:${p.port}/sim/index.html?${q}`;
}

/** Stitch f000.png... into a looping gif with whichever tool is installed. */
function assembleGif(dir, fps, gif) {
  const [cmd, argv] = imageTool('--gif') === 'magick'
    ? [MAGICK, ['-delay', String(Math.round(100 / fps)), '-loop', '0', join(dir, 'f*.png'), '-layers', 'Optimize', gif]]
    : [FFMPEG, ['-loglevel', 'error', '-y', '-framerate', String(fps), '-i', join(dir, 'f%03d.png'),
        '-vf', 'split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=none', '-loop', '0', gif]];
  return new Promise((ok, fail) => {
    const p = spawn(cmd, argv, { stdio: 'inherit' });
    p.on('close', (c) => (c === 0 ? ok() : fail(new Error(`${basename(cmd)} exited ${c}`))));
  });
}

/** Tile f000.png... into a grid two frames wide, for reviewing a transition. */
function tileSheet(dir, n, sheet) {
  const cols = Math.min(2, n), rows = Math.ceil(n / cols);
  const [cmd, argv] = imageTool('--sheet') === 'magick'
    ? [MAGICK, ['montage', join(dir, 'f*.png'), '-tile', `${cols}x${rows}`, '-geometry', '+4+4', '-background', '#333', sheet]]
    : [FFMPEG, ['-loglevel', 'error', '-y', '-i', join(dir, 'f%03d.png'),
        '-vf', `tile=${cols}x${rows}:padding=4:color=0x333333`, '-frames:v', '1', sheet]];
  return new Promise((ok, fail) => {
    const p = spawn(cmd, argv, { stdio: 'inherit' });
    p.on('close', (c) => (c === 0 ? ok() : fail(new Error(`${basename(cmd)} exited ${c}`))));
  });
}

// ---------------------------------------------------------------------- main

if (!CHROME) {
  console.error('render.mjs needs Chrome, Chromium or Edge (headless). None was found;\n' +
    'set CHROME=/path/to/browser, or use `node tools/frame.mjs` for ASCII frames without one.');
  process.exit(1);
}

const { server, port } = await listen(0);
const profile = await mkdtemp(join(tmpdir(), 'chrome1602-'));
await mkdir(join(ROOT, 'out'), { recursive: true });

try {
  if (args.frames) {
    const n = Number(args.frames);
    const duration = Number(args.duration ?? 4);
    const dir = resolve(args.out ?? join(ROOT, 'out', design));
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < n; i++) {
      const t = (i / n) * duration;
      const file = join(dir, `f${String(i).padStart(3, '0')}.png`);
      const ok = await screenshot(
        urlFor({ port, t, clock: args.clock, preset: args.preset, bus: args.bus }),
        file, profile,
      );
      process.stdout.write(ok ? '.' : 'x');
    }
    console.log();
    if (args.gif) {
      const gif = resolve(join(ROOT, 'out', `${design}.gif`));
      const fps = n / duration;
      await assembleGif(dir, fps, gif);
      console.log(`gif -> ${gif}`);
    }
    if (args.sheet) {
      const sheet = resolve(join(ROOT, 'out', `${design}-sheet.png`));
      await tileSheet(dir, n, sheet);
      console.log(`sheet -> ${sheet}`);
    }
    console.log(`frames -> ${dir} (${await readdir(dir).then((f) => f.length)} files)`);
  } else {
    const out = resolve(args.out ?? join(ROOT, 'out', `${design}.png`));
    const t = Number(args.t ?? 0);
    const ok = await screenshot(urlFor({ port, t, clock: args.clock, preset: args.preset, bus: args.bus }), out, profile);
    if (!ok) { console.error('render failed'); process.exitCode = 1; }
    else console.log(`${basename(out)}  ${width}x${height}  (${design} @ t=${t}s)`);
  }
} finally {
  server.close();
  await rm(profile, { recursive: true, force: true });
}