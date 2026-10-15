// Blueprint: the glass is a cyanotype drawing sheet, Prussian blue paper with
// chalk-white lines, and the time is the building on it. The hours are the
// GROUND FLOOR plan at the left, the minutes the FIRST FLOOR plan at a
// smaller scale, under a title block (TIME HOUSE, the date, the REV letter)
// and a north point, the two structural columns between the plans the
// colon. Every numeral is a floor plan (blueprint-plans.js): its strokes are
// cut walls, two hard outlines with 45-degree poche hatching between, a
// curved apse for the 2, rotundas for the bowls of 6, 8 and 9; windows run
// in the walls as three thin lines with jambs, the 2 has a door with its
// leaf and swing, the 1 a stair with its UP arrow, the 0 a dining table,
// the 6 and 8 spiral stairs; a dashed roof line traces each plan a step
// outside its walls, and a width dimension with architects' slash ticks
// sits over it.
//
// Always alive: a track drafting machine (carriage on the rail at the top,
// a clear plastic arm, the protractor head with two ticked scales) glides
// over the sheet the whole minute, and the draughtsman works: a section line
// is run along the scale edge from bubble to bubble, the compass swings
// detail bubbles round windows and doors with a tag, and after each turn a
// revision cloud is penned round the digits just revised, with the REV
// triangle. Each annotation holds a few seconds and fades.
//
// Minute turn: from :57 an eraser in its card sleeve rubs each changing
// numeral away from the top down, back and forth, crumbs pushed aside, the
// abraded paper left a shade paler (fading over the next seconds); the slot
// is empty before :00. After :00 the new plan is drafted: long faint
// construction lines and arcs run out, the pen inks both faces of the walls
// along the numeral's path, the hatching sweeps in, then the thin work
// (doors, stairs, furniture), then the dimension extends. Never a wrong
// numeral, only a partly erased or partly drawn one.
// Hour: a new print. From :58.6 a fresh sheet of sensitised paper, yellow-
// green with no image, is drawn down over the old one (a flat cast shadow at
// its edge); after :00 it is exposed (the whole drawing appears at once,
// pale yellow lines on dull grey-blue, by :00.3) and then washed: a wavy
// water front runs down the sheet, turning it Prussian blue and the lines
// white. The new sheet's title block has the next REV letter (one per hour,
// A..Z without I and O).
//
// Palette, the cyanotype's own and nothing else: Prussian blue paper, chalk
// white for object lines, the same white thinned for hatching, notes and
// thin work, a paler abraded blue for erasures; the unwashed print's
// grey-blue and iron-salt yellow-green, and the blank paper's yellow-green,
// for the hour. Every pixel of the sheet is a material looked up in one of
// these palettes, so the same drawing prints in any state. Night: the
// backlight drops to 40 %; the deep blue is the face's own colour, and the
// white walls stay the strongest contrast.
//
// Hard pixels for everything on the paper (lines, hatching, lettering, the
// annotations, which fade through an ordered dither, as a print would);
// anti-aliasing only for the tools moving over it: the drafting machine,
// pen, compass and eraser.
//
// Cost: one integer pass over the glass (material byte -> RGB565 table),
// the digit maps looked up per slot, annotations as Bresenham into the map,
// a handful of AA kit shapes for the tools. The sheet for the hour is
// rebuilt once an hour (~25k byte writes, charged in that frame). Flash:
// digit class + ink-order maps (hours 37 x 65, minutes 30 x 51, 2 bytes a
// pixel, ten each: ~79 KB), the grain map 12.8 KB, lettering < 1 KB.

import { clockFields, hash, sin, cos, ease, progress, clamp } from '../js/kit.js';
import { GLYPHS_H, GLYPHS_M, C_MOAT, C_OUT, C_HATCH, C_WALL, C_WLINE, C_WGAP, C_THIN, C_LEAF, C_ROOF } from './blueprint-plans.js';
import {
  W, H, GRAIN, INK, NMAT, M_G0, M_G1, M_DOT, M_LINE, M_HATCH, M_THIN, M_TEXT, M_WALL, M_RUB, M_RUB1, M_FAINT, M_F2,
  buildSheet, palette, to565Table, blankRGB, mixTable, PRINT, EXPOSED, BLANK, REVS, glyph,
} from './blueprint-sheet.js';

