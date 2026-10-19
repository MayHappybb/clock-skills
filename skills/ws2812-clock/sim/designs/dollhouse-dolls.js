// Dollhouse: the family, drawn as wooden peg dolls by signed distance with
// coverage, so they glide between pixels. A doll is a round head on a flared
// body, painted face, dark keyline. `face`: -1 left, 1 right, 0 back turned
// (all hair), 2 front. Arms are optional capsules to a hand point, and the
// hand may hold an item.
import { W, H, inside } from './dollhouse-scene.js';

const OUT = [0.004, 0.003, 0.005];
const EYE = [0.006, 0.004, 0.004];
const CHEEK = [0.55, 0.12, 0.12];

function capD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - ax - t * dx, ey = py - ay - t * dy;
  return Math.sqrt(ex * ex + ey * ey);
}
const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function blend(img, p, c, a, L) {
  img[3 * p] += (c[0] * L - img[3 * p]) * a;
  img[3 * p + 1] += (c[1] * L - img[3 * p + 1]) * a;
  img[3 * p + 2] += (c[2] * L - img[3 * p + 2]) * a;
}

/**
 * Doll fields (monomorphic): x, y (feet), h (height), hr (head radius),
 * wt, wb (body half-width at top / bottom), dress, hair, skin, face, hairStyle
 * (0 short, 1 bun, 2 pigtails, 3 tuft), asleep, lean (head x offset),
 * arm (0/1), hx, hy (hand), arm2 (0/1), h2x, h2y, item (0 none, 1 sponge,
 * 2 crayon, 3 cake), itemCol, lying (0/1).
 */
export function drawDoll(img, light, d) {
  const lit = (p) => { const v = 0.4 + 0.3 * light[p]; return v > 0.95 ? 0.95 : v; };
  if (d.lying) return drawLying(img, light, d, lit);
  const top = d.y - d.h + 2 * d.hr, hcx = d.x + d.lean, hcy = top - d.hr + 0.6;
  const shY = top + 1.5;
  const x0 = Math.floor(Math.min(d.x - d.wb, hcx - d.hr, d.arm ? d.hx : 1e9, d.arm2 ? d.h2x : 1e9) - 3);
  const x1 = Math.ceil(Math.max(d.x + d.wb, hcx + d.hr, d.arm ? d.hx : -1e9, d.arm2 ? d.h2x : -1e9) + 3);
  const y0 = Math.floor(Math.min(hcy - d.hr - (d.hairStyle === 1 ? 3 : 1), d.arm ? d.hy : 1e9, d.arm2 ? d.h2y : 1e9) - 3);
  const y1 = Math.ceil(d.y + 2);
  const f = d.face, ex = f === 2 ? 0 : f * d.hr * 0.32;
  for (let py = y0; py <= y1; py++) {
    if (py < 0 || py >= H) continue;
    for (let px = x0; px <= x1; px++) {
      if (!inside(px, py)) continue;
      // body: a flared peg, rounded shoulders
      const t = cl((py - top) / (d.y - top)), hw = d.wt + (d.wb - d.wt) * t;
      let db = Math.max(Math.abs(px - d.x) - hw, top - py, py - d.y);
      const dsh = Math.hypot(px - d.x, py - (top + d.wt)) - d.wt - 0.3;
      if (py < top + d.wt) db = Math.min(Math.max(db, dsh), dsh);
      const dh = Math.hypot(px - hcx, py - hcy) - d.hr;
      let dx2 = 1e9;
      if (d.hairStyle === 1) dx2 = Math.hypot(px - (hcx - f * d.hr * 0.55 * (f === 2 ? 0 : 1)), py - (hcy - d.hr - 0.4)) - d.hr * 0.5;
      else if (d.hairStyle === 2) dx2 = Math.min(Math.hypot(px - (hcx - d.hr - 0.6), py - hcy) - 1.6, Math.hypot(px - (hcx + d.hr + 0.6), py - hcy) - 1.6);
      let da = 1e9, da2 = 1e9;
      if (d.arm) da = capD(px, py, d.x + Math.sign(d.hx - d.x || 1) * (d.wt - 0.5), shY, d.hx, d.hy) - 1.15;
      if (d.arm2) da2 = capD(px, py, d.x + Math.sign(d.h2x - d.x || 1) * (d.wt - 0.5), shY, d.h2x, d.h2y) - 1.15;
      let di = 1e9;
      if (d.item === 1 && d.arm) di = Math.max(Math.abs(px - d.hx) - 2.2, Math.abs(py - d.hy) - 1.6);
      else if (d.item === 2 && d.arm) di = capD(px, py, d.hx, d.hy, d.hx + 1.4, d.hy - 2.6) - 0.9;
      const dm = Math.min(db, dh, dx2, da, da2, di);
      if (dm > 1.6) continue;
      const p = py * W + px, L = lit(p);
      blend(img, p, OUT, cl(1.6 - dm), 1);
      const ain = cl(0.5 - dm);
      if (ain <= 0) continue;
      let c;
      if (dm === di) c = d.itemCol;
      else if (dm === da || dm === da2) c = d.dress;
      else if (dm === dx2) c = d.hair;
      else if (dm === dh) {
        // head: hair cap, painted face
        const rx = (px - hcx) / d.hr, ry = (py - hcy) / d.hr;
        let hairy = ry < -0.25 + (d.hairStyle === 3 ? 0.15 : 0) || f === 0;
        if (f === 1 || f === -1) hairy = hairy || rx * f < -0.35;
        if (d.hairStyle === 3 && ry < -0.25) hairy = Math.abs(rx) < 0.45 || ry < -0.7;
        c = hairy ? d.hair : d.skin;
        if (!hairy) {
          for (const s of [-1, 1]) {
            const exx = hcx + ex + s * d.hr * 0.38, eyy = hcy + d.hr * 0.12;
            const de = d.asleep ? (Math.abs(py - eyy - 0.3) < 0.55 && Math.abs(px - exx) < 0.9 ? 0 : 9) : Math.hypot(px - exx, py - eyy) - 0.55;
            if (de < 0.6) { c = EYE; break; }
            const dc = Math.hypot(px - (exx + s * d.hr * 0.2), py - (hcy + d.hr * 0.55));
            if (dc < 0.9) c = [c[0] * 0.6 + CHEEK[0] * 0.4, c[1] * 0.6 + CHEEK[1] * 0.4, c[2] * 0.6 + CHEEK[2] * 0.4];
          }
        }
      } else {
        // body: dress with a pale collar band
        c = d.dress;
        if (py - top < 1.6) c = [c[0] * 0.5 + 0.25, c[1] * 0.5 + 0.22, c[2] * 0.5 + 0.2];
        else if (Math.abs(px - d.x) > hw - 1.1) c = [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6];
      }
      blend(img, p, c, ain, L);
    }
  }
}

