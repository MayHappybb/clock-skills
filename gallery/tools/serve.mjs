// The clock face gallery, served locally: every display's faces on one page, one port.
//
//   node tools/serve.mjs [port]        then open http://localhost:8180/gallery/
//
// URLs are laid out as GitHub Pages serves the clock-skills repo, so the page
// uses the same relative paths in both places:
//
//   /gallery/                the gallery (this folder)
//   /gallery/manifest.json   every face, rebuilt when a design changes (tools/manifest.mjs)
//   /gallery/lazy/<id>.js    a skill's player.js with an empty registry (tools/lazy.mjs)
//   /skills/<name>/          a skill folder, read-only; its simulator is at sim/
//
// tools/build.mjs writes manifest.json and lazy/ as files for a static host.
// Listens on 127.0.0.1 only and has no authentication: it is a local viewer.

import { createServer } from 'node:http';
import { readFile, stat, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, normalize, extname, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { ROOT, SKILLS } from './skills.mjs';
import { lazyPlayer } from './lazy.mjs';

const CACHE = join(ROOT, '.cache/manifest.json');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
};
const byName = new Map(Object.entries(SKILLS).map(([id, s]) => [s.name, s]));

/** Serve `rel` from inside `root`, with an ETag so reloads revalidate cheaply. */
async function sendFile(req, res, root, rel) {
  const full = resolve(root, normalize('.' + sep + rel));
  if (full !== root && !full.startsWith(root + sep)) return res.writeHead(403).end('forbidden');
  let info = await stat(full);
  let target = full;
  if (info.isDirectory()) {
    if (rel && !rel.endsWith('/')) return res.writeHead(301, { location: `${req.url.split('?')[0]}/` }).end();
    target = join(full, 'index.html'); info = await stat(target);
  }
  const etag = `"${info.size.toString(36)}-${info.mtimeMs.toString(36)}"`;
  const headers = { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-cache', etag };
  if (req.headers['if-none-match'] === etag) return res.writeHead(304, headers).end();
  res.writeHead(200, headers).end(await readFile(target));
}

// ---- the manifest: rebuilt in a child process when any design file changes ----

/** A cheap fingerprint of every file the manifest depends on. */
async function signature() {
  const parts = [];
  for (const s of Object.values(SKILLS)) {
    for (const sub of ['designs', 'js']) {
      const dir = join(s.sim, sub);
      for (const name of (await readdir(dir)).sort()) {
        const i = await stat(join(dir, name));
        parts.push(`${s.name}/${sub}/${name}:${i.size}:${i.mtimeMs}`);
      }
    }
  }
  let h = 0;
  for (const c of parts.join('|')) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `${parts.length}-${(h >>> 0).toString(36)}`;
}

let manifest = null;      // { sig, body }
let building = null;      // Promise while a rebuild runs

function build(sig) {
  building ??= new Promise((ok, fail) => {
    execFile(process.execPath, [join(ROOT, 'tools/manifest.mjs')], { maxBuffer: 64 << 20 }, async (err, stdout, stderr) => {
      building = null;
      if (err) return fail(new Error(stderr || err.message));
      if (stderr) console.error(stderr.trim());
      manifest = { sig, body: stdout };
      await mkdir(join(ROOT, '.cache'), { recursive: true });
      await writeFile(CACHE, JSON.stringify(manifest));
      ok(manifest);
    });
  });
  return building;
}

async function getManifest() {
  if (!manifest) manifest = await readFile(CACHE, 'utf8').then(JSON.parse).catch(() => null);
  const sig = await signature();
  if (manifest?.sig === sig) return manifest.body;
  // Stale: serve what we have and rebuild behind it; with nothing yet, wait.
  const next = build(sig);
  if (manifest) { next.catch((e) => console.error(`manifest rebuild failed:\n${e.message}`)); return manifest.body; }
  return (await next).body;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    if (path === '/' || path === '/gallery') return res.writeHead(302, { location: `/gallery/${url.search}` }).end();
    if (path === '/gallery/manifest.json') {
      return res.writeHead(200, { 'content-type': TYPES['.json'], 'cache-control': 'no-cache' }).end(await getManifest());
    }
    const lazy = path.match(/^\/gallery\/lazy\/([\w-]+)\.js$/);
    if (lazy && SKILLS[lazy[1]]) {
      return res.writeHead(200, { 'content-type': TYPES['.js'], 'cache-control': 'no-cache' }).end(await lazyPlayer(lazy[1]));
    }
    if (path.startsWith('/gallery/')) return await sendFile(req, res, ROOT, path.slice('/gallery/'.length));
    const m = path.match(/^\/skills\/([\w-]+)(\/.*)?$/);
    if (m && byName.has(m[1])) {
      if (!m[2]) return res.writeHead(301, { location: `/skills/${m[1]}/${url.search}` }).end();
      return await sendFile(req, res, byName.get(m[1]).dir, m[2].slice(1));
    }
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    console.error(err);
    res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err.message ?? err));
  }
});

const port = Number(process.argv[2] ?? 8180);
server.listen(port, '127.0.0.1', () => {
  console.log(`Clock face gallery on http://localhost:${server.address().port}/gallery/  (localhost only)`);
  getManifest().catch((e) => console.error(`manifest failed:\n${e.message}`));   // warm it
});