// ------------------------------------------------------------ layout
const SLOTS = [
  { x: 4, y: 7, set: GLYPHS_H },
  { x: 38, y: 7, set: GLYPHS_H },
  { x: 85, y: 6, set: GLYPHS_M },
  { x: 114, y: 6, set: GLYPHS_M },
];
const MAT = new Uint8Array(16);
MAT[C_OUT] = M_LINE; MAT[C_HATCH] = M_HATCH; MAT[C_WALL] = M_WALL; MAT[C_WLINE] = M_LINE; MAT[C_THIN] = M_THIN; MAT[C_LEAF] = M_TEXT; MAT[C_ROOF] = M_FAINT;

// rank of a material by how much line it is: annotations only ever add ink
const RANK = new Int8Array(NMAT);
INK.forEach((v, m) => { RANK[m] = Math.round(v * 100); });
RANK[M_RUB] = 0; RANK[M_RUB1] = 0;
const RUNG = [-1, M_F2, M_FAINT, M_THIN, M_TEXT];   // fade ladder for drawn annotations
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];

// ------------------------------------------------------------ colours
const PAL_PRINT = to565Table(palette(PRINT));
const PAL_EXPOSED = to565Table(palette(EXPOSED));
const LINE_C = PRINT.line, TOOL_C = 0xdce8ff;

// ------------------------------------------------------------ caches
const M = new Uint8Array(W * H);
const SHEETS = new Map();
let workOps = 0;
function sheetFor(f) {
  const key = `${f.h}|${f.dd}${f.month}`;
  let s = SHEETS.get(key);
  if (!s) {
    s = buildSheet(REVS[f.h], `${f.dd} ${f.month}`);
    workOps += W * H * 2;
    SHEETS.set(key, s);
    if (SHEETS.size > 3) SHEETS.delete(SHEETS.keys().next().value);
  }
  return s;
}

