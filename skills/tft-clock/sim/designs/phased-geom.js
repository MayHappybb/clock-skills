// Geometry shared by 'phased' and its builder. Coordinates are pixel
// indices: pixel (x, y) is the point (x, y), so every emitter-to-pixel offset
// is a pair of integers and the propagator is a table by squared distance.

export const W = 160, H = 80, N = W * H;
export const LAMBDA = 7;                       // px: one wavelength, the crest spacing

// 240 emitters one pixel outside the glass, every 2 px round the edge
export const SOURCES = [];
for (let j = 0; j < 80; j++) SOURCES.push([2 * j + 1, -1]);          // top, left to right
for (let j = 0; j < 40; j++) SOURCES.push([160, 2 * j]);             // right, downwards
for (let j = 0; j < 80; j++) SOURCES.push([158 - 2 * j, 80]);        // bottom, right to left
for (let j = 0; j < 40; j++) SOURCES.push([-1, 79 - 2 * j]);         // left, upwards

// digit boxes [x, y, w, h]: hours, then minutes
export const SLOTS = [[8, 12, 24, 56], [40, 12, 24, 56], [96, 12, 24, 56], [128, 12, 24, 56]];
