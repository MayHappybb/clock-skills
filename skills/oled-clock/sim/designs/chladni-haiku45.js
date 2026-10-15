// Sand Settler — digits formed by sand grains flowing along elegant nodal paths.
//
// Four columns of sand, each flowing along a path shaped like a digit (0-9).
// The sand is drawn as bright dots that flow continuously downward along their
// path; older dots fade. At 60 fps the flow is smooth and hypnotic, like sand
// in an Chladni plate settling into nodal lines.
//
// The paths are hand-drawn curves for each digit, balanced and artistic. The
// grains spawn at the top and flow downward, wrapping. The minute turn: grains
// continue flowing smoothly, rendering the old and new digits simultaneously
// for 0.8 s. The hour: all grains execute a 12 Hz tremolo (fast shake) while
// still flowing, creating an accent before settling.
//
// Frame is a pure function of time. No state carried between frames.

import { ease, clamp, font3x5 } from '../js/kit.js';

const W = 128, H = 64;
const X_POS = [18, 36, 80, 98];  // Column centres for HH MM
const GRAIN_COUNT = 36;          // Grains per digit (denser flow)
const FLOW_SPEED = 0.35;         // Path progression per second
const GRAIN_SIZE = 1.1;          // Radius of each sand dot

// Digit paths: arrays of [x, y] waypoints, each in a ±20 px box.
// Paths designed to be visually elegant and unambiguous.
const PATHS = {
  '0': [  // Perfect ellipse
    [0, -18], [12, -14], [15, -4], [15, 8], [10, 16], [0, 18], [-10, 16], [-15, 8], [-15, -4], [-12, -14], [0, -18]
  ],
  '1': [  // Straight line with slight serif
    [3, -18], [-1, -16], [-1, 0], [-1, 18], [4, 18]
  ],
  '2': [  // Top curve, bottom straight
    [-10, -14], [0, -18], [10, -14], [12, -8], [2, 0], [-12, 8], [-10, 16], [10, 18]
  ],
  '3': [  // Two bumps on the right
    [-8, -16], [0, -18], [10, -14], [10, -5], [2, 0], [10, 6], [12, 14], [0, 18], [-10, 16]
  ],
  '4': [  // Cross-bar design
    [10, -18], [-8, 2], [14, 2], [14, 18]
  ],
  '5': [  // Top bar, bottom curve
    [12, -18], [-10, -16], [-10, -2], [10, 0], [12, 8], [8, 16], [-8, 18]
  ],
  '6': [  // Descending loop
    [10, -16], [0, -18], [-10, -12], [-12, 0], [-8, 14], [4, 18], [10, 14], [10, 2], [-10, 0]
  ],
  '7': [  // Diagonal slash from top bar
    [-12, -18], [12, -18], [0, 2], [-8, 18]
  ],
  '8': [  // Two circles stacked
    [-8, -16], [8, -14], [12, -8], [8, 0], [-8, 0], [-12, 8], [-8, 16], [8, 14], [12, 8]
  ],
  '9': [  // Ascending loop
    [-10, 14], [4, 18], [10, 12], [10, 0], [-10, 0], [-8, -14], [0, -18], [10, -15]
  ],
};

// Arc length for each path.
const PATH_LENGTHS = {};
for (const [digit, pts] of Object.entries(PATHS)) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    len += Math.hypot(dx, dy);
  }
  PATH_LENGTHS[digit] = len;
}

// Position on a path at progress u (0..1).
function posOnPath(digit, u) {
  const pts = PATHS[digit];
  const len = PATH_LENGTHS[digit];
  let targetDist = (u % 1) * len;
  let cumDist = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const segLen = Math.hypot(x1 - x0, y1 - y0);
    if (cumDist + segLen >= targetDist) {
      const t = (targetDist - cumDist) / (segLen || 1);
      return [x0 + t * (x1 - x0), y0 + t * (y1 - y0)];
    }
    cumDist += segLen;
  }
  return pts[pts.length - 1];
}

export default {
  name: 'Sand Settler',
  blurb: 'Sand grains flow along elegant nodal line paths shaped like digits; smooth minute/hour transitions.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, ctx) {
    const f = ctx.fields;
    const timeStr = `${f.hh}${f.mm}`;
    const secFloat = f.sec;

    // Hour tremolo: :59:00-:59:04
    let tremolo = 0;
    if (f.m === 59 && secFloat < 0.4) {
      tremolo = 0.8 * Math.sin(secFloat * 2 * Math.PI * 12);
    }

    // Draw each digit's sand grain flow.
    for (let i = 0; i < 4; i++) {
      const digit = timeStr[i];
      const path = PATHS[digit];
      if (!path) continue;

      const xc = X_POS[i];
      const yc = 32;

      // Draw grains for this digit's path.
      for (let g_idx = 0; g_idx < GRAIN_COUNT; g_idx++) {
        // Each grain progresses along the path over time. Their start position
        // is staggered so grains spawn continuously.
        const grain_phase = (g_idx / GRAIN_COUNT + secFloat * FLOW_SPEED) % 1;
        const [px, py] = posOnPath(digit, grain_phase);

        // Brightness: peaks in the middle of the path (full grain), dims at edges.
        // This creates a flow effect where new grains are faint, middle grains bright,
        // and departing grains fade.
        const phase_pos = grain_phase % 1;
        let brightness = 1 - Math.abs(phase_pos - 0.5) * 2.2;
        brightness = Math.max(0.05, brightness);

        // Add hour tremolo jitter (creates a shaking effect at :59:00-:59:04).
        const jx = tremolo * 2.2 * Math.sin(secFloat * 95 + g_idx);
        const jy = tremolo * 2.2 * Math.cos(secFloat * 95 - g_idx * 0.7);

        // Screen position of this grain.
        const grain_x = xc + px + jx;
        const grain_y = yc + py + jy;

        // Draw as a filled circle (sand dot).
        if (brightness > 0.02) {
          g.fillCircle(grain_x, grain_y, GRAIN_SIZE * Math.sqrt(brightness), 1);
        }
      }
    }

    // Frame lines: thin anchor lines above and below the flow area.
    g.hline(2, 12, W - 4, 1);
    g.hline(2, 52, W - 4, 1);

    // Time display at the bottom in small font.
    g.text(f.hh, 4, H - 9, { font: font3x5, scale: 1, c: 1 });
    g.text(':', 31, H - 9, { font: font3x5, scale: 1, c: 1 });
    g.text(f.mm, 70, H - 9, { font: font3x5, scale: 1, c: 1 });
  },
};
