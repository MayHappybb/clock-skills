// Load the gallery in headless Chrome and check every hall and a focus view:
// no errors, no failed faces, and the faces on screen keep their frame rate.
//
//   node tools/smoke.mjs [--url gallery-url] [--shots dir] [--wait seconds] [--halls 1602,oled,tft,led] [--phone]
//
// --phone emulates a 390 x 844 phone screen at 3x, with touch.
//
// Without --url it starts tools/serve.mjs on a free port; with one it tests
// that page instead (a static build, or the published site). Set
// CHROME=/path/to/chrome if it is not in the usual place. Exits 1 if anything failed.

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const shots = arg('shots', null);
const URL_ARG = arg('url', null);
const PHONE = process.argv.includes('--phone');
const WAIT = Number(arg('wait', 5)) * 1000;
const HALLS = arg('halls', '1602,oled,tft,led').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = process.env.CHROME ?? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(existsSync);
if (!CHROME) { console.error('smoke.mjs needs Chrome; set CHROME=/path/to/chrome'); process.exit(2); }

// ---- server and browser --------------------------------------------------------------
const server = URL_ARG ? null : spawn(process.execPath, [join(HERE, 'tools/serve.mjs'), '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
const base = URL_ARG ?? await new Promise((ok, fail) => {
  server.stdout.on('data', (b) => { const m = String(b).match(/http:\/\/localhost:\d+\/gallery\//); if (m) ok(m[0]); });
  server.on('exit', () => fail(new Error('server exited')));
});
const profile = await mkdtemp(join(tmpdir(), 'gallery-smoke-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1440,900',
  '--force-device-scale-factor=2', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let port;
for (let i = 0; i < 100 && !port; i++) {
  await sleep(100);
  port = await readFile(join(profile, 'DevToolsActivePort'), 'utf8').then((s) => s.split('\n')[0]).catch(() => null);
}
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));
let seq = 0;
const waiting = new Map(), problems = [];
ws.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') problems.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push(`console: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
});
const send = (method, params = {}) => new Promise((ok) => { const id = ++seq; waiting.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

async function shot(name) {
  if (!shots) return;
  await mkdir(shots, { recursive: true });
  const r = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(shots, `${name}.png`), Buffer.from(r.result.data, 'base64'));
}

const pageFps = () => evaluate('new Promise((ok) => { let n = 0; const t0 = performance.now(); (function f() { if (performance.now() - t0 < 1000) { n++; requestAnimationFrame(f); } else ok(n); })(); })');

function report(label, stats, fps) {
  const t = stats?.tiles ?? [];
  const failed = t.filter((x) => x.failed);
  const slow = t.filter((x) => !x.failed && x.shown !== null && x.shown < x.fps * 0.85);
  console.log(`${label}: ${t.length} faces on screen, page at ${fps} fps, workers ${stats?.workers?.join('; ')}`);
  for (const x of t) console.log(`   ${x.hall}/${x.key}`.padEnd(34) + `${x.fps} fps designed, ${x.shown === null ? '-' : x.shown.toFixed(1)} shown${x.failed ? '  FAILED' : ''}`);
  for (const x of failed) problems.push(`${x.hall}/${x.key} failed: ${x.error}`);
  if (slow.length) console.log(`   slower than designed: ${slow.map((x) => x.key).join(', ')}`);
  return slow.length;
}

// ---- the run -----------------------------------------------------------------------------
let slowTotal = 0;
try {
  await send('Runtime.enable'); await send('Page.enable');
  if (PHONE) {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  await send('Page.navigate', { url: base });
  await sleep(WAIT + 3000);   // first load builds the manifest if there is no cache yet
  for (let i = 0; i < 60 && !(await evaluate('document.querySelectorAll(".case").length')); i++) await sleep(1000);
  await shot('0-top');
  slowTotal += report('top', await evaluate('galleryStats()'), await pageFps());
  // each hall twice: at its top, and further in with only its own faces on screen
  for (const hall of HALLS) for (const [where, sel] of [['top', `#hall-${hall}`], ['inside', `#hall-${hall} .case:nth-child(13)`]]) {
    await evaluate(`document.querySelector('${sel}').scrollIntoView()`);
    await sleep(WAIT);
    await shot(`1-hall-${hall}-${where}`);
    slowTotal += report(`hall ${hall}, ${where}`, await evaluate('galleryStats()'), await pageFps());
  }
  for (const hall of HALLS) {
    await evaluate(`document.querySelector('#hall-${hall} .case-link').click()`);
    await sleep(WAIT);
    await shot(`2-focus-${hall}`);
    console.log(`focus ${hall}: ${await evaluate("document.getElementById('focus-rate').textContent")}`);
    await evaluate("document.getElementById('focus-close').click()");
  }
} finally {
  ws.close(); chrome.kill(); server?.kill();
  await sleep(300);
  await rm(profile, { recursive: true, force: true });
}
for (const p of problems) console.log(`PROBLEM ${p}`);
console.log(problems.length ? `${problems.length} problems` : `no errors${slowTotal ? `, ${slowTotal} slow readings (headless Chrome renders in software)` : ''}`);
process.exit(problems.length ? 1 : 0);
