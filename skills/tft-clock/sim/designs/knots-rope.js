// Rope geometry for 'knots': centre-line paths (polyline + corner cutting),
// resampled by arc length, and a stamping rasteriser that turns a knot (one
// or more strands) into lists of pixels. Each rope pixel keeps its strand,
// its arc length s along that strand and its lay coordinate q (arc length
// plus twist across the rope), and a groove threshold th: at run time a
// pixel is ink when ((q + phase) & 63) >= th. Crossings are real: a pass
// painted later (higher z, then later s) lies over, and cuts a 1-px ground
// keyline into the pass under it. All of this runs once, at load: on the
// device the results are flash tables.

/** Corner-cut a polyline (Chaikin), keeping the ends. Points: [x, y, z]. */
export function chaikin(pts, iters = 3) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const o = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, a[2] ?? 0]);
      o.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, b[2] ?? 0]);
    }
    o.push(p[p.length - 1]);
    p = o;
  }
  return p;
}

/** Resample a dense polyline at a fixed arc-length step: flat arrays and the length L. */
export function resample(P, step) {
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum[cum.length - 1];
  const n = Math.max(2, Math.round(L / step) + 1);
  const x = new Float32Array(n), y = new Float32Array(n), tx = new Float32Array(n), ty = new Float32Array(n),
    s = new Float32Array(n), z = new Int8Array(n);
  let j = 1;
  for (let i = 0; i < n; i++) {
    const d = (L * i) / (n - 1);
    while (j < P.length - 1 && cum[j] < d) j++;
    const a = P[j - 1], b = P[j], seg = cum[j] - cum[j - 1] || 1, u = Math.min(1, Math.max(0, (d - cum[j - 1]) / seg));
    x[i] = a[0] + (b[0] - a[0]) * u; y[i] = a[1] + (b[1] - a[1]) * u;
    const dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1;
    tx[i] = dx / dl; ty[i] = dy / dl; s[i] = d; z[i] = (u < 0.5 ? a[2] : b[2]) ?? 0;
  }
  return { x, y, tx, ty, s, z, n, L };
}

// ------------------------------------------------------------ stamping

const MAXB = 64 * 80;
const ST = new Uint8Array(MAXB);       // 0 empty, 1 rope, 2 keyline / moat
const SS = new Float32Array(MAXB);     // s of the pass that owns the pixel
const SV = new Float32Array(MAXB);     // offset across the rope
const SO = new Int8Array(MAXB);        // owning strand

/**
 * Rasterise strands (resampled) into a w x h box at the origin. R: rope
 * radius; moat: ring width kept clear round the rope; lay: { P period px,
 * twist, lw groove width px, shade extra groove on the shadow side }.
 * Returns typed arrays (offsets inside the box):
 *   rope: x, y, k (strand), s (arc length x4), q, th
 *   moat: mx, my, mk, ms
 */