// ------------------------------------------------------------ material-map drawing (hard pixels)
let boxOps = 0;
function inkPx(x, y, v) {
  if (v <= 0 || x < 0 || y < 0 || x >= W || y >= H) return;
  if (v > 4) v = 4;
  const r = v | 0, fr = v - r;
  const rung = r + ((fr * 16) > bay(x, y) ? 1 : 0);
  if (rung <= 0) return;
  const mat = RUNG[rung > 4 ? 4 : rung], i = y * W + x;
  if (RANK[mat] > RANK[M[i]]) M[i] = mat;
  boxOps++;
}
/** A 1-px line into the map, drawn from its start to fraction u, optional dash pattern. */
function lineM(x0, y0, x1, y1, v, u = 1, dash = null) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  const n = Math.max(dx, -dy), stop = Math.round(n * u);
  let err = dx + dy;
  for (let k = 0; k <= stop; k++) {
    if (!dash || dash(k)) inkPx(x0, y0, v);
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
/** A circle into the map from clock angle 0 through fraction u. */
function circleM(cx, cy, r, v, u = 1, a0 = 0) {
  const n = Math.ceil(6.2832 * r * 1.5), stop = Math.round(n * u);
  for (let k = 0; k <= stop; k++) {
    const a = a0 + (k / n) * 6.2832;
    inkPx(Math.floor(cx + r * sin(a)), Math.floor(cy - r * cos(a)), v);
  }
}
function letterM(str, x, y, v) {
  for (const c of str) {
    const gl = glyph(c);
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (gl[j][i] === '#') inkPx(x + i, y + j, v);
    x += 4;
  }
}

// ------------------------------------------------------------ a digit into the map
// state: ink (outline reveal 0..1), hatch (diagonal sweep 0..1), thin (fade 0..1)
function digitM(slot, gl, ink, hatch, thin) {
  const inkT = ink >= 1 ? 256 : ink * 255, hatchT = hatch * (gl.w + gl.h + 1);
  const ox = slot.x, oy = slot.y, cls = gl.cls, S = gl.S;
  if (ink <= 0) return;
  for (let y = 0; y < gl.h; y++) {
    const row = (oy + y) * W + ox;
    for (let x = 0; x < gl.w; x++) {
      const k = y * gl.w + x, c = cls[k];
      if (c === 0) continue;
      const i = row + x;
      // pixels not drawn yet keep whatever paper they sit on (an erasure's paler patch too); only grid dots go
      if (c === C_MOAT || c === C_WGAP) { if (M[i] === M_DOT) M[i] = GRAIN[i]; continue; }
      if (c === C_OUT || c === C_WLINE) { if (S[k] <= inkT) M[i] = M_LINE; else if (M[i] === M_DOT) M[i] = GRAIN[i]; continue; }
      if (c === C_HATCH || c === C_WALL) { if (x + y <= hatchT) M[i] = MAT[c]; else if (M[i] === M_DOT) M[i] = GRAIN[i]; continue; }
      if (c === C_ROOF) { if (thin * 16 > bay(x, y) && RANK[M[i]] <= RANK[M_DOT]) M[i] = M_FAINT; continue; }
      // thin work fades in through the ordered dither
      if (thin * 16 > bay(x, y)) M[i] = MAT[c];
      else if (M[i] === M_DOT) M[i] = GRAIN[i];
    }
  }
  boxOps += gl.w * gl.h * 3;
}

// the width dimension over a digit: extension lines, a dimension line with architects' slash ticks
function dimM(slot, gl, u, v = 3) {
  if (u <= 0) return;
  const top = slot.y + gl.pad, x0 = slot.x + gl.pad, x1 = slot.x + gl.w - 1 - gl.pad, y = top - 5;
  const e = ease.outCubic(clamp(u * 1.6, 0, 1));
  lineM(x0, top - 3, x0, top - 3 - Math.round(4 * e), v);
  lineM(x1, top - 3, x1, top - 3 - Math.round(4 * e), v);
  const d = clamp(u * 1.6 - 0.4, 0, 1), mid = (x0 + x1) / 2, half = ((x1 - x0) / 2) * ease.outCubic(d);
  if (d > 0) lineM(mid - half, y, mid + half, y, v);
  if (d >= 1) for (const x of [x0, x1]) { inkPx(x - 1, y + 1, v + 1); inkPx(x, y, v + 1); inkPx(x + 1, y - 1, v + 1); }
}

// ------------------------------------------------------------ the minute's plan of work
function schedule(f, prv, nxt) {
  const hourIn = prv.h !== f.h, hourOut = nxt.h !== f.h;
  const cur = f.hh + f.mm, was = prv.hh + prv.mm, will = nxt.hh + nxt.mm;
  const draft = [], erase = [];
  if (!hourIn) for (let s = 0; s < 4; s++) if (cur[s] !== was[s]) draft.push(s);
  if (!hourOut) for (let s = 0; s < 4; s++) if (cur[s] !== will[s]) erase.push(s);
  return { hourIn, hourOut, draft, erase, cur };
}

// drafting: construction lines, ink along the path, hatching, the thin work, the dimension
function draftTimes(j, n) {
  const b = n > 1 ? 0.15 + j * 0.85 : 0.25;
  return { c0: b - 0.15, c1: b + 0.4, i0: b + 0.3, i1: b + 1.3, h0: b + 1.15, h1: b + 1.8, t0: b + 1.6, t1: b + 2.1, d0: b + 1.9, d1: b + 2.5 };
}
function eraseTimes(j, n) {
  if (n === 1) return { r0: 57.9, r1: 59.55 };
  return j === 0 ? { r0: 57.15, r1: 58.45 } : { r0: 58.55, r1: 59.8 };
}

// ------------------------------------------------------------ life: the draughtsman's jobs between turns
const JOB_T = Array.from({ length: 8 }, (_, j) => 4.2 + j * 6.3), TRAVEL = 1.6, DRAW = 2.4, HOLD = 7.5, FADE = 1.2;
const KINDS = [0, 2, 2, 2, 0, 2, 2, 2];   // section lines are rarer than detail bubbles
const SECTION_Y = [41, 33, 48, 27];
function jobsFor(mk, glyphs, revised) {
  const jobs = [];
  for (let j = 0; j < JOB_T.length; j++) {
    const h = hash(mk, j, 5);
    if (j === 0) {
      // the revision cloud round the digits revised at this turn (the title block's REV cell at the hour)
      let x0 = 101 + 33, y0 = 63 + 6, x1 = 101 + 54, y1 = 63 + 12;
      if (revised.length) {
        const a = SLOTS[revised[0]], b = SLOTS[revised[revised.length - 1]], gb = glyphs[revised[revised.length - 1]];
        x0 = a.x; y0 = a.y + 1; x1 = b.x + gb.w - 1; y1 = b.y + gb.h - 1;
      }
      jobs.push({ kind: 1, t0: JOB_T[0], x0, y0, x1, y1, tag: revised.length > 0, hx0: clamp(x0 - 34, 4, 110), hy0: clamp(y1 - 4, 8, 60), hx1: clamp(x0 - 34, 4, 110), hy1: clamp(y1 - 4, 8, 60) });
      continue;
    }
    let kind = KINDS[h % 8];
    if (kind === 0 && jobs[j - 1].kind === 0) kind = 2;
    const slot = (h >>> 4) % 4, gl = glyphs[slot];
    if (!gl.feats.length) kind = 0;
    const ft = gl.feats.length ? gl.feats[(h >>> 8) % gl.feats.length] : [gl.w / 2, gl.h / 2];
    const fx = SLOTS[slot].x + ft[0], fy = SLOTS[slot].y + ft[1];
    const job = { kind, t0: JOB_T[j], fx, fy, slot, y: SECTION_Y[(h >>> 12) % 4], letter: 'ABCDEFGH'[j] };
    // where the drafting head sits while the job is drawn
    if (kind === 0) { job.hx0 = -2; job.hy0 = job.y; job.hx1 = 128; job.hy1 = job.y; }
    else { job.hx0 = job.hx1 = clamp(fx + (fx < 80 ? 14 : -48), 4, 118); job.hy0 = job.hy1 = clamp(fy + 12, 8, 58); }
    jobs.push(job);
  }
  return jobs;
}
const PARK = [176, 30];

/** Where the drafting machine's head is at second s (null when parked away). */
function headAt(jobs, s) {
  // it glides from where it finished one job to where the next is drawn, all the time between
  let px = PARK[0], py = PARK[1], from = 2.4;
  for (let j = 0; j < jobs.length; j++) {
    const jb = jobs[j], b = jb.t0 + TRAVEL, c = b + DRAW;
    if (s < b) return lerp2(px, py, jb.hx0, jb.hy0, ease.inOutCubic(progress(s, from, b)));
    if (s < c) {
      const u = jb.kind === 0 ? ease.inOutQuad((s - b) / DRAW) : 0;
      return [jb.hx0 + (jb.hx1 - jb.hx0) * u, jb.hy0 + (jb.hy1 - jb.hy0) * u];
    }
    px = jb.hx1; py = jb.hy1; from = c;
  }
  // after the last job: slide away before the turn
  return lerp2(px, py, PARK[0], PARK[1], ease.inOutCubic(progress(s, from, 56.4)));
}
const lerp2 = (ax, ay, bx, by, u) => [ax + (bx - ax) * u, ay + (by - ay) * u];

function jobM(jb, s, rev) {
  const b = jb.t0 + TRAVEL, u = progress(s, b, b + DRAW);
  if (u <= 0) return null;
  const fade = 1 - progress(s, b + HOLD, b + HOLD + FADE);
  if (fade <= 0) return null;
  const v = 3 * fade;
  let pen = null;
  if (jb.kind === 0) {
    // a section line: chain line drawn along the scale, bubbles at its ends
    const e = ease.inOutQuad(u), x1 = 5 + (150 - 5) * e;
    lineM(9, jb.y, x1, jb.y, v, 1, (k) => (k % 9) < 6 || (k % 9) === 7);
    if (u > 0.02) { circleM(6.5, jb.y + 0.5, 3, v, clamp(u * 8, 0, 1)); letterM(jb.letter, 5, jb.y - 2, v * clamp(u * 8 - 0.5, 0, 1)); }
    if (u >= 1) { circleM(152.5, jb.y + 0.5, 3, v, clamp((s - b - DRAW) * 4, 0, 1)); letterM(jb.letter, 151, jb.y - 2, v); }
    if (u < 1) pen = [x1 + 0.5, jb.y + 0.5, 'pen'];
  } else if (jb.kind === 1) {
    // a revision cloud: scallops all round, drawn in one pass of the pen, then the revision triangle
    const sc = cloudScallops(jb), n = sc.length, done = u * n;
    for (let k = 0; k < n && k < done; k++) circleM(sc[k][0], sc[k][1], 2.2, v, clamp(done - k, 0, 1) * 0.5, sc[k][2]);
    if (u < 1) { const p = sc[Math.min(n - 1, done | 0)]; pen = [p[0] + 0.5, p[1] + 0.5, 'pen']; }
    const tu = progress(s, b + DRAW, b + DRAW + 0.5);
    if (tu > 0 && jb.tag) {
      const tx = jb.x1 + 3, ty = jb.y0 + 6;
      lineM(tx, ty + 7, tx + 8, ty + 7, v, tu); lineM(tx + 8, ty + 7, tx + 4, ty - 1, v, tu); lineM(tx + 4, ty - 1, tx, ty + 7, v, tu);
      if (tu >= 1) letterM(rev, tx + 3, ty + 2, v);
    }
  } else {
    // a detail bubble: the compass swings a circle round the feature, then a tag
    const r = 7.5, a = u * 6.2832;
    circleM(jb.fx, jb.fy, r, v * 0.85, u);
    if (u < 1) pen = [jb.fx + r * sin(a), jb.fy - r * cos(a), 'compass', jb.fx, jb.fy];
    const tu = progress(s, b + DRAW, b + DRAW + 0.5);
    if (tu > 0) {
      const lx = jb.fx + 5.3, ly = jb.fy + 5.3;
      lineM(lx, ly, lx + 5, ly + 5, v, tu);
      if (tu >= 1) { circleM(lx + 8.5, ly + 8.5, 3.2, v); letterM('1', lx + 7, ly + 6, v); }
    }
  }
  return pen;
}

const CLOUDS = new Map();
/** Scallop centres round a box, every 4 px, each with the clock angle its half-circle starts at. */
function cloudScallops(jb) {
  const key = `${jb.x0},${jb.y0},${jb.x1},${jb.y1}`;
  let sc = CLOUDS.get(key);
  if (sc) return sc;
  sc = [];
  const P = Math.PI, side = (ax, ay, bx, by, a0) => {
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / 4));
    for (let k = 0; k < n; k++) sc.push([ax + ((bx - ax) * (k + 0.5)) / n, ay + ((by - ay) * (k + 0.5)) / n, a0]);
  };
  side(jb.x0, jb.y0, jb.x1, jb.y0, -P / 2); side(jb.x1, jb.y0, jb.x1, jb.y1, 0);
  side(jb.x1, jb.y1, jb.x0, jb.y1, P / 2); side(jb.x0, jb.y1, jb.x0, jb.y0, P);
  CLOUDS.set(key, sc);
  if (CLOUDS.size > 8) CLOUDS.delete(CLOUDS.keys().next().value);
  return sc;
}