/** A doll lying on her front (reading on the bed), feet kicking. */
function drawLying(img, light, d, lit) {
  const len = d.h, x0 = d.x - len / 2, y = d.y;           // x: body centre, y: underside
  const hcx = x0 + d.hr, hcy = y - d.hr - 0.2;
  const kick = d.lean;                                    // -1..1 leg swing
  const fx = x0 + len - 2, fy = y - 2;
  for (let py = Math.floor(y - 2 * d.hr - 6); py <= y + 2; py++) for (let px = Math.floor(x0 - 2); px <= x0 + len + 4; px++) {
    if (!inside(px, py)) continue;
    const qx = 2 * d.x - px;                              // mirrored: head on the pillow (right)
    const dh = Math.hypot(qx - hcx, py - hcy) - d.hr;
    const db = capD(qx, py, x0 + d.hr * 1.6, y - 2.2, x0 + len - 4, y - 2.2) - 2.4;
    const lx = fx + 1 + 3.5 * Math.cos(1.1 + 0.6 * kick), ly = fy - 3.5 * Math.sin(1.1 + 0.6 * kick);
    const dl = capD(qx, py, fx - 1, fy, lx, ly) - 1.1;
    const dk = d.item === 4 ? Math.max(Math.abs(qx - (hcx - d.hr - 2.4)) - 1.6, Math.abs(py - (y - 1.8)) - 1.8) : 1e9;  // book
    let dx2 = 1e9;
    if (d.hairStyle === 2) dx2 = Math.hypot(qx - (hcx + d.hr + 0.4), py - (hcy - 0.6)) - 1.5;
    const dm = Math.min(dh, db, dl, dk, dx2);
    if (dm > 1.6) continue;
    const p = py * W + px, L = lit(p);
    blend(img, p, OUT, cl(1.6 - dm), 1);
    const ain = cl(0.5 - dm);
    if (ain <= 0) continue;
    let c = d.dress;
    if (dm === dk) c = d.itemCol;
    else if (dm === dx2) c = d.hair;
    else if (dm === dl) c = d.skin;
    else if (dm === dh) {
      const rx = (qx - hcx) / d.hr, ry = (py - hcy) / d.hr;
      c = rx > 0.1 || ry < -0.35 ? d.hair : d.skin;
      if (!(rx > 0.1 || ry < -0.35)) {
        const exx = hcx - d.hr * 0.45, eyy = hcy + 0.2;
        if (d.asleep ? Math.abs(py - eyy) < 0.5 && Math.abs(qx - exx) < 0.9 : Math.hypot(qx - exx, py - eyy) < 0.75) c = EYE;
      }
    }
    blend(img, p, c, ain, L);
  }
}

