// Text view of a reference photo (24-bit BMP, as written by macOS sips).
//   node view.mjs IMG_8397.bmp                 -> character map, 2x2 px per char, with a colour legend
//   node view.mjs IMG_8397.bmp --pick x,y,w,h  -> average colour of a box (photo pixels)
import fs from 'fs';

const [file, flag, arg] = process.argv.slice(2);
const buf = fs.readFileSync(new URL(file, import.meta.url));
const off = buf.readUInt32LE(10);
const W = buf.readInt32LE(18);
const Hs = buf.readInt32LE(22);
const H = Math.abs(Hs);
const stride = Math.ceil((W * 3) / 4) * 4;
const px = (x, y) => {
  const row = Hs < 0 ? y : H - 1 - y;
  const i = off + row * stride + x * 3;
  return [buf[i + 2], buf[i + 1], buf[i]];
};
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

if (flag === '--pick') {
  const [x0, y0, w, h] = arg.split(',').map(Number);
  const s = [0, 0, 0];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(x, y).forEach((v, k) => (s[k] += v));
  console.log(hex(s.map((v) => Math.round(v / (w * h)))));
  process.exit(0);
}

// Quantise to a small palette by k-means-ish bucketing on 32-level steps.
const key = (c) => c.map((v) => v >> 5).join(',');
const counts = new Map();
const cells = [];
for (let y = 0; y < H; y += 2) {
  const row = [];
  for (let x = 0; x < W; x += 2) {
    const c = [0, 0, 0];
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) px(Math.min(W - 1, x + dx), Math.min(H - 1, y + dy)).forEach((v, k) => (c[k] += v / 4));
    const k = key(c);
    counts.set(k, (counts.get(k) || 0) + 1);
    row.push(k);
  }
  cells.push(row);
}
const chars = ' .:-=+*#%@abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const order = [...counts.entries()].sort((a, b) => b[1] - a[1]);
const sym = new Map(order.map(([k], i) => [k, chars[Math.min(i, chars.length - 1)]]));
console.log(`${file}: ${W}x${H} photo px, 2x2 per char`);
for (const row of cells) console.log(row.map((k) => sym.get(k)).join(''));
console.log(order.slice(0, 30).map(([k, n]) => `'${sym.get(k)}' ~${hex(k.split(',').map((v) => (+v << 5) + 16))} (${n})`).join('  '));
