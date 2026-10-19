// Design registry. Every key here is renderable by name:
//   node tools/render.mjs <key> [--layout <layout>]
//
// To add a design, put `<key>.js` in this directory and add its key below.
// A design that fails to load is reported and skipped instead of taking
// every tool down with it.

const KEYS = [
  // round 11 (2026-10-18): 6 more HUB75 faces
  'campfire', 'grandprix', 'graffiti', 'pachinko', 'watercolor', 'jukebox',
  // round 10 (2026-10-18): 10 more HUB75 faces
  'ramen', 'pinata', 'papelpicado', 'escalator', 'ferriswheel', 'crossroads', 'cardstunt', 'vending', 'salmon', 'dollhouse',
  // round 9 (2026-10-16): 8 HUB75 faces, 'unleash all your creativity'
  'forge', 'magician', 'rpgbattle', 'dragondance', 'geode', 'abyss', 'matryoshka', 'shootinggallery',
  // round 8 (2026-10-09): 12 more faces for HUB75 assemblies
  'fourier', 'icerink', 'shadowplay', 'dandelion', 'projector', 'mahjong', 'sustower', 'tangram',
  'griddle', 'watercurtain', 'slidepuzzle', 'kintsugi',
  // round 8, Sonnet comparison: the same six briefs built blind by Sonnet subagents
  'sonnet-kintsugi', 'sonnet-icerink', 'sonnet-mahjong', 'sonnet-tangram', 'sonnet-sustower', 'sonnet-slidepuzzle',
  // round 7 (2026-10-08): 16 faces for HUB75 assemblies, 1 to 9 panels
  'slinky', 'trainset', 'tvwall', 'microcity', 'elevators', 'popupbook', 'candles', 'rubegoldberg',
  'breakout', 'clawmachine', 'latte', 'frost', 'catscradle', 'billiards', 'tide', 'danmaku',
  // round 6 (2026-10-07): 12 more faces for HUB75 assemblies
  'tetris', 'plasma', 'orrery', 'cuckoo', 'sushi', 'pinscreen', 'invaders', 'knit', 'alley', 'stainedglass', 'robotarm', 'sandpour',
  // round 5 (2026-10-07): 12 faces for HUB75 assemblies, 1 to 5 panels
  'splitflap', 'coaster', 'beanstalk', 'foldbox', 'platformer', 'fireworks', 'mercury', 'typewriter', 'jellyfish', 'thermal', 'contortion', 'discoball',
  // round 4 (2026-10-07): 8 more faces for the HUB75 64x64 panel
  'zensand', 'murmuration', 'dominoes', 'gearworks', 'frogzilla', 'bubbles', 'skywriter', 'gobbler',
  // round 3 (2026-10-06): 14 faces for the HUB75 64x64 panel and the ESP32-S3-Matrix
  'laserlab', 'snowglobe', 'atelier', 'vectorcade', 'inkwell', 'metro', 'pinball', 'papercut',
  'sandcastle', 'marblerun', 'voxel', 'lighthouse', 'hourglass', 'tamago',
  // round 2 (2026-10-06): 15 faces, one for every layout that had none
  'origami', 'bookshelf', 'boogiewoogie', 'lightcycle', 'molecule', 'kite', 'slalom', 'lantern',
  'bowling', 'frogger', 'copperplate', 'flipbook', 'lancet', 'butterfly', 'trillium',
  // round 1 (2026-10-05): 16 faces, one per layout idea, parallel agents
  'snowflake', 'mandala', 'prism', 'volcano', 'koi', 'island', 'porthole', 'laundromat',
  'gumball', 'rubik', 'pianola', 'rainglass', 'cuttlefish', 'mitosis', 'pizza', 'hokusai',
  // the first two
  'hive', 'neon',
  'specimen', 'chain',
];

// Fetched in parallel (one round trip, not one per design: it matters over
// a slow link), registered in KEYS order.
const DESIGNS = {};
const loaded = await Promise.allSettled(KEYS.map((key) => import(`./${key}.js`)));
loaded.forEach((r, i) => {
  const key = KEYS[i];
  if (r.status === 'rejected') return console.error(`design '${key}' failed to load and was skipped: ${r.reason?.message ?? r.reason}`);
  if (!r.value.default?.frame) return console.error(`design '${key}' failed to load and was skipped: no default export with a frame() function`);
  DESIGNS[key] = r.value.default;
});

export default DESIGNS;