/** The cat: a ginger loaf with a swishing tail; `stretch` 0..1, `face` -1/1. */
export function drawCat(img, light, x, y, face, stretch, tail, walk) {
  const rx = 5.2 + 1.6 * stretch, ry = 2.9 - 0.7 * stretch;
  const bx = x, by = y - ry - (walk ? 1.2 : 0);
  const hx = bx + face * (rx + 1.2), hy = by - 1.6 + 1.4 * stretch;
  const tx0 = bx - face * (rx - 0.5), ty0 = by - 0.5;
  const tw = tail;
  const tpts = [[tx0, ty0]];
  for (let k = 1; k <= 4; k++) tpts.push([tx0 - face * k * 1.6, ty0 - k * 1.5 + Math.sin(tw + k * 0.7) * k * 0.55]);
  const C = [0.55, 0.16, 0.02], CD = [0.16, 0.04, 0.01];
  for (let py = Math.floor(y - 12); py <= y + 1; py++) for (let px = Math.floor(x - 14); px <= x + 14; px++) {
    if (!inside(px, py)) continue;
    const db = Math.hypot((px - bx) / rx, (py - by) / ry) * Math.min(rx, ry) - Math.min(rx, ry);
    const dh = Math.hypot(px - hx, py - hy) - 2.4;
    // ears: two little points above the head
    let de = 1e9;
    for (const s of [-1, 1]) {
      const ex = hx + s * 1.3, ey = hy - 2.6;
      de = Math.min(de, Math.max(Math.abs(px - ex) * 1.3 + (py - ey) * 0.7 - 0.9, ey - 0.9 - py, py - (hy - 1.2)));
    }
    let dt = 1e9;
    for (let k = 1; k < tpts.length; k++) dt = Math.min(dt, capD(px, py, tpts[k - 1][0], tpts[k - 1][1], tpts[k][0], tpts[k][1]) - (1.1 - k * 0.12));
    let dl = 1e9;
    if (walk || stretch > 0.2) {
      const ph = walk ? walk : 0;
      for (const s of [-1, 1]) {
        const lx = bx + s * rx * 0.6 + (walk ? Math.sin(ph + (s > 0 ? 0 : 3.1)) * 1.2 : face * s * stretch * 1.5);
        dl = Math.min(dl, capD(px, py, bx + s * rx * 0.55, by, lx, y) - 0.8);
      }
    }
    const dm = Math.min(db, dh, de, dt, dl);
    if (dm > 1.6) continue;
    const p = py * W + px, L = Math.min(0.85, 0.35 + 0.25 * light[p]);
    blend(img, p, OUT, cl(1.6 - dm), 1);
    const ain = cl(0.5 - dm);
    if (ain <= 0) continue;
    let c = C;
    if (dm === db && Math.sin((px - bx) * 1.3) > 0.55) c = CD;              // tabby stripes
    if (dm === dt && Math.sin(px * 1.6 + py) > 0.6) c = CD;
    if (dm === dh) {
      for (const s of [-1, 1]) if (Math.hypot(px - (hx + face * 0.6 + s * 1.1), py - (hy - 0.1)) < 0.6) c = stretch > 0.6 ? CD : [0.35, 0.6, 0.05];
    }
    blend(img, p, c, ain, L);
  }
}
