// Mandelbrot — an endless dive into the edge of the set, as a fragment shader.
//
// There is no GPU here, but a fragment shader is only a function of
// (x, y, time) evaluated once per pixel, and that is exactly what frame() can
// be. So this face is the classic fractal shader: the Mandelbrot escape-time
// field, computed per pixel, dithered onto the 1-bit glass.
//
// The camera. It dives at one point on the boundary of the set — a
// Misiurewicz point in the seahorse valley, where the boundary is a nest of
// spirals at every scale — so that whatever the zoom, there is always
// structure in the frame and never a blank. Over a loop the window shrinks
// 3500-fold, while the view turns once about the point: the dive is a slow
// spiral, not a straight drop. Then it rises back out.
//
// u = t / LOOP, wrapped to [0, 1), drives all of it. depth = (1 - cos 2*pi*u)/2
// is 0 at u = 0 and 1 at u = 0.5, so the window is widest at the ends and
// deepest in the middle; its zoom rate peaks at u = 0.25 and 0.75 and is
// exactly zero at the ends, so the turnaround is a glide, not a bounce. The
// exponent 0.7 rushes the camera away from the wide end, so the loop is deep
// and busy for most of its length. The window also orbits its point a quarter
// of a window wide, three times a loop: the point being dived at would
// otherwise sit at one place on the glass all loop and take the wear.
//
// Every one of those is a smooth function of u with period 1, so t and
// t + LOOP give the same frame to the last bit — the loop is seamless by
// construction, with no crossfade and nothing to jump. It never ends and has
// no clock in it: at any t the picture is complete.
//
// What is drawn is the distance to the boundary, not the iteration count, and
// that is the whole design. Raw escape counts are useless here: a few thousand
// times in, every pixel sits within a pixel of the boundary and its count is
// enormous everywhere, so a picture painted from it is uniform mush. The count
// does carry a distance, through the standard estimator
//
//     d = |z_n| * log|z_n| / |z'_n|      (z' the running derivative, 2 z z' + 1)
//
// in plane units; divided by the pixel pitch it is a distance in pixels, and
// that is scale-free — zoom in and the number attached to a pixel barely
// moves. Its level lines are loci of constant distance from the boundary
// measured in pixels, so the composition holds at every scale while the
// fractal detail streams through it. That is the dive: the shape is stable
// and the ground is flowing.
//
// Two things are lit, out of that number s = log2(dPix). The shore is solid
// light within about a pixel and a half of the boundary, letting go over the
// next octave — the set drawn rather than shaded, and the reason the filaments
// of the deep frames stay crisp instead of blurring into dust. Outside it, the
// bands: rings of constant s, spaced evenly in octaves of approach so they
// never thin out or thicken as the window shrinks, fading into the water. A
// hairline of black is kept at the very boundary itself (the sub-pixel core),
// because nearer than a fraction of a pixel there is no picture, only the
// dither's average, and lighting it would wash the glass out at the deep end.
//
// The dark is free, and most of the glass is dark: the set's own body is no
// light at all, the far water is no light at all, and only the lace along the
// shore is lit. Over the loop the average is about 12% of the glass.
//
// Cost is bounded by the same idea, and paid for elsewhere. A pixel that has
// not escaped by the top of the drawn band is black whatever it does next, so
// the iteration loop stops at a cap read off the camera each frame — but the
// cap has to stay high (the deep frames are black, not poor, if it is cut),
// and 8192 rays at that cap is more than JavaScript will do in a millisecond.
// So the field is sampled once per two rows and the sample covers both. Every
// other row of a sample's grey is the dither's business anyway, the dither is
// applied per screen pixel below, and it costs only some crispness in the
// finest filaments: at full resolution the same frame takes 3.0 ms on average
// and 4.8 ms at the deepest point, against 1.5 and 2.4 for this.
//
// Nothing on the glass is fixed — the picture is new and moving every frame,
// and the window's orbit keeps even the point being dived at from settling —
// so no pixel is lit for more than half the loop, and the panel dims at night.

const W = 128, H = 64, SPX = 1, SPY = 2, TAU = Math.PI * 2;
const ASPECT = W / H;                       // the window is twice as wide as tall
const LN2 = Math.LN2;

// ------------------------------------------------------------ the camera
const CX = -0.7436438870371587;             // a Misiurewicz point in the
const CY = 0.1318259042053119;              // seahorse valley
const LOOP = 20;                            // seconds for one dive and return
const PHASE = 0.25;                         // start the loop where it moves fastest
const W0 = 0.045;                           // window half-height, shallowest
const W1 = 1.3e-5;                          // ... and at the deepest point
const LR = Math.log(W1 / W0);               // log of the whole zoom range
const TURNS = 1;                            // rotations of the view per loop
const ORB_R = 0.24, ORB_N = 3;              // orbit of the window per loop

