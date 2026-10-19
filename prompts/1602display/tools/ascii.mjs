// PNG -> ASCII luminance art, so renders can be reviewed without an image viewer.
// usage: node /tmp/ascii.mjs file.png cols [x y w h]
import fs from 'node:fs';
const { decodePNG } = await import('/Users/bilibili/coding/1602display/.claude/skills/oled-clock/tools/png.mjs');
const [file, colsArg, ...crop] = process.argv.slice(2);
const img = decodePNG(fs.readFileSync(file));
const [X, Y, W, H] = crop.length ? crop.map(Number) : [0, 0, img.width, img.height];
const cols = Number(colsArg || 128), cw = W / cols, ch = cw * 2, rows = Math.floor(H / ch);
const ramp = ' .:-=+*#%@';
let out = '';
for (let r = 0; r < rows; r++) {
  let line = '';
  for (let c = 0; c < cols; c++) {
    let s = 0, n = 0;
    for (let y = Math.floor(Y + r * ch); y < Y + (r + 1) * ch; y++)
      for (let x = Math.floor(X + c * cw); x < X + (c + 1) * cw; x++) {
        const i = (y * img.width + x) * 4, d = img.data ?? img.rgba ?? img.pixels;
        s += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; n++;
      }
    line += ramp[Math.min(9, Math.floor((s / n / 255) ** 0.7 * 10))];
  }
  out += line.trimEnd() + '\n';
}
console.log(`${img.width}x${img.height}`); process.stdout.write(out);
