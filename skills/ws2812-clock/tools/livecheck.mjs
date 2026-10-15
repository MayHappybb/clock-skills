// Measure the live view in a real (headless) Chrome, in real time: the frame
// rate the page actually shows and where the time goes. No virtual time, so
// the numbers are honest for this machine.
//
//   node tools/livecheck.mjs [--design hive] [--layout hex] [--seconds 6] [--size 1280x900]
//
// Needs Chrome, Chromium or Edge (CHROME=/path to choose one).

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStaticServer } from './serve.mjs';
import { parseArgs } from './render.mjs';

const args = parseArgs(process.argv.slice(2));
const CHROME = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p));
if (!CHROME) { console.error('livecheck needs Chrome (set CHROME=/path)'); process.exit(1); }

const reports = [];
const server = createStaticServer();
const serveStatic = server.listeners('request')[0];
server.removeAllListeners('request');
server.on('request', (req, res) => {
  if (req.method !== 'POST' || req.url !== '/report') return serveStatic(req, res);
  let body = '';
  req.on('data', (c) => { if (body.length < 4096) body += c; });
  req.on('end', () => { try { reports.push(JSON.parse(body)); } catch { /* ignore */ } res.writeHead(204).end(); });
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;

const q = new URLSearchParams({ design: args.design ?? 'hive', report: '1' });
if (args.layout) q.set('layout', args.layout);
const [w, h] = (args.size ?? '1280x900').split('x');
const profile = await mkdtemp(join(tmpdir(), 'ws-live-'));
const child = spawn(CHROME, ['--headless=new', `--window-size=${w},${h}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--enable-unsafe-swiftshader', `http://127.0.0.1:${port}/sim/index.html?${q}`], { stdio: 'ignore' });
await new Promise((ok) => setTimeout(ok, Number(args.seconds ?? 6) * 1000));
child.kill('SIGKILL');
server.close();
await rm(profile, { recursive: true, force: true });

if (!reports.length) { console.log('no reports: the page did not run (check the browser console via serve.mjs)'); process.exit(1); }
const ready = reports.find((x) => x.ready !== undefined)?.ready;
const per = reports.filter((x) => x.fps !== undefined);
const fps = per.slice(1).map((x) => x.fps);           // the first second includes start-up
const r = per[per.length - 1] ?? {};
console.log(`${q.get('design')}${args.layout ? ' on ' + args.layout : ''}: ${r.gl ? 'GPU' : 'CPU'} renderer, canvas ${r.w}x${r.h}`);
console.log(`  first frame ${ready ?? '?'} ms after navigation; fps each second: ${per.map((x) => x.fps).join(', ')}`);
console.log(`  steady ${fps.length ? (fps.reduce((a, b) => a + b, 0) / fps.length).toFixed(1) : '?'} fps; design ${r.msDesign} ms, draw (CPU side) ${r.msDraw} ms a frame`);
console.log('  note: headless Chrome may render WebGL in software; a real browser with a GPU is faster');
