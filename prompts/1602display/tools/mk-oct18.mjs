// Per-face prompts for the 2026-10-18 round (10 x 1602 / 10 x OLED / 10 x HUB75).
import fs from 'node:fs';
const P = '/Users/bilibili/coding/1602display/prompts';
const S = '/Users/bilibili/coding/1602display/.claude/skills/ws2812-clock';
const { layout } = await import(`${S}/sim/js/layout.js`);
const tsv = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => l.split('\t'));
const fill = (t, m) => t.replace(/\{([A-Z]+)\}/g, (s, k) => (k in m ? m[k] : s));

const LOOK = (key, pngHint) => `
LOOKING AT YOUR RENDERS: on this machine the Read tool often returns nothing
for PNG/GIF files (no image arrives). If an image does not come back, do not
guess: check it as text instead. ${pngHint}
Never claim you looked at an image you did not actually see; say in your
report which checks were visual and which were text.
`;
const ASCII = 'Render at true size and convert with `node /Users/bilibili/coding/1602display/prompts/tools/ascii.mjs <png> <cols>` (prints luminance as ASCII; use cols = the panel width, or crop with extra args x y w h).';

const SHARED = (key) => `
THIS ROUND (2026-10-18): the owner asked for 10 more faces per display (1602,
12864 OLED, HUB75), built in parallel, in the same spirit as the last round:
"unleash all your creativity, make them all very amazing". The bar is the
best face in the gallery, not a good one. Find the one surprising, delightful
moment that makes someone laugh or gasp, and make the time at rest belong to
the theme, not only the turns. The first thing a stranger must see is the
time; the second is the joke or the wonder.
Don't add the owner's avatar or any recurring mascot (no frog): characters,
if any, belong to the theme.

Work alone: don't spawn subagents. About 19 other agents are building other
faces in parallel on this machine (8 cores), so only ever write to your own
files and out/${key}*, render sequentially, and keep tool output short (pipe
big outputs through head/tail, read files in focused slices). The owner's API
quota has run out mid-round before: be economical, but finish.
`;

// ---------------- 1602
const b1602 = fs.readFileSync(`${P}/1602-face-brief.txt`, 'utf8');
const lessons1602 = `
Lessons from the last two 1602 rounds (20 faces), from the owner's gallery:
- Strongest stills: pigeons (crumb numerals on a ledge, birds beside them),
  juggler (four digits on a juggling arch over both rows), zipper (bold).
- Failures to avoid:
  - character parts beside the digits that read as letters or digits: fish
    tails read as "M" and heads as arrows, so "<18M <56M" looked like text;
    window boxes read as "00000". Check what every non-digit cell spells.
  - a wall of solid 0xFF blocks with negative digits cut in it reads as a
    black slab; the digits got lost. Keep plenty of empty glass.
  - one-cell-wide digits look sparse and weak next to a scene; a small
    classic "18:56" with the scene beside it is a fail.
  - an hour shown as a kanji or a symbol reads as a little figure; the time
    must be readable by any stranger.
  - long gaps: a turn that leaves a digit empty for 12-30 s; keep empty
    stretches to a few seconds.
  - a beam/stripe effect laid over the digits hid the hour.
- tile-budget samples only 11 instants per minute: run your own dense frame
  sweep across the turn and the hour (every frame must fit 8 tiles and show
  a right time). Check a night and a noon clock and all ten digits in every
  slot. Decide 12 or 24 h deliberately; 18:56 should not read as 6:56 unless
  there is an AM/PM cue.
`;
for (const [key, seed] of tsv(`${P}/1602-round3/seeds.tsv`))
  fs.writeFileSync(`${P}/1602-round3/${key}.prompt.txt`, fill(b1602, { KEY: key, SEED: seed }).trimEnd() + '\n' + lessons1602
    + LOOK(key, '`node tools/frame.mjs ' + key + ' --clock HH:MM:SS --t <s>` prints the emulator\'s dots as ASCII.') + SHARED(key));

