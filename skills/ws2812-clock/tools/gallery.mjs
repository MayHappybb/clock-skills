// Tile stills of several designs into one gallery sheet.
//
//   node tools/gallery.mjs <name.png, written to out/> <design> [design ...]   (renders each at 10:09:30 first)

import { readFileSync, writeFileSync } from 'node:fs';
import { decodePNG, encodePNG } from '/Users/bilibili/coding/1602display/.claude/skills/ws2812-clock/tools/png.mjs';
const D = '/Users/bilibili/coding/1602display/.claude/skills/ws2812-clock/out';
const [name, ...keys] = process.argv.slice(2);
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync(`${D}/_g`, { recursive: true });
for (const k of keys) execFileSync('node', [new URL('./render.mjs', import.meta.url).pathname, k, '--clock', '10:09:30', '--out', `${D}/_g/${k}.png`], { stdio: 'ignore' });
const C = 4, T = 480, pad = 8, W = C * T + (C + 1) * pad, rows = Math.ceil(keys.length / C), H = rows * T + (rows + 1) * pad;
const out = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) out.set([22, 22, 26, 255], i * 4);
keys.forEach((k, n) => {
  const img = decodePNG(readFileSync(`${D}/_g/${k}.png`));
  const s = Math.min(T / img.width, T / img.height), w = Math.round(img.width * s), h = Math.round(img.height * s);
  const ox = pad + (n % C) * (T + pad) + ((T - w) >> 1), oy = pad + Math.floor(n / C) * (T + pad) + ((T - h) >> 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // box-filter downscale
    const x0 = Math.floor(x / s), x1 = Math.max(x0 + 1, Math.floor((x + 1) / s)), y0 = Math.floor(y / s), y1 = Math.max(y0 + 1, Math.floor((y + 1) / s));
    let r = 0, g = 0, b = 0, c = 0;
    for (let yy = y0; yy < Math.min(y1, img.height); yy++) for (let xx = x0; xx < Math.min(x1, img.width); xx++) { const o = (yy * img.width + xx) * 4; r += img.rgba[o]; g += img.rgba[o + 1]; b += img.rgba[o + 2]; c++; }
    out.set([r / c, g / c, b / c, 255], ((oy + y) * W + ox + x) * 4);
  }
});
writeFileSync(`${D}/${name}`, encodePNG(W, H, out));
console.log('ok', name);