export function stamp(strands, R, w, h, lay, moat = 2) {
  const N = w * h;
  ST.fill(0, 0, N);
  const reach = R + 1 + moat, R2 = R + 1.15;
  const order = [];
  for (let k = 0; k < strands.length; k++) {
    const st = strands[k];
    for (let i = 0; i < st.n; i++) order.push([st.z[i], k, i]);
  }
  order.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const win = 0.6;
  for (const [, k, i] of order) {
    const st = strands[k];
    const cx = st.x[i], cy = st.y[i], tx = st.tx[i], ty = st.ty[i], s = st.s[i];
    const first = i === 0, last = i === st.n - 1;
    const x0 = Math.max(0, Math.floor(cx - reach)), x1 = Math.min(w - 1, Math.ceil(cx + reach));
    const y0 = Math.max(0, Math.floor(cy - reach)), y1 = Math.min(h - 1, Math.ceil(cy + reach));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
        const al = dx * tx + dy * ty;
        const j = py * w + px;
        if (al > win || al < -win) {
          // beyond a cut end: only the moat rounds it
          if ((first && al < -win) || (last && al > win)) {
            if (ST[j] === 0 && dx * dx + dy * dy <= reach * reach) { ST[j] = 2; SS[j] = s; SO[j] = k; }
          }
          continue;
        }
        const v = -dx * ty + dy * tx;
        const av = v < 0 ? -v : v;
        if (av > reach) continue;
        if (av <= R) {
          ST[j] = 1; SS[j] = s + al; SV[j] = v; SO[j] = k;
        } else if (av <= R2) {
          if (ST[j] === 1) {
            const ds = Math.abs(SS[j] - s);
            if (SO[j] !== k || ds > 2 * R + 2.5) { ST[j] = 2; SS[j] = s; SO[j] = k; }
          } else if (ST[j] === 0) { ST[j] = 2; SS[j] = s; SO[j] = k; }
        } else if (ST[j] === 0) { ST[j] = 2; SS[j] = s; SO[j] = k; }
      }
    }
  }
  let n = 0, mn = 0;
  for (let j = 0; j < N; j++) { if (ST[j] === 1) n++; else if (ST[j] === 2) mn++; }
  const out = {
    n, x: new Uint8Array(n), y: new Uint8Array(n), k: new Uint8Array(n), s: new Uint16Array(n),
    q: new Int16Array(n), th: new Uint8Array(n),
    mn, mx: new Uint8Array(mn), my: new Uint8Array(mn), mk: new Uint8Array(mn), ms: new Uint16Array(mn),
    L: strands.map((st) => st.L),
  };
  const k64 = 64 / lay.P;
  let a = 0, b = 0;
  for (let j = 0; j < N; j++) {
    const px = j % w, py = (j / w) | 0;
    if (ST[j] === 1) {
      const s = Math.max(0, SS[j]), v = SV[j];
      out.x[a] = px; out.y[a] = py; out.k[a] = SO[j]; out.s[a] = Math.round(s * 4);
      out.q[a] = Math.round((s + lay.twist * v) * k64);
      // the groove is wider at the rim and on the shadow side: the rope reads round
      const av = Math.abs(v) / R;
      const t = lay.lw + (av > 0.7 ? lay.rim : 0) + (v > 0 ? lay.shade * (v / R) : 0);
      out.th[a] = Math.max(0, Math.min(64, Math.round(t * k64)));
      a++;
    } else if (ST[j] === 2) {
      out.mx[b] = px; out.my[b] = py; out.mk[b] = SO[j]; out.ms[b] = Math.round(Math.max(0, SS[j]) * 4); b++;
    }
  }
  return out;
}

/**
 * The knot-diagram lead: the centre line as dashes, two pixels wide, each
 * pixel with its strand, s (x4) and a rank for even appear / dissolve.
 */
export function lead(strands, w, h, dash = 5, on = 3) {
  const seen = new Uint8Array(w * h);
  const xs = [], ys = [], ks = [], ss = [], rk = [];
  for (let k = 0; k < strands.length; k++) {
    const st = strands[k];
    for (let i = 0; i < st.n; i++) {
      if (st.s[i] % dash >= on) continue;
      const x0 = Math.floor(st.x[i] - 0.5), y0 = Math.floor(st.y[i] - 0.5);
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const x = x0 + dx, y = y0 + dy;
        if (x < 0 || y < 0 || x >= w || y >= h || seen[y * w + x]) continue;
        seen[y * w + x] = 1;
        xs.push(x); ys.push(y); ks.push(k); ss.push(Math.round(st.s[i] * 4));
        // rank by dash, so a dash appears and goes as one piece
        const d = Math.floor(st.s[i] / dash);
        rk.push(((Math.imul(d * 7 + k * 131 + 17, 0x9e3779b1) >>> 0) >>> 24));
      }
    }
  }
  return { n: xs.length, x: Uint8Array.from(xs), y: Uint8Array.from(ys), k: Uint8Array.from(ks), s: Uint16Array.from(ss), r: Uint8Array.from(rk) };
}