// ------------------------------------------------------------ overlays (anti-aliased, they move)
function drawHead(g, hx, hy, a) {
  if (hx > 172 || a <= 0) return;
  // a track drafting machine: a carriage runs on the rail along the top of the board, its arm hangs
  // down to the head; everything is clear plastic and bright edges
  const ax = hx + 14;
  g.fillPolygon([[ax - 2, -1], [ax + 2, -1], [ax + 2, hy - 5], [ax - 2, hy - 5]], TOOL_C, { aa: true, a: 0.07 * a });
  g.thickLine(ax - 2, -1, ax - 2, hy - 5, 0.7, TOOL_C, { aa: true, a: 0.24 * a });
  g.thickLine(ax + 2, -1, ax + 2, hy - 5, 0.7, TOOL_C, { aa: true, a: 0.24 * a });
  g.fillPolygon([[ax - 5, -1], [ax + 5, -1], [ax + 5, 4], [ax - 5, 4]], TOOL_C, { aa: true, a: 0.22 * a });
  g.thickLine(ax - 5, 4, ax + 5, 4, 0.9, TOOL_C, { aa: true, a: 0.7 * a });
  g.thickLine(ax - 5, -1, ax - 5, 4, 0.9, TOOL_C, { aa: true, a: 0.7 * a });
  g.thickLine(ax + 5, -1, ax + 5, 4, 0.9, TOOL_C, { aa: true, a: 0.7 * a });
  // the arm's clamp onto the head
  g.fillPolygon([[ax - 3, hy - 5], [ax + 3, hy - 5], [ax + 3, hy + 0.5], [ax - 3, hy + 0.5]], TOOL_C, { aa: true, a: 0.2 * a });
  // horizontal scale: its top edge is the working edge, ticked; the vertical one ticked on its right edge
  g.fillPolygon([[hx + 4, hy], [hx + 42, hy], [hx + 42, hy + 6], [hx + 4, hy + 6]], TOOL_C, { aa: true, a: 0.14 * a });
  g.fillPolygon([[hx - 6, hy + 4], [hx, hy + 4], [hx, hy + 32], [hx - 6, hy + 32]], TOOL_C, { aa: true, a: 0.14 * a });
  g.thickLine(hx + 4, hy, hx + 42, hy, 0.9, TOOL_C, { aa: true, a: 0.75 * a });
  g.thickLine(hx + 4, hy + 6, hx + 42, hy + 6, 0.8, TOOL_C, { aa: true, a: 0.35 * a });
  g.thickLine(hx, hy + 4, hx, hy + 32, 0.9, TOOL_C, { aa: true, a: 0.75 * a });
  g.thickLine(hx - 6, hy + 4, hx - 6, hy + 32, 0.8, TOOL_C, { aa: true, a: 0.35 * a });
  for (let k = 0; k <= 18; k++) {
    const L = k % 5 === 0 ? 2.6 : 1.3;
    g.thickLine(hx + 6 + k * 2, hy + 0.4, hx + 6 + k * 2, hy + L, 0.7, TOOL_C, { aa: true, a: 0.5 * a });
  }
  for (let k = 0; k <= 13; k++) {
    const L = k % 5 === 0 ? 2.6 : 1.3;
    g.thickLine(hx - 0.4, hy + 6 + k * 2, hx - L, hy + 6 + k * 2, 0.7, TOOL_C, { aa: true, a: 0.5 * a });
  }
  // the protractor head where the two scales meet
  g.fillCircle(hx - 1, hy - 1, 6, TOOL_C, { aa: true, a: 0.16 * a });
  g.ring(hx - 1, hy - 1, 5.4, 6.4, TOOL_C, { aa: true, a: 0.75 * a });
  g.ring(hx - 1, hy - 1, 1.2, 2.2, TOOL_C, { aa: true, a: 0.7 * a });
}
function drawPen(g, x, y) {
  g.ring(x, y, 1.7, 2.8, LINE_C, { aa: true, a: 0.9 });
  g.fillCircle(x, y, 0.8, LINE_C, { aa: true });
}
function drawCompass(g, x, y, cx, cy) {
  const mx = (x + cx) / 2, my = (y + cy) / 2, dx = x - cx, dy = y - cy, L = Math.hypot(dx, dy) || 1;
  const kx = mx - (dy / L) * 3, ky = my + (dx / L) * 3;
  g.thickLine(kx, ky, cx, cy, 1, TOOL_C, { aa: true, a: 0.85 });
  g.thickLine(kx, ky, x, y, 1, TOOL_C, { aa: true, a: 0.85 });
  g.fillCircle(kx, ky, 1.6, TOOL_C, { aa: true });
  g.fillCircle(x, y, 0.9, LINE_C, { aa: true });
}
function drawEraser(g, x, y) {
  // a draughting eraser seen from above: a block in a card sleeve
  const w = 12, h = 7, x0 = x - w / 2, y0 = y - h / 2;
  g.fillPolygon([[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]], TOOL_C, { aa: true, a: 0.3 });
  g.fillPolygon([[x0 + 5, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0 + 5, y0 + h]], TOOL_C, { aa: true, a: 0.25 });
  for (const [ax, ay, bx, by] of [[x0, y0, x0 + w, y0], [x0 + w, y0, x0 + w, y0 + h], [x0 + w, y0 + h, x0, y0 + h], [x0, y0 + h, x0, y0]])
    g.thickLine(ax, ay, bx, by, 1, TOOL_C, { aa: true, a: 0.9 });
  g.thickLine(x0 + 5, y0, x0 + 5, y0 + h, 0.8, TOOL_C, { aa: true, a: 0.7 });
}

