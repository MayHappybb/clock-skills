// Design registry. Every key here is renderable by name from the CLI and the
// browser:  node tools/render.mjs <key>
//
// To add a design, put `<key>.js` in this directory and add its key below.
// Designs are loaded one by one, so a design that fails to load (a syntax
// error, a missing export) is reported and skipped instead of taking every
// tool down with it.

const KEYS = [
  // round 2026-10-16: 8 faces, 'unleash all your creativity'
  'miner', 'samurai', 'zipper', 'searchlight', 'angler', 'towercrane', 'juggler', 'pigeons',
  // round 2026-10-05: 12 faces, creativity-first brief
  'slots', 'sokoban', 'snake', 'mole', 'hamster', 'domino', 'matchstick', 'snail', 'printer', 'train', 'liondance', 'tugofwar',
  'classic', 'monolith', 'aurora', 'flipclock', 'ember', 'clone', 'focus', 'slab',
  'tide', 'hourglass', 'stack', 'dial', 'cipher', 'pong', 'chomp', 'carousel',
  'typist', 'phantom', 'invaders', 'warp', 'telegraph', 'cuckoo', 'soroban', 'frog',
  'claude', 'aquarium', 'chat', 'runner', 'garden', 'cat', 'flashcard', 'wallpaper',
  'beads', 'tally', 'pure', 'fullhouse', 'solo', 'candle', 'rocket', 'totem',
  'thermometer', 'sixteen', 'greyfrog', 'glide', 'calibrate', 'abacus', 'morse', 'moon',
  'strike', 'cradle', 'lavalamp', 'ducks', 'orrery', 'fireflies', 'dvd',
];

const DESIGNS = {};
for (const key of KEYS) {
  try {
    const mod = await import(`./${key}.js`);
    if (!mod.default?.frame) throw new Error('no default export with a frame() function');
    DESIGNS[key] = mod.default;
  } catch (err) {
    console.error(`design '${key}' failed to load and was skipped: ${err.message}`);
  }
}

export default DESIGNS;
