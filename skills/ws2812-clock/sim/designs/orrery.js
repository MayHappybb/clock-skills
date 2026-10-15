// Orrery: a brass planetarium machine, raytraced live on 128x128. Nothing on
// it is a digit. The planets ARE the hands: a blue world on a short arm
// circles once in 12 hours (hour), a ringed giant on a long arm once an hour
// (minute), and the world's little moon once a minute (seconds). Each arm
// carries a pointer to the engraved brass chapter ring, the way real orreries
// point at a zodiac ring. The sun on the central column lights everything:
// planets show phases, arms and planets throw shadows across the enamel.
// Minute: the gear train ticks, the arm glides one tooth on a damped spring
// and the engraving under its pointer fills with light. Hour: the machine
// strikes, one chime ring per hour rolling out from the sun, each lighting
// the next hour stud around the dial, while the view swings to show depth.
import * as kit from '../js/kit.js';
import { scene } from './orrery-scene.js';

export default {
  name: 'Orrery',
  blurb: 'a raytraced brass orrery: a world (hour), a ringed giant (minute) and a moon (second) are the hands; on the hour it strikes, chime rings counting the hour round the dial',
  layouts: ['hub-2x2'], look: 'smoke', fps: 60, brightness: 0.5, dither: false,
  frame(ctx) { scene(ctx); },
};