export default {
  name: 'Blueprint',
  blurb: 'A cyanotype floor plan: the numerals are walls with doors, windows and stairs; erased and redrafted each minute, reprinted every hour.',
  fps: 60,
  frame(g, ctx) {
    const f = ctx.fields, s = f.sec, t = ctx.date.getTime();
    ctx.lcd.backlight(1 - 0.6 * ctx.night);
    workOps = 0; boxOps = 0;
    const prv = clockFields(new Date(t - 60000)), nxt = clockFields(new Date(t + 60000));
    const sch = schedule(f, prv, nxt);
    const glyphs = [0, 1, 2, 3].map((k) => SLOTS[k].set[+sch.cur[k]]);

    M.set(sheetFor(f));
    // last minute's rubbed patches fade out under the new drawing
    sch.draft.forEach((sl) => {
      const fade = 1 - progress(s, 2, 10);
      if (fade > 0) rubM(sl, glyphs[sl], fade, 999);
    });
    // the digits, drafted at the start of a minute where they changed
    const overlays = [];
    for (let k = 0; k < 4; k++) {
      const sl = SLOTS[k], gl = glyphs[k], j = sch.draft.indexOf(k);
      if (j < 0) { digitM(sl, gl, 1, 1, 1); dimM(sl, gl, 1); continue; }
      const T = draftTimes(j, sch.draft.length);
      // construction lines: run out long, then fade once the walls are inked
      const cu = progress(s, T.c0, T.c1), cf = 1 - progress(s, T.i1, T.i1 + 1.2);
      if (cu > 0 && cf > 0) for (const gd of gl.guides) {
        if (gd.t === 'L') lineM(sl.x + gd.x0, sl.y + gd.y0, sl.x + gd.x1, sl.y + gd.y1, 2 * cf, ease.outCubic(cu));
        else circleM(sl.x + gd.cx, sl.y + gd.cy, gd.r, 2 * cf, ease.outCubic(cu) * gd.span / 6.2832, gd.a0);
      }
      const iu = ease.inOutQuad(progress(s, T.i0, T.i1));
      digitM(sl, gl, iu, progress(s, T.h0, T.h1), progress(s, T.t0, T.t1));
      dimM(sl, gl, progress(s, T.d0, T.d1));
      if (iu > 0 && iu < 1) { const [px, py] = gl.pathAt(iu); overlays.push(['pen', sl.x + px, sl.y + py]); }
    }
    // the colon: two structural columns, hatched squares
    columnM(76, 27); columnM(76, 45);

    // the draughtsman's jobs
    const jobs = jobsFor(f.minuteKey, glyphs, sch.draft);
    for (const jb of jobs) { const p = jobM(jb, s, REVS[f.h]); if (p) overlays.push(p); }

    // the eraser at the end of the minute
    let eraser = null;
    if (sch.erase.length && s > 56.5) eraser = eraseM(sch.erase, glyphs, s);

    // ---- print: materials through the palette
    const buf = g.buf;
    if (sch.hourOut && s >= 58.6) printSlide(buf, s);
    else if (sch.hourIn && s < 3) printDevelop(buf, s);
    else for (let i = 0; i < W * H; i++) buf[i] = PAL_PRINT[M[i]];
    g.cost.px += W * H; g.cost.box += W * H + boxOps * 2 + workOps;

    // ---- the tools on top
    if (!(sch.hourIn && s < 3)) {
      const [hx, hy] = headAt(jobs, s);
      drawHead(g, hx, hy, 1);
    }
    for (const o of overlays) {
      if (o[0] === 'compass' || o[2] === 'compass') drawCompass(g, o[0], o[1], o[3], o[4]);
      else if (o[0] === 'pen') drawPen(g, o[1], o[2]);
      else drawPen(g, o[0], o[1]);
    }
    if (eraser) {
      for (const c of eraser.crumbs) g.fillRect(c[0], c[1], 1, 1, 0xc4d4f0, { a: c[2] });
      drawEraser(g, eraser.x, eraser.y);
    }
  },
};

