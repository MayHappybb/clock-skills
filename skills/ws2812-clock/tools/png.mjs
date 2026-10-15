// Minimal PNG decode / encode / crop / tile, so render.mjs needs no image
// tool for stills and contact sheets.
//
// Decodes what headless Chrome writes: 8-bit greyscale, grey+alpha, RGB or
// RGBA, not interlaced. Encodes RGBA with no row filter.

import { inflateSync, deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const BYTES_PER_PIXEL = { 0: 1, 2: 3, 4: 2, 6: 4 };

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function readChunks(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  const out = [];
  for (let o = 8; o < buf.length;) {
    const len = buf.readUInt32BE(o);
    out.push({ type: buf.toString('ascii', o + 4, o + 8), data: buf.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
  }
  return out;
}

/** Undo one row's PNG filter in place, given the already-decoded row above. */
function unfilter(type, row, prev, bpp) {
  for (let i = 0; i < row.length; i++) {
    const a = i >= bpp ? row[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
    let add = 0;
    if (type === 1) add = a;
    else if (type === 2) add = b;
    else if (type === 3) add = (a + b) >> 1;
    else if (type === 4) {
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    row[i] = (row[i] + add) & 0xff;
  }
}

/** Decode a PNG into RGBA bytes. */
export function decodePNG(buf) {
  const chunks = readChunks(buf);
  const ihdr = chunks[0].data;
  const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4);
  const depth = ihdr[8], colour = ihdr[9], interlace = ihdr[12];
  const bpp = BYTES_PER_PIXEL[colour];
  if (depth !== 8 || interlace !== 0 || !bpp) throw new Error(`unsupported PNG (depth ${depth}, colour ${colour}, interlace ${interlace})`);
  const idat = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data);
  const stride = w * bpp;
  // Inflate straight into a buffer of the known size, and unfilter rows in
  // place in it, reusing one zero row for the first: no per-row allocations,
  // so a large screenshot costs about its decoded size and no more.
  const raw = inflateSync(idat.length === 1 ? idat[0] : Buffer.concat(idat), { info: false, maxOutputLength: h * (stride + 1) });
  const rgba = colour === 6 ? null : Buffer.alloc(w * h * 4);
  const zero = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const at = y * (stride + 1);
    const row = raw.subarray(at + 1, at + 1 + stride);
    unfilter(raw[at], row, y ? raw.subarray(at - stride, at) : zero, bpp);
    if (!rgba) continue;
    for (let x = 0; x < w; x++) {
      const s = x * bpp, d = (y * w + x) * 4;
      if (colour === 0) { rgba[d] = rgba[d + 1] = rgba[d + 2] = row[s]; rgba[d + 3] = 255; }
      else if (colour === 4) { rgba[d] = rgba[d + 1] = rgba[d + 2] = row[s]; rgba[d + 3] = row[s + 1]; }
      else { rgba[d] = row[s]; rgba[d + 1] = row[s + 1]; rgba[d + 2] = row[s + 2]; rgba[d + 3] = 255; }
    }
  }
  if (rgba) return { width: w, height: h, rgba };
  // RGBA already: drop the filter byte at the start of each row, in place.
  for (let y = 0; y < h; y++) raw.copy(raw, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1));
  return { width: w, height: h, rgba: raw.subarray(0, w * h * 4) };
}

/** Encode RGBA bytes as a PNG. */
export function encodePNG(width, height, rgba) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    rows.push(Buffer.from([0]));
    rows.push(Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4));
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Cut the rectangle (x, y, width, height) out of a PNG buffer. */
export function cropPNG(buf, x, y, width, height) {
  return cropDecoded(decodePNG(buf), x, y, width, height);
}

/** Cut a rectangle out of an already decoded image ({ width, height, rgba }), as a PNG. */
export function cropDecoded(img, x, y, width, height) {
  if (x + width > img.width || y + height > img.height) throw new Error(`crop ${width}x${height}+${x}+${y} is outside the ${img.width}x${img.height} image`);
  const out = Buffer.alloc(width * height * 4);
  for (let j = 0; j < height; j++) img.rgba.copy(out, j * width * 4, ((y + j) * img.width + x) * 4, ((y + j) * img.width + x + width) * 4);
  return encodePNG(width, height, out);
}

/** Tile equally sized PNG buffers into a grid `cols` wide, `pad` pixels apart. */
export function tilePNG(bufs, width, height, cols, pad = 4, [r, g, b] = [51, 51, 51]) {
  cols = Math.min(cols, bufs.length);
  const rowsN = Math.ceil(bufs.length / cols);
  const W = cols * width + (cols + 1) * pad, H = rowsN * height + (rowsN + 1) * pad;
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255; }
  bufs.forEach((buf, i) => {
    const img = decodePNG(buf);
    const ox = pad + (i % cols) * (width + pad), oy = pad + Math.floor(i / cols) * (height + pad);
    for (let j = 0; j < height; j++) img.rgba.copy(out, ((oy + j) * W + ox) * 4, j * img.width * 4, (j * img.width + width) * 4);
  });
  return encodePNG(W, H, out);
}