// ------------------------------------------------------------ the shading
// s = log2(distance to the boundary / pixel pitch). SH..SH+SW is the shore,
// which lets go from solid to nothing over that many octaves; D0..D1 is the
// sub-pixel core, dark again; the bands are ridges BANDS apart in octaves,
// LWD wide, decaying by G2 per octave and gone by R1.
const SH = -0.1, SW = 0.95, KSW = 1 / SW;
const D0 = -2.9, D1 = -1.1, KD = 1 / (D1 - D0);
const R0 = 2.2, R1 = 4.0, KR = 1 / (R1 - R0);
const G2 = 0.50;
const BANDS = 0.45, LWD = 0.22;
const COAST = 1.0;
const CAP0 = 44, CAP1 = 150;                // iteration budget, shallow .. deep

const sm = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export default {
  name: 'Mandelbrot',
  blurb: 'An endless spiral dive into the Mandelbrot set: distance-to-the-boundary bands dithered into 1-bit filigree, looping seamlessly.',
  module: '096-128x64',
  colour: 'white',
  bus: 'spi10',
  fps: 60,
  driver: 'full',

  frame(g, { t, oled, night }) {
    // --- the camera for this instant. u is periodic: u(t) === u(t + LOOP).
    let u = (t / LOOP + PHASE) % 1;
    if (u < 0) u += 1;
    const depth = (0.5 * (1 - Math.cos(TAU * u))) ** 0.7;   // 0 shallow, 1 deep
    const hh = W0 * Math.exp(LR * depth);               // window half-height
    const th = TAU * TURNS * u;                         // view rotation
    const ct = Math.cos(th), st = Math.sin(th);
    const cap = Math.round(CAP0 + (CAP1 - CAP0) * depth);
    const inv = H / (2 * hh);                           // plane distance -> pixels

    // The orbit of the window about the dive point (see the note above)
    const oa = ORB_R * hh, op = TAU * ORB_N * u;
    const ovx = oa * Math.sin(op), ovy = oa * Math.sin(op + 2.1);
    const ox = ovx * ct - ovy * st, oy = ovx * st + ovy * ct;

    // Per-axis plane step, and the window centre offset per row
    const wx = ct * hh * ASPECT, wy = st * hh * ASPECT;
    const lev = new Float32Array(W * H);

    // The field, one sample per SPX x SPY block of pixels (see the note at
    // the head of the file).
    for (let y = 0; y < H; y += SPY) {
      const ay = ((y + SPY * 0.5) / H - 0.5) * 2;
      const bx = CX + ox - st * hh * ay, by = CY + oy + ct * hh * ay;
      for (let x = 0; x < W; x += SPX) {
        const ax = ((x + SPX * 0.5) / W - 0.5) * 2;
        const cx = bx + wx * ax, cy = by + wy * ax;
        let o = y * W + x;

        // --- escape time, and the derivative the distance needs
        let zx = 0, zy = 0, dx = 0, dy = 0, n = 0, r2 = 0;
        while (n < cap) {
          const x2 = zx * zx, y2 = zy * zy;
          r2 = x2 + y2;
          if (r2 > 1024) break;
          const ndx = 2 * (zx * dx - zy * dy) + 1;
          const ndy = 2 * (zx * dy + zy * dx);
          zy = 2 * zx * zy + cy;
          zx = x2 - y2 + cx;
          dx = ndx; dy = ndy;
          n++;
        }
        if (n >= cap) continue;                 // the set's body: black

        // --- distance to the boundary, in pixels, then in octaves
        const r = Math.sqrt(r2);
        const dm = r * Math.log(r) / Math.sqrt(dx * dx + dy * dy);
        const s = Math.log(dm * inv) / LN2;

        // The sub-pixel core goes dark: nearer than a fraction of a pixel
        // there is no picture, only the dither's average, and lighting it
        // would wash the glass out at the deep end of the dive.
        const deep = s >= D1 ? 1 : s <= D0 ? 0 : sm((s - D0) * KD);
        if (deep <= 0) continue;

        // The shore: solid light within a pixel of the boundary, letting go
        // over the next octave. The set drawn, not shaded.
        let v = 0;
        if (s < SH + SW) {
          const c = s <= SH ? 1 : 1 - sm((s - SH) * KSW);
          v = COAST * c * deep;
        }
        // The bands: rings of constant distance from the boundary, fading
        // into the water. They are pinned to the shore, so the picture's
        // composition holds while the fractal streams through it.
        let env = (s < SH ? 1 : Math.exp(-(s - SH) * G2)) * deep;
        if (s > R0) env *= 1 - sm((s - R0) * KR);
        const ph = s * BANDS;
        let fq = ph - Math.floor(ph);
        if (fq > 0.5) fq = 1 - fq;
        const ring = fq >= LWD ? 0 : 1 - sm(fq / LWD);
        const rr = env * ring;
        if (rr > v) v = rr;
        if (v > 0) {
          for (let sy = 0; sy < SPY; sy++)
            for (let sx = 0; sx < SPX; sx++) lev[o + sy * W + sx] = v;
        }
      }
    }

    g.fillWhere((px, py, ix, iy) => lev[iy * W + ix]);

    oled.contrast(0xcf + (0x14 - 0xcf) * night);
  },
};