// ------------------------------------------------------------ columns
function columnM(x, y) {
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
    const edge = i === 0 || j === 0 || i === 5 || j === 5;
    M[(y + j) * W + x + i] = edge || i === j || i === 5 - j ? M_LINE : M_G0;
  }
}

// ------------------------------------------------------------ erasing
function patchBox(sl, gl) { return [sl.x, sl.y - 3, gl.w, gl.h + 3]; }
/** Rub the paper: rows above `front` (canvas y) become abraded paper; `fade` dissolves the patch. */
function rubM(k, gl, fade, front) {
  const sl = SLOTS[k], [bx, by, bw, bh] = patchBox(sl, gl);
  for (let y = by; y < by + bh; y++)
    for (let x = bx; x < bx + bw; x++) {
      const jit = (hash(x, 3) & 3) - 1.5;
      if (y > front + jit) continue;
      if (fade * 16 <= bay(x, y)) continue;
      const i = y * W + x, gm = GRAIN[i];
      M[i] = gm === M_G1 ? M_RUB1 : M_RUB;
    }
  boxOps += bw * bh * 2;
}
function eraseM(list, glyphs, s) {
  const n = list.length;
  let ex = PARK[0], ey = 96, crumbs = [];
  const first = eraseTimes(0, n), last = eraseTimes(n - 1, n);
  for (let j = 0; j < n; j++) {
    const k = list[j], gl = glyphs[k], sl = SLOTS[k], T = eraseTimes(j, n);
    const [bx, by, bw, bh] = patchBox(sl, gl);
    const u = progress(s, T.r0, T.r1);
    if (u > 0) rubM(k, gl, 1, by - 1 + (bh + 2) * u);
    // crumbs pushed off the rubbing, lying where they fall, gone by :00
    for (let c = 0; c < 16; c++) {
      const tc = T.r0 + ((c + 0.5) / 16) * (T.r1 - T.r0);
      if (s < tc) break;
      const h = hash(c, k, 41);
      const side = h & 1 ? 1 : -1, d = 3 + (h >>> 3) % 6, age = s - tc;
      const push = d * ease.outCubic(clamp(age / 0.35, 0, 1));
      const cy = by + (bh * (c + 0.5)) / 16 + ((h >>> 9) % 5) - 2;
      const cx = sl.x + gl.w / 2 + side * ((gl.w / 2) - 2 + push);
      const a = 0.85 * (1 - progress(s, 59.5, 59.95));
      if (a > 0) crumbs.push([cx, cy, a]);
    }
    if (s >= T.r0 && s < T.r1) {
      const cx = sl.x + gl.w / 2, amp = gl.w / 2 - 4;
      ex = cx + amp * sin((s - T.r0) * 6.2832 * 2.4);
      ey = by + (bh + 2) * u;
    }
  }
  // travel in, between slots and out
  if (s < first.r0) {
    const k = list[0], sl = SLOTS[k], [, by] = patchBox(sl, glyphs[k]);
    const u = ease.inOutCubic(progress(s, first.r0 - 0.7, first.r0));
    ex = PARK[0] + (sl.x + glyphs[k].w / 2 - PARK[0]) * u; ey = 96 + (by - 96) * u;
  } else if (n > 1 && s >= first.r1 && s < eraseTimes(1, n).r0) {
    const a = SLOTS[list[0]], b = SLOTS[list[1]], ga = glyphs[list[0]], gb = glyphs[list[1]];
    const u = ease.inOutCubic(progress(s, first.r1, eraseTimes(1, n).r0));
    const [, aby, , abh] = patchBox(a, ga), [, bby] = patchBox(b, gb);
    ex = a.x + ga.w / 2 + (b.x + gb.w / 2 - a.x - ga.w / 2) * u; ey = aby + abh + 2 + (bby - aby - abh - 2) * u;
  } else if (s >= last.r1) {
    const k = list[n - 1], sl = SLOTS[k], [, by, , bh] = patchBox(sl, glyphs[k]);
    const u = ease.inOutCubic(progress(s, last.r1, last.r1 + 0.5));
    ex = sl.x + glyphs[k].w / 2 + (PARK[0] - sl.x) * u; ey = by + bh + 2 + (96 - by - bh) * u;
  }
  return { x: ex, y: ey, crumbs };
}

