// Print the catalogue of every face, from the skills' own registries, as JSON.
//
//   node tools/manifest.mjs
//
// tools/serve.mjs runs this in a child process, so a face added to a skill
// shows up on the next page load without restarting anything; tools/build.mjs
// writes it to manifest.json. `version` is a hash of the rest: the page puts
// it on each design's URL, so a static host's cache never mixes two versions.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { SKILLS } from './skills.mjs';

const load = (id, rel) => import(pathToFileURL(join(SKILLS[id].sim, rel)).href);

/**
 * Which round each key belongs to, from the comments in a registry file.
 * Comments like "// round 12 (2026-10-04): 4 real-3D faces" head a run of
 * keys; a bare "// round 12" borrows the dated comment of the same round
 * from elsewhere in the file.
 */
function parseRounds(src) {
  const dated = new Map();
  for (const m of src.matchAll(/\/\/\s*(round\s+\d+|[\w -]+?)\s*\((\d{4}-\d\d-\d\d)\)[,:]?\s*(.*)$/gim)) dated.set(m[1].toLowerCase(), { date: m[2], note: m[3].trim() });
  const lines = src.split('\n');
  const start = lines.findIndex((l) => /const KEYS = \[|export default \{/.test(l));
  const out = new Map();
  let group = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\s*[\]}];/.test(line)) break;
    const c = line.indexOf('//');
    const code = c >= 0 ? line.slice(0, c) : line;
    const keys = [...code.matchAll(/'([\w-]+)'/g)].map((m) => m[1]);
    const bare = code.match(/^\s*([\w$]+)\s*[,:]/);
    if (!keys.length && bare) keys.push(bare[1]);
    for (const k of keys) out.set(k, group);
    if (c >= 0 && !code.trim()) group = describe(line.slice(c + 2).trim(), dated);
  }
  return out;
}

function describe(comment, dated) {
  const byDate = comment.match(/^round\s+(\d{4}-\d\d-\d\d)[,:]?\s*(.*)$/i);
  if (byDate) return { label: 'Round', date: byDate[1], note: byDate[2] };
  const m = comment.match(/^round\s+(\d+)(?:\s*\((\d{4}-\d\d-\d\d)\))?[,:]?\s*(.*)$/i);
  if (m) {
    const d = dated.get(`round ${m[1]}`) ?? {};
    return { label: `Round ${m[1]}`, date: m[2] ?? d.date ?? null, note: m[3] || d.note || '' };
  }
  const other = comment.match(/^(.*?)\s*\((\d{4}-\d\d-\d\d)\)[,:]?\s*(.*)$/);
  if (other) return { label: other[1], date: other[2], note: other[3] };
  const d = dated.get(comment.toLowerCase()) ?? {};
  return { label: comment, date: d.date ?? null, note: d.note ?? '' };
}

const size = (w, h) => ({ w: +w.toFixed(2), h: +h.toFixed(2) });

async function hall(id, build) {
  const src = await readFile(join(SKILLS[id].sim, 'designs/index.js'), 'utf8');
  const rounds = parseRounds(src);
  const { DESIGNS } = await load(id, 'js/player.js');
  // The module each design came from, so the gallery can load faces one by
  // one instead of the whole registry (registry keys are not always file names).
  const fileOf = new Map();
  for (const f of await readdir(join(SKILLS[id].sim, 'designs'))) {
    if (!f.endsWith('.js') || f === 'index.js') continue;
    const mod = await load(id, `designs/${f}`).catch(() => null);
    if (mod?.default && !fileOf.has(mod.default)) fileOf.set(mod.default, f);
  }
  const faces = [];
  for (const [key, d] of Object.entries(DESIGNS)) {
    if (d.utility || !fileOf.has(d)) continue;
    faces.push({ key, file: fileOf.get(d), name: d.name ?? key, blurb: d.blurb ?? '', fps: Number(d.fps ?? 30), round: rounds.get(key) ?? null, ...(await build(d, key)) });
  }
  return faces;
}

