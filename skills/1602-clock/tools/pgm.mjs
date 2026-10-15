// Minimal binary PGM (P5) reader. Avoids pulling in any image dependency.
import { readFileSync } from 'node:fs';

/** @returns {{width:number,height:number,max:number,data:Uint8Array}} */
export function readPGM(path) {
  const buf = readFileSync(path);
  let pos = 0;
  const token = () => {
    // skip whitespace and '#' comments
    while (pos < buf.length) {
      const c = buf[pos];
      if (c === 0x23) { while (pos < buf.length && buf[pos] !== 0x0a) pos++; }
      else if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) pos++;
      else break;
    }
    const start = pos;
    while (pos < buf.length && ![0x20, 0x09, 0x0a, 0x0d].includes(buf[pos])) pos++;
    return buf.toString('ascii', start, pos);
  };
  const magic = token();
  if (magic !== 'P5') throw new Error(`expected P5, got ${magic}`);
  const width = Number(token());
  const height = Number(token());
  const max = Number(token());
  pos++; // single whitespace after maxval
  const data = buf.subarray(pos, pos + width * height);
  return { width, height, max, data };
}

export const at = (img, x, y) => img.data[y * img.width + x];

/** Row-wise mean darkness (0=black..255=white) -> darker rows score higher. */
export function rowProfile(img, x0 = 0, x1 = img.width) {
  const out = new Float64Array(img.height);
  for (let y = 0; y < img.height; y++) {
    let s = 0;
    const base = y * img.width;
    for (let x = x0; x < x1; x++) s += img.data[base + x];
    out[y] = 255 - s / (x1 - x0);
  }
  return out;
}

/** Column-wise mean darkness. */
export function colProfile(img, y0 = 0, y1 = img.height) {
  const out = new Float64Array(img.width);
  for (let x = 0; x < img.width; x++) {
    let s = 0;
    for (let y = y0; y < y1; y++) s += img.data[y * img.width + x];
    out[x] = 255 - s / (y1 - y0);
  }
  return out;
}

/** Indices of local maxima above a threshold, merged when closer than `merge`. */
export function peaks(profile, threshold, merge = 4) {
  const hits = [];
  for (let i = 0; i < profile.length; i++) if (profile[i] >= threshold) hits.push(i);
  const groups = [];
  for (const i of hits) {
    const last = groups[groups.length - 1];
    if (last && i - last[last.length - 1] <= merge) last.push(i);
    else groups.push([i]);
  }
  // weighted centre of each run
  return groups.map((g) => {
    let num = 0, den = 0;
    for (const i of g) { num += i * profile[i]; den += profile[i]; }
    return { centre: num / den, strength: Math.max(...g.map((i) => profile[i])), span: g.length };
  });
}