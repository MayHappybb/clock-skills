// Dependency-free static server for the simulator.
//
// ES modules cannot be imported over file:// (Chrome treats every file as an
// opaque origin), so both the headless render tool and interactive use go
// through here.
//
//   node tools/serve.mjs [port]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

export function createStaticServer(root = ROOT) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let path = decodeURIComponent(url.pathname);
      if (path === '/') path = '/sim/index.html';
      const full = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ''));
      if (!full.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
      const info = await stat(full);
      const target = info.isDirectory() ? join(full, 'index.html') : full;
      const st = info.isDirectory() ? await stat(target) : info;
      // revalidate every time (edits show on reload) but answer 304 when
      // nothing changed: over a slow link that saves resending every module
      const mtime = new Date(Math.floor(st.mtimeMs / 1000) * 1000);
      const since = Date.parse(req.headers['if-modified-since'] ?? '');
      if (!Number.isNaN(since) && since >= mtime.getTime()) { res.writeHead(304, { 'cache-control': 'no-cache' }).end(); return; }
      const body = await readFile(target);
      res.writeHead(200, {
        'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
        'last-modified': mtime.toUTCString(),
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
}

/** Start the server on `port` (0 picks a free one). Resolves with the port. */
export function listen(port = 0, root = ROOT) {
  const server = createStaticServer(root);
  return new Promise((ok, fail) => {
    server.on('error', fail);
    server.listen(port, '127.0.0.1', () => ok({ server, port: server.address().port }));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] ?? 8173);
  const { port: actual } = await listen(port);
  console.log(`WS2812 simulator on http://localhost:${actual}/sim/`);
}