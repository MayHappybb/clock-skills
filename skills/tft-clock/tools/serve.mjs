// Static server for the live view and for tools that need one.
//
//   node tools/serve.mjs [port]      then open http://localhost:8174/sim/?design=<key>

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
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
      const body = await readFile(target);
      res.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
}

/** Start the server on `port` (0 picks a free one), on localhost only. */
export function listen(port = 0, root = ROOT) {
  const server = createStaticServer(root);
  return new Promise((ok, fail) => {
    server.on('error', fail);
    server.listen(port, '127.0.0.1', () => ok({ server, port: server.address().port }));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] ?? 8174);
  const { port: actual } = await listen(port);
  console.log(`TFT simulator on http://localhost:${actual}/sim/  (localhost only)`);
}
