// The room for the Birthday face: a two-tier cake on a gold board, on a wooden
// table, in front of a papered wall. Ray-cast once per pixel with a slightly
// downward orthographic camera, so every pixel knows its 3D position, normal,
// colour and gloss; candle light is then cheap to apply each frame.
import * as kit from '../js/kit.js';

export const W = 128, H = 128;
export const TILT = 24 * Math.PI / 180, SA = Math.sin(TILT), CA = Math.cos(TILT);
export const CY = 96;                                    // screen y of the world origin
/** World (X right, Y up, Z toward the viewer) to screen. */
export const sx = (X) => 64 + X;
export const sy = (Y, Z) => CY - Y * CA + Z * SA;

export const BOARD = { R: 63, Y0: 0, Y1: 2.5 };
export const LOW = { R: 55, Y0: 2.5, Y1: 25 };
export const UP = { R: 33, Y0: 25, Y1: 47 };
const TABLE_BACK = -70, WALL_Z = -70;

const lin = kit.hex;
const DRIPW = lin('#a89480'), CREAM = lin('#3e1f10'), PINK = lin('#f07aa8'), CHOC = lin('#4a2414'), WHITE = lin('#f6efe4'), GLAZE = lin('#5a2c16');
const GOLD = lin('#a87c34'), WOOD = lin('#5a361c'), WOOD2 = lin('#3c2210'), WALL = lin('#4a3048'), WALL2 = lin('#5c3e58');
const SPR = [lin('#ff5a8a'), lin('#ffd23c'), lin('#5ac8ff'), lin('#7ee06a'), lin('#ffffff'), lin('#b98cff')];

const T_NONE = 0, T_WALL = 1, T_TABLE = 2, T_BOARD = 3, T_CAKE = 4;

/**
 * Per pixel: type, position P (3), normal N (3), albedo A (3), gloss g
 * (0 matte .. 1 mirror-ish) and `amb`, how much room light it takes.
 */