// ---- 16x2 character LCD -------------------------------------------------------
const P1602 = await load('1602', 'js/panel.js');
const lcdCrops = Object.fromEntries(['body', 'view'].map((c) => {
  const s = P1602.panelCanvasSize(null, { scale: 100, crop: c });
  return [c, size(s.width / 100, s.height / 100)];
}));
const h1602 = {
  id: '1602', title: 'Character LCD', spec: '16×2 HD44780 module, 80 × 36 mm',
  about: 'Sixteen columns of 5×8 dot cells and eight characters a face can redraw. The liquid crystal takes about 150 ms to switch, so anything that moves leaves a ghost.',
  crops: lcdCrops,
  presets: Object.fromEntries(Object.entries(P1602.PANEL_PRESETS).map(([k, p]) => [k, p.label ?? k])),
  faces: await hall('1602', (d) => ({ panel: d.panel ?? 'green', rotate: d.rotate ?? 0 })),
};

// ---- monochrome OLED ------------------------------------------------------------
const POLED = await load('oled', 'js/panel.js');
const { MODULES: OM } = await load('oled', 'js/modules.js');
const oledModules = Object.fromEntries(Object.entries(OM).map(([k, m]) => [k, {
  label: m.label ?? k, colours: m.colours, cols: m.cols, rows: m.rows,
  crops: Object.fromEntries(['view', 'glass', 'body'].map((c) => { const b = POLED.cropBox({ key: k, ...m }, c); return [c, size(b.w, b.h)]; })),
}]));
const hOled = {
  id: 'oled', title: 'Monochrome OLED', spec: 'SSD1306 and SH1106 modules, 128×64 and 128×32',
  about: 'Every pixel makes its own light, one colour per panel, on glass that is black when off. Pixels left lit for hours burn in, so most faces keep moving.',
  modules: oledModules,
  faces: await hall('oled', (d) => ({ module: d.module ?? '096-128x64', colour: d.colour ?? null })),
};

// ---- colour TFT -----------------------------------------------------------------
const PTFT = await load('tft', 'js/panel.js');
const { MODULES: TM } = await load('tft', 'js/modules.js');
const tftModules = Object.fromEntries(Object.entries(TM).map(([k, m]) => [k, {
  label: m.label ?? k, cols: m.cols, rows: m.rows,
  crops: Object.fromEntries(['view', 'glass', 'body'].map((c) => {
    const L = PTFT.layout({ key: k, ...m }, { scale: 100, crop: c });
    return [c, size(L.width / 100, L.height / 100)];
  })),
}]));
const hTft = {
  id: 'tft', title: 'Colour TFT', spec: 'ST7735S, 160×80 IPS glass, 0.96 inch',
  about: 'Sixteen-bit colour on a glass about 22 mm wide, sent over SPI. The glass is drawn with its colour stripes, backlight and the lag of the liquid crystal.',
  modules: tftModules,
  faces: await hall('tft', (d) => ({ module: d.module ?? 'air101-lcd' })),
};

// ---- LED boards and HUB75 panels --------------------------------------------------
const W = await load('led', 'js/player.js');
const MARGIN = 4;   // render.js frameSize default, mm around the boards
const layoutInfo = new Map();
const infoOf = (k) => {
  if (!layoutInfo.has(k)) {
    const L = W.layoutFor({ layouts: [k] });
    layoutInfo.set(k, { label: L.label, n: L.n, mm: size(L.bbox.w + 2 * MARGIN, L.bbox.h + 2 * MARGIN), hub: L.leds.length > 0 && L.panels.some((p) => p.def.bus === 'hub75') });
  }
  return layoutInfo.get(k);
};
const hLed = {
  id: 'led', title: 'LED boards and panels', spec: 'WS2812 boards and HUB75 64×64 panels, alone or assembled',
  about: 'Shaped boards of addressable LEDs and HUB75 matrices, from one board to nine panels. Light is shown bare, behind smoked acrylic, or through an opal diffuser.',
  faces: await hall('led', (d) => {
    const ok = d.layouts ?? ['*'];
    const layouts = ok.includes('*') ? [...new Set([...ok.filter((k) => k !== '*'), ...Object.keys(W.LAYOUTS)])] : ok;
    const look = typeof d.look === 'object' ? d.look : { look: d.look ?? 'bare' };
    return { layout: layouts[0] === '*' ? 'hex' : layouts[0], layouts, look: look.look ?? 'bare', gap: look.gap ?? 8 };
  }),
};
for (const f of hLed.faces) for (const k of f.layouts) infoOf(k);
hLed.layouts = Object.fromEntries(layoutInfo);

const halls = [h1602, hOled, hTft, hLed];
for (const h of halls) h.sim = SKILLS[h.id].url;
const body = JSON.stringify(halls);
process.stdout.write(JSON.stringify({ version: createHash('sha1').update(body).digest('hex').slice(0, 12), halls }));