// ------------------------------------------------------------ the hour: a new print
const RGB_BLANK = blankRGB(), RGB_EXPOSED = palette(EXPOSED);
const PAL_BLANK = mixTable(RGB_BLANK, RGB_BLANK, 0);
const SHADOW = to565Table(palette({ ground: 0x0f2c58, line: 0x7d93b8 }));
const PM = to565Table(palette(EXPOSED, PRINT, 0.5));                           // just behind the wash front
const WATER = to565Table(palette({ ground: 0x8fb0d8, line: 0x8fb0d8 }))[0];   // the wet edge of the wash
/** :58.6-:59.9 a fresh sheet of sensitised paper is drawn down over the old print. */
function printSlide(buf, s) {
  const Y = 81 * ease.inOutQuad(progress(s, 58.6, 59.9)), yi = Math.floor(Y);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    if (y < yi - 1) for (let x = 0; x < W; x++) buf[row + x] = PAL_BLANK[GRAIN[row + x]];
    else if (y === yi - 1) for (let x = 0; x < W; x++) buf[row + x] = SHADOW[M_THIN];
    else if (y <= yi + 1) for (let x = 0; x < W; x++) buf[row + x] = SHADOW[M[row + x]];
    else for (let x = 0; x < W; x++) buf[row + x] = PAL_PRINT[M[row + x]];
  }
}
/** :00-:03 the print is exposed (the drawing appears pale on dull blue) and washed (deep blue from the top). */
function printDevelop(buf, s) {
  const ex = ease.inOutQuad(progress(s, 0, 0.45));
  const PE = ex < 1 ? mixTable(RGB_BLANK, RGB_EXPOSED, ex) : PAL_EXPOSED;
  const wu = progress(s, 0.45, 2.6), front = -8 + 96 * ease.inOutQuad(wu);
  for (let x = 0; x < W; x++) {
    const fy = front + 2.2 * sin(x * 0.31 + s * 3) + 1.4 * sin(x * 0.11 - s * 2);
    for (let y = 0; y < H; y++) {
      const i = y * W + x, d = fy - y;
      buf[i] = d > 3 ? PAL_PRINT[M[i]] : d > 0 ? PM[M[i]] : d > -1.2 ? WATER : PE[M[i]];
    }
  }
}