// ---------------- OLED
const bOled = fs.readFileSync(`${P}/clock-face-brief.txt`, 'utf8');
const lessonsOled = `
Lessons from rounds 10-13 (32 faces), from the owner's gallery:
- Strongest stills last round: ropeknot (3D laid-rope numerals hanging from
  a yard), spintops (numbers painted on spinning tippe tops), cootie (paper
  fortune teller, hour in the mouth, minutes on the pockets), stringart.
- Fixes I had to make last round, check yours for the same:
  - a lit, dithered surface everywhere (paper, slab, lattice) made the time
    unfindable: the time must be the brightest, boldest thing, on plenty of
    black, with a black moat round each stroke;
  - an hour shown as a pointer with no scale could not be read: if the time
    is a position, draw the scale it is read against;
  - an hour cut into a shaded slab got lost in the shading;
  - 12 h with no AM/PM cue (18:56 read as 6): use 24 h, or a clear cue;
  - minute digits made of a grid of small balls/cells read as a lumpy grid.
- Still true: textured plain letterforms are not enough, the letterform is
  designed for the theme; no speckle (scattered single pixels) as shading or
  texture; solid contour lines beat hatching; the hour show keeps the time
  readable (blank for more than ~1 s is a fail); never four digits in a row
  (compose a scene); characters and props at 1x are bold, simple
  silhouettes. If the face is 3D, look at sim/designs/cube.js: real geometry,
  perspective, shading by facing, correct occlusion, always moving. Keep
  frame() under ~2 ms.
`;
for (const [key, mod, seed] of tsv(`${P}/round14/seeds.tsv`))
  fs.writeFileSync(`${P}/round14/${key}.prompt.txt`, fill(bOled, { KEY: key, MODULE: mod, SEED: seed }).trimEnd() + '\n' + lessonsOled
    + LOOK(key, ASCII + ' For OLED: `node tools/render.mjs ' + key + ' --clock HH:MM:SS --px 1 --style clean --out /tmp/' + key + '-1x.png`, then 128 cols.') + SHARED(key));

// ---------------- HUB75
const bWs = fs.readFileSync(`${P}/ws-round8/brief.txt`, 'utf8')
  .replace('out/gallery-round3.png to out/gallery-round7.png to see the 62 faces', 'out/gallery-round3.png to out/gallery-round9.png to see the ~95 faces')
  .replace(/\nWork alone:[\s\S]*$/, '\n');
const lessonsWs = `
- Round 8 (12 faces): the strongest (shadowplay, mahjong, griddle,
  projector) put the time on a big physical object of the theme. Fixes:
  a drawing machine invisible at rest (show the mechanism); time too small
  and dim in a big banner (the time must use the space); a 0 built as a box
  read as a box with a 1 inside (allow counters and holes).
- Round 9 (8 faces): rpgbattle (wyrm-coiled hour, bouncing damage-number
  minutes), magician, matryoshka and abyss were strongest. Fixes I had to
  make: four equal upright digits on one baseline with the theme bolted on
  (dragondance first pass: make the object carry the digits, vary height
  and tilt); a 2x2 of thin outline digits in a faint "pretty stone" (geode:
  the object must be bold and the digits grow from it); a whole panel left
  nearly empty (forge's bottom third); hours-over-minutes at rest is still
  the most common default: find a composition the theme suggests.
`;
const SPEED = { 4096: 1.5, 8192: 3, 12288: 4, 16384: 5, 20480: 6, 24576: 7, 32768: 8, 36864: 9 };
const MM = { hub: [128, 128], 'hub-x2': [256, 128], 'hub-tall': [128, 256], 'hub-2x2': [256, 256], 'hub-x3': [384, 128], 'hub-x4': [512, 128], 'hub-tall3': [128, 384],
  'hub-cross': [384, 384], 'hub-stair': [256, 256], 'hub-2x3': [256, 384], 'hub-3x3': [384, 384], 'hub-ring': [384, 384], 'hub-steps': [384, 384] };
for (const [key, lay, seed] of tsv(`${P}/ws-round10/seeds.tsv`)) {
  const L = layout(lay);
  const N = Number(L.label.match(/\((\d+)\)\s*$/)[1]);
  const m = {
    KEY: key, SEED: seed, LAYOUT: lay, LABEL: L.label, N, SUPPLY: L.supply, PITCH: 2, W: MM[lay][0], H: MM[lay][1],
    SPEED: `frame() mean under ~${SPEED[N]} ms in Node for these ${N} pixels`,
    GIFSCALE: N <= 4096 ? 4 : N <= 8192 ? 3 : 2,
  };
  const text = fill(bWs, m).replace("\n- Don't add the owner's avatar", lessonsWs.trimEnd() + "\n- Don't add the owner's avatar");
  fs.writeFileSync(`${P}/ws-round10/${key}.prompt.txt`, text.trimEnd() + '\n'
    + LOOK(key, ASCII + ' For HUB75: `node tools/render.mjs ' + key + ' --clock HH:MM:SS --scale 1 --out /tmp/' + key + '-1x.png`, then cols = the raster width in pixels. ASCII shows luminance only: judge hue separately (e.g. by sampling pixels), and say so.') + SHARED(key));
}
console.log('ok');
