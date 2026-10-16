// Floor numbers for the tower's lift piers: 5 x 7, drawn like the stencilled
// numerals on a lift-shaft wall or a car-park pillar (squared, two-pixel
// stems, one-pixel counters), so a single lit one reads at a glance from
// across the street.
import { sprite } from '../js/kit.js';

const PICS = [
  `
   .###.
   ##.##
   ##.##
   ##.##
   ##.##
   ##.##
   .###.`,
  `
   ..##.
   .###.
   ..##.
   ..##.
   ..##.
   ..##.
   .####`,
  `
   .###.
   ##.##
   ...##
   ..##.
   .##..
   ##...
   #####`,
  `
   ####.
   ...##
   ..##.
   ...##
   ...##
   ##.##
   .###.`,
  `
   ...##
   ..###
   .#.##
   #..##
   #####
   ...##
   ...##`,
  `
   #####
   ##...
   ####.
   ...##
   ...##
   ##.##
   .###.`,
  `
   .###.
   ##...
   ####.
   ##.##
   ##.##
   ##.##
   .###.`,
  `
   #####
   ...##
   ..##.
   ..##.
   .##..
   .##..
   .##..`,
  `
   .###.
   ##.##
   ##.##
   .###.
   ##.##
   ##.##
   .###.`,
  `
   .###.
   ##.##
   ##.##
   .####
   ...##
   ...##
   .###.`,
];

/** DIGITS[d]: a 5 x 7 one-colour sprite (paint it with blit's `c`). */
export const DIGITS = PICS.map((p) => sprite(p));
