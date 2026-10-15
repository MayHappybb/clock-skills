// Write the gallery's generated files next to index.html, so it runs from
// any static file server (GitHub Pages) with no tools/serve.mjs behind it:
//
//   manifest.json    every face (tools/manifest.mjs)
//   lazy/<id>.js     each skill's player.js with an empty registry (tools/lazy.mjs)
//
//   node tools/build.mjs
//
// The files describe the skills this copy of the gallery finds (tools/skills.mjs):
// run inside the clock-skills repo, that is the repo's own skills/.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { ROOT, SKILLS } from './skills.mjs';
import { lazyPlayer } from './lazy.mjs';

const manifest = await new Promise((ok, fail) => {
  execFile(process.execPath, [join(ROOT, 'tools/manifest.mjs')], { maxBuffer: 64 << 20 }, (err, stdout, stderr) => {
    if (stderr) process.stderr.write(stderr);
    if (err) fail(err); else ok(stdout);
  });
});
await writeFile(join(ROOT, 'manifest.json'), manifest);
await mkdir(join(ROOT, 'lazy'), { recursive: true });
for (const id of Object.keys(SKILLS)) await writeFile(join(ROOT, 'lazy', `${id}.js`), await lazyPlayer(id));

const { halls } = JSON.parse(manifest);
console.log(`gallery built in ${ROOT}: ${halls.map((h) => `${h.faces.length} ${h.id}`).join(', ')}`);
