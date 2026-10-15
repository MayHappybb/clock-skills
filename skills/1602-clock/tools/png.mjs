// Minimal PNG crop, so render.mjs needs no image tool for stills.
//
// Handles what headless Chrome writes: 8-bit greyscale, grey+alpha, RGB or
// RGBA, not interlaced. Decodes the rows, keeps the top-left `width` x
// `height`, and re-encodes with no row filter.

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

/** Crop a PNG buffer to its top-left `width` x `height` pixels. */
export function cropPNG(buf, width, height) {
  const chunks = readChunks(buf);
  const ihdr = chunks[0].data;
  const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4);
  const depth = ihdr[8], colour = ihdr[9], interlace = ihdr[12];
  const bpp = BYTES_PER_PIXEL[colour];
  if (depth !== 8 || interlace !== 0 || !bpp) throw new Error(`unsupported PNG (depth ${depth}, colour ${colour}, interlace ${interlace})`);
  if (width > w || height > h) throw new Error(`crop ${width}x${height} is larger than the ${w}x${h} image`);

  const raw = inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const stride = w * bpp;
  let prev = Buffer.alloc(stride);
  const rows = [];
  for (let y = 0; y < height; y++) {
    const at = y * (stride + 1);
    const row = Buffer.from(raw.subarray(at + 1, at + 1 + stride));
    unfilter(raw[at], row, prev, bpp);
    rows.push(Buffer.concat([Buffer.from([0]), row.subarray(0, width * bpp)]));
    prev = row;
  }

  const header = Buffer.from(ihdr);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
