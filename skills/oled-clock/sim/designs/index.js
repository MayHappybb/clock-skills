// Design registry. Every key here is renderable by name from the CLI and the
// browser:  node tools/render.mjs <key>
//
// To add a design, put `<key>.js` in this directory and add its key below.
// Designs are loaded one by one, so a design that fails to load (a syntax
// error, a missing export) is reported and skipped instead of taking every
// tool down with it.

const KEYS = [
  // round 15 (2026-10-18): 6 more faces
  'jenga', 'selectric', 'pez', 'newton', 'scissors', 'bubblegum',
  // round 14 (2026-10-18): 10 more faces
  'wiper', 'rotary', 'armillary', 'coinpusher', 'bricks', 'beadmaze', 'cards', 'icecubes', 'jackbox', 'toaster',
  // round 13 (2026-10-16): 8 faces, 'unleash all your creativity'
  'stringart', 'xray', 'ropeknot', 'galton', 'cootie', 'labyrinth', 'plasticine', 'spintops',
  // round 12 (2026-10-04): 4 real-3D faces, after cube
  'kineticrain', 'trivision', 'balloon', 'ribbon',
  // round 11 (2026-10-04): 8 opus faces, imaginative + fluent + designed letterforms
  'ouroboros', 'glassblower', 'cloudchamber', 'mobile', 'octopus', 'acrobats', 'popcorn', 'eightball',
  // round 10 (2026-10-04): 12 opus faces, concise brief, no critic
  'musicbox', 'etchasketch', 'lemmings', 'catscradle', 'waterfall', 'tangram', 'marionette', 'fogglass', 'bonsai', 'sparkler', 'soapfilm', 'kaiten',
  // round 9 (2026-10-03): pure animations — CPU "fragment shaders", no clock
  'mandelbrot', 'attractor', 'flow', 'nebula',
  // round 8 (2026-10-03): CPU "fragment shaders" — per-pixel procedural fields
  'raymarch', 'plasma', 'metaballs', 'turing',
  // round 7 (2026-10-03): 20 new faces, paired subagents
  'soroban', 'sliderule', 'spiderweb', 'dandelion', 'vault', 'pinball',
  'clepsydra', 'cuckoo', 'press', 'turntable', 'constellation', 'aurora',
  'goban', 'morse', 'honeycomb', 'zen', 'fireworks', 'ferris',
  'locomotive', 'potter',
  // round 6 (2026-10-03): model comparison, concise brief
  'chladni-opus5', 'automaton-opus5', 'chladni-sonnet5', 'automaton-sonnet5', 'chladni-haiku45', 'automaton-haiku45', 'chladni-ds', 'automaton-ds', 'harmonograph-ds', 'pinart-ds', 'popup-ds', 'loom-ds', 'beach-ds', 'ants-ds', 'marbling-ds', 'zoetrope-ds',
  // round 5 (2026-10-03): creativity-first brief
  'kinetic', 'shadow', 'chladni', 'automaton',
  // round 4 (2026-10-03): transitions are the point
  'blackhole', 'warp', 'shatter', 'origami', 'smoke', 'burn', 'ferrofluid',
  'magnet', 'murmuration', 'fireflies', 'life', 'matrix', 'ripple',
  'snowglobe', 'glitch', 'demoscene', 'kaleidoscope', 'spectrum', 'tesla', 'cube',
  // round 3 (2026-10-02)
  'f91w', 'gameandwatch', 'tourbillon', 'ressence', 'urwerk', 'contour',
  'scope', 'radar', 'luna', 'jellyfish', 'hanzi', 'typewriter', 'nixie',
  'skyline', 'pacman', 'tamagotchi', 'sand', 'marble', 'fibonacci', 'domino',
  'neon',
  'numberfolk',
  'truchet',
  'mercury',
  'brush',
  'stringart',
  'opart',
  'extrude',
  'frog',
  'kitcat',
  'invaders',
  'dino',
  'tetris',
  'flip',
  'watch',
  'aquarium',
  'reel',
  'tape',
  'classic',
  'specimen',
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
