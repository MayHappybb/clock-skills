// Low Tide: a beach in cross-section on a 128 x 64 HUB75 pair. The four
// digits are sandcastles, the hours big on the dry sand, the minutes small at
// the water's edge, and the sea keeps the time. Each minute the tide creeps
// closer; at :00 one wave rolls in exactly as far as the digits that change,
// knocks them into slumped wet sand and draws back. A crab with a bucket
// builds the new digit out of drums and walls, then plants the flag. On the
// hour a big breaker curls in, washes further, the crab's family pops out of
// the burrow to help, and bunting goes up. The sun or moon (true phase)
// crosses the sky by the time of day, lighting the towers like cylinders; at
// night the windows glow and the crab sleeps in its burrow.
import * as kit from '../js/kit.js';
import { glyph, SIZES } from './sandcastle-font.js';
import { scene } from './sandcastle-scene.js';

export default {
  name: 'Low Tide',
  blurb: 'sandcastle digits; one wave a minute washes exactly the digits that change, a crab rebuilds them',
  layouts: ['hub-x2'], look: 'smoke', fps: 60, brightness: 0.4, dither: true,
  frame(ctx) { scene(ctx, kit, glyph, SIZES); },
};