export function buildScene() {
  const n = W * H;
  const P = new Float32Array(3 * n), N = new Float32Array(3 * n), A = new Float32Array(3 * n);
  const G = new Float32Array(n), type = new Uint8Array(n);
  for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
    const p = gy * W + gx;
    const X = gx + 0.5 - 64, h = CY - (gy + 0.5);
    const Oy = h * CA, Oz = -h * SA;               // ray P(t) = (X, Oy - t SA, Oz - t CA)
    let best = 1e9, hit = null;
    const tryHit = (t, kind, data) => { if (t < best) { best = t; hit = [kind, data]; } };
    // horizontal disks
    for (const [c, kind] of [[UP, 'upTop'], [LOW, 'lowTop'], [BOARD, 'boardTop']]) {
      const t = (Oy - c.Y1) / SA, Z = Oz - t * CA;
      if (X * X + Z * Z <= c.R * c.R) tryHit(t, kind, Z);
    }
    // cylinder fronts
    for (const [c, kind] of [[UP, 'upSide'], [LOW, 'lowSide'], [BOARD, 'boardSide']]) {
      if (Math.abs(X) > c.R) continue;
      const Z = Math.sqrt(c.R * c.R - X * X), t = (Oz - Z) / CA, Y = Oy - t * SA;
      if (Y >= c.Y0 && Y <= c.Y1) tryHit(t, kind, Z);
    }
    { const t = Oy / SA, Z = Oz - t * CA; if (Z >= TABLE_BACK && Z < 120) tryHit(t, 'table', Z); }
    { const t = (Oz - WALL_Z) / CA, Y = Oy - t * SA; if (Y >= 0) tryHit(t, 'wall', Y); }
    if (!hit) continue;
    const Y = Oy - best * SA, Z = Oz - best * CA;
    P[3 * p] = X; P[3 * p + 1] = Y; P[3 * p + 2] = Z;
    let nx = 0, ny = 1, nz = 0, col = CREAM, g = 0, ty = T_CAKE;
    const kind = hit[0];
    const r = Math.hypot(X, Z), th = Math.atan2(Z, X);
    if (kind === 'wall') {
      ty = T_WALL; nx = 0; ny = 0; nz = 1;
      const stripe = kit.fract(X / 10) < 0.5;
      col = stripe ? WALL : WALL2;
      if (Y < 4) col = lin('#3a2a2a');            // skirting
    } else if (kind === 'table') {
      ty = T_TABLE;
      const grain = kit.noise2(X * 0.04, Z * 0.6) * 0.6 + kit.noise2(X * 0.3, Z * 2) * 0.4;
      col = kit.mix(WOOD2, WOOD, grain);
      if (kit.fract((Z + 200) / 22) < 0.04) col = kit.scale(WOOD2, 0.4);   // plank joint
      g = 0.6;
    } else if (kind === 'boardTop' || kind === 'boardSide') {
      ty = T_BOARD; col = GOLD; g = 0.9;
      if (kind === 'boardSide') { nx = X / BOARD.R; ny = 0; nz = Z / BOARD.R; col = kit.scale(GOLD, 0.8); }
      else if (r > BOARD.R - 1.2) col = kit.scale(GOLD, 1.15);
    } else if (kind === 'lowSide' || kind === 'upSide') {
      const c = kind === 'lowSide' ? LOW : UP;
      nx = X / c.R; ny = 0; nz = Z / c.R;
      const arcLen = th * c.R;
      if (kind === 'lowSide') {
        col = CREAM;
        // piped garland swags and rosettes
        const sw = Math.abs(Math.sin(arcLen / 7.5));
        const yg = c.Y1 - 6.5 - 5.5 * sw;
        if (Math.abs(Y - yg) < 0.95) col = PINK;
        if (sw < 0.22 && Math.abs(Y - (c.Y1 - 6.8)) < 1.6) col = kit.mix(PINK, WHITE, 0.25);
      } else {
        col = CHOC; g = 0.45;
        // white chocolate drips
        const k = Math.floor(arcLen / 3.2), f = kit.fract(arcLen / 3.2);
        const len = 2.5 + 9 * kit.hash(k, 7) ** 1.6, len2 = 2.5 + 9 * kit.hash(k + 1, 7) ** 1.6;
        const L = kit.lerp(len, len2, kit.smoothstep(0, 1, f));
        const bulb = 0.9 * Math.sin(Math.PI * f) ** 2;
        if (Y > c.Y1 - L - bulb * (L > 6 ? 1 : 0)) { col = DRIPW; g = 0.55; }
      }
      // piped shell beads on the base and top rims
      for (const [ym, dir] of [[c.Y0, 1], [c.Y1, -1]]) {
        const s = (Y - ym) * dir;                  // 0 at the rim, rising into the side
        if (s < 3.2) {
          const ph = kit.fract(arcLen / 4.2), sc = 0.72 + 0.28 * Math.sin(Math.PI * ph);
          const q = (s - 1.6) / (1.6 * sc);
          if (Math.abs(q) < 1) {
            const up = -q * dir;                      // the bead's surface tilts up at the top of the bead
            const cs = Math.sqrt(1 - q * q);
            nx = (X / c.R) * cs; nz = (Z / c.R) * cs; ny = up;
            col = kind === 'lowSide' ? (dir > 0 ? WHITE : PINK) : WHITE;
            g = 0.2;
          }
        }
      }
    } else if (kind === 'lowTop' || kind === 'upTop') {
      const c = kind === 'lowTop' ? LOW : UP;
      col = GLAZE; g = 0.8;
      // sprinkles: little rods scattered on the top
      const cx = Math.floor(X / 2.2), cz = Math.floor(Z / 2.2);
      const hsh = kit.hash(cx, cz, kind === 'lowTop' ? 3 : 5);
      if (hsh < 0.1 && r < c.R - 3) { col = SPR[Math.floor(hsh * 100) % SPR.length]; g = 0.3; }
      // the inner rim of the lower top sits under the upper tier's beads
      if (r > c.R - 2.6) {                          // the top of the piped edge
        const q = (r - (c.R - 1.3)) / 1.3;
        nx = (X / r) * q; nz = (Z / r) * q; ny = Math.sqrt(Math.max(0, 1 - q * q));
        col = kind === 'lowTop' ? PINK : WHITE;
      }
    }
    const nl = Math.hypot(nx, ny, nz) || 1;
    N[3 * p] = nx / nl; N[3 * p + 1] = ny / nl; N[3 * p + 2] = nz / nl;
    A[3 * p] = col[0]; A[3 * p + 1] = col[1]; A[3 * p + 2] = col[2];
    G[p] = g; type[p] = ty;
  }
  return { P, N, A, G, type };
}
