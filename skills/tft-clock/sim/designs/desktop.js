// Desktop: a tiny 1995 PC that keeps the time by hand.
//
// The whole glass is a Windows-95-style desktop at 1:1 pixels: teal
// wallpaper, two icons, a taskbar with Start and a tray clock, and one
// window, "TIME.TXT - Notepad", with the time typed in it in a Fixedsys-like
// editor font at x3. Nobody is visible; there is only the mouse pointer, and
// whoever is moving it keeps that file up to date. Every minute they
// retype it, and every minute they do it differently (the chore cycles over
// five minutes):
//
//   retype    drag-select the changed digits, Delete before :00, type after
//   trails    the system hangs mid-drag, the window leaves the classic
//             smeared trail of copies of itself across the screen, the
//             desktop repaints, then the digits are retyped
//   saver     the user goes idle, the Starfield screensaver comes on with a
//             scrolling marquee of the time, a nudge of the mouse ends it
//   crash     "This program has performed an illegal operation": Close, the
//             window is gone, Start > Documents > TIME.TXT reopens it on :00
//   timedate  Select All, then Edit > Time/Date replaces the text on :00
//
// The hour is a blue screen ("A fatal exception 0E has occurred at
// 10:59:52. The current hour will be terminated."), a text-mode boot
// ("Starting Windows 11:00..."), the cloud splash, where the version number
// is the new hour, and the desktop painting itself back in. Between chores
// the pointer has a life of its own: menus, the Start menu (whose banner
// also reads "Windows 10:09"), maximise and restore, minimise to the
// taskbar, a right-click Refresh. Night (23-7) is the screensaver all night
// at a dimmed backlight; 07:00 wakes it.
//
// Reading it: the big digits in the Notepad window, HH:MM, 24-hour. The
// tray clock always holds the time too, small, so the moments when the big
// window is closed, minimised or behind a dialog still have an answer.
//
// Palette: the 16 VGA colours of a 1995 desktop (teal, silver, navy, grey,
// white, black, and the bright eight for icons, stars and the logo), plus
// the BIOS text-mode blue and grey for the crash screen. The only
// in-betweens are the dithered sky of the boot splash, as it was on a
// 256-colour card. Hard pixels everywhere: it is a bitmap GUI. Two typefaces
// drawn for it (desktop-ui.js): a 6-row proportional system font and a
// 6 x 9 Fixedsys-ish editor font.
//
// Everything is a pure function of the clock: each minute turn has a
// script on tau = seconds from the turn (-30..30), built from the old and
// new time and the minute's number; window positions, rest points and the
// little activities are hashed from the minute.

import { clockFields, hash, rand, TAU, sin, cos, ease, clamp, font5x7 } from '../js/kit.js';
import {
  C, UI, uiText, uiWidth, uiTextUp, BIG, BIG_H, bigWidth, bigStops,
  ARROW, HOURGLASS, MINIGLASS, IBEAM, ICON_COMPUTER, ICON_BIN, ICON_PAD, ICON_ERROR, FLAG, ICON_FOLDER, ICON_DOC,
  G_UP, G_DOWN, G_SPEAKER, edge, raised, pressed, sunken, checker, button, frame, captionButtons, menu, menuRowY, menuRowAt,
} from './desktop-ui.js';

const W = 160, H = 80, TB = 69;            // taskbar top
const WW = 122, WH = 62;                   // Notepad window size
const SC = 3;                              // editor font scale
const POS = [[24, 2], [36, 3], [3, 5], [33, 6]];
const MAXR = [0, 0, W, TB];
const CHORES = ['retype', 'trails', 'saver', 'crash', 'timedate'];
const ACTS = ['editmenu', 'maximize', 'context', 'minimize', 'start', 'wander'];
const REST = [[148, 52], [20, 30], [104, 74], [141, 17], [9, 55], [124, 58], [70, 64], [28, 12]];
const EDIT_ITEMS = ['Cut', 'Copy', 'Paste', '-', 'Select All', 'Time/Date'];
const CTX_ITEMS = ['Arrange Icons', 'Refresh', '-', 'Paste', 'New', '-', 'Properties'];
const START_ITEMS = ['Programs', 'Documents', 'Settings', 'Find', 'Help', 'Run...', '-', 'Shut Down...'];
const PROG_ITEMS = ['Accessories', 'StartUp', 'MS-DOS Prompt', 'Explorer'];
const DOC_ITEMS = ['TIME.TXT'];
const TITLE = 'TIME - Notepad';

const hhmm = (f) => `${f.hh}:${f.mm}`;
const posOf = (K) => POS[(((Math.floor((K - 1) / 5)) % 4) + 4) % 4];
const prog = (v, a, b) => clamp((v - a) / (b - a), 0, 1);

function choreOf(K, nu) {
  const h = nu.h;
  if (h >= 23 || h < 7) return nu.m === 0 && h === 23 ? 'bsod' : 'night';
  if (nu.m === 0) return h === 7 ? 'wake' : 'bsod';
  return CHORES[((K % 5) + 5) % 5];
}

// ------------------------------------------------------------ geometry

/** Where things are in a Notepad window at rect r = [x, y, w, h]. */
function geo(r) {
  const [x, y, w, h] = r;
  const tx = x + 7, ty = y + 26;
  const menuY = y + 12;
  const labels = ['File', 'Edit', 'Search', 'Help'];
  const lx = [];
  let mx = x + 6;
  for (const s of labels) { lx.push(mx); mx += uiWidth(s) + 6; }
  return {
    r, tx, ty, menuY, labels, lx,
    textBox: [x + 5, y + 22, w - 17, h - 27],
    editX: lx[1] + 5, editMenuX: lx[1] - 3, editMenuY: y + 20,
    caption: captionButtons(x, y, w),
    grab: [x + 30, y + 6],
  };
}
const rectOf = (p) => [p[0], p[1], WW, WH];

// ------------------------------------------------------------ the pointer's track

class Track {
  constructor() { this.k = []; }
  /** Arrive at (x, y) at time t, having moved for the d seconds before. */
  at(t, x, y, d = 0.8) {
    const prev = this.k[this.k.length - 1];
    if (prev) { if (t < prev.t) t = prev.t; d = Math.min(d, t - prev.t); }
    this.k.push({ t, x, y, d, bend: (rand(this.k.length, Math.round(x * 7 + y)) - 0.5) * 0.35 });
    return this;
  }
  pos(t) {
    const k = this.k;
    let i = -1;
    while (i + 1 < k.length && k[i + 1].t <= t) i++;
    if (i < 0) return [k[0].x, k[0].y];
    const a = k[i], b = k[i + 1];
    if (!b || t <= b.t - b.d) return [a.x, a.y];
    const u = ease.inOutCubic(prog(t, b.t - b.d, b.t));
    const dx = b.x - a.x, dy = b.y - a.y, arc = Math.sin(Math.PI * u) * b.bend;
    return [a.x + dx * u - dy * arc, a.y + dy * u + dx * arc];
  }
}

// ------------------------------------------------------------ the script of a minute turn

function plan(ctx) {
  const f = ctx.fields, s = f.sec;
  const K = s >= 30 ? f.minuteKey + 1 : f.minuteKey;
  const tau = s >= 30 ? s - 60 : s;
  const nu = clockFields(new Date(K * 60000));
  const old = clockFields(new Date((K - 1) * 60000));
  const oldStr = hhmm(old), newStr = hhmm(nu);
  const chore = choreOf(K, nu);
  const night = chore === 'night';
  const ws = ctx.date.getTime() / 1000;

  const st = {
    K, tau, ws, chore, mode: 'desk', nu, old,
    win: rectOf(tau < 0 ? posOf(K - 1) : posOf(K)), winVis: true, maxed: false, active: true,
    text: tau < 0 ? oldStr : newStr, sel: null, caret: 5, editAbs: null,
    editMenu: false, ctx: null, start: false, startDown: false, dialog: null, dlgDown: false,
    trails: null, zoom: null, down: '', iconsVis: 2, taskbar: true, taskBtn: true, taskDown: false,
    shape: null, cursor: true, boot: 0,
    tray: tau < 0 ? oldStr : newStr,
  };
  const tr = new Track();
  const later = [];                         // state that depends on where the pointer is
  tr.at(-30, ...REST[hash(K - 1, 3) % REST.length], 0);

  // --- the retype (shared by several chores)
  const retype = (win) => {
    const g0 = geo(win);
    let i0 = 0;
    while (i0 < 5 && oldStr[i0] === newStr[i0]) i0++;
    const xs = bigStops(oldStr, SC), my = g0.ty + 13;
    tr.at(-3.4, g0.tx + xs[i0] + 1, my, 1.2);
    tr.at(-2.4, g0.tx + xs[5] + 1, my, 0.6);
    tr.at(1.6, g0.tx + xs[5] + 12 + (hash(K, 9) % 20), g0.ty + 33, 1.0);
    if (tau >= -3.0 && tau < -0.35) {
      const n = Math.ceil(prog(tau, -3.0, -2.4) * (5 - i0));
      if (n > 0) st.sel = [i0, i0 + n]; else st.caret = i0;
      st.editAbs = -3.0;
    } else if (tau >= -0.35 && tau < 0) {
      st.text = oldStr.slice(0, i0); st.caret = i0; st.editAbs = -0.35;
    } else if (tau >= 0 && tau < 3) {
      let n = 0;
      while (n < 5 - i0 && 0.02 + 0.16 * n <= tau) n++;
      st.text = newStr.slice(0, i0 + n); st.caret = i0 + n;
      st.editAbs = n ? 0.02 + 0.16 * (n - 1) : 0;
    }
  };

  // --- the little things between chores (slot 2 before the turn, slot 1 after)
  const activity = (T0, win, kind) => {
    const g0 = geo(win);
    const u = tau - T0;
    const inside = u >= 0 && u < 10;
    if (kind === 'context' && win[0] < 30) kind = 'wander';
    if (kind === 'editmenu') {
      tr.at(T0 + 1.0, g0.editX, g0.menuY + 4, 1.0);
      [0, 1, 2, 4, 5].forEach((row, j) => tr.at(T0 + 2.0 + 0.6 * j, g0.editMenuX + 20, menuRowY(g0.editMenuY, EDIT_ITEMS, row), 0.4));
      tr.at(T0 + 6.8, ...REST[hash(K, T0 | 0, 5) % REST.length], 1.1);
      if (u >= 1.2 && u < 5.6) st.editMenu = true;
    } else if (kind === 'maximize') {
      const cb = g0.caption.max, mb = geo(MAXR).caption.max;
      tr.at(T0 + 1.0, cb[0], cb[1], 1.0);
      tr.at(T0 + 3.2, 112, 50, 1.3);
      tr.at(T0 + 7.2, mb[0], mb[1], 1.6);
      tr.at(T0 + 8.8, ...REST[hash(K, T0 | 0, 6) % REST.length], 1.2);
      if (u >= 1.05 && u < 1.2) st.down = 'x';
      if (u >= 1.2 && u < 1.45) st.zoom = lerpRect(win, MAXR, prog(u, 1.2, 1.45));
      if (u >= 1.2 && u < 1.45) st.winVis = false;
      if (u >= 1.45 && u < 7.5) { st.win = MAXR; st.maxed = true; }
      if (u >= 7.3 && u < 7.5) st.down = 'x';
      if (u >= 7.5 && u < 7.75) { st.zoom = lerpRect(MAXR, win, prog(u, 7.5, 7.75)); st.winVis = false; }
    } else if (kind === 'context') {
      tr.at(T0 + 1.0, 15, 16, 1.0);
      tr.at(T0 + 2.3, 34, menuRowY(16, CTX_ITEMS, 1), 0.7);
      tr.at(T0 + 4.2, ...REST[hash(K, T0 | 0, 7) % REST.length], 1.2);
      if (u >= 1.2 && u < 2.8) st.ctx = [15, 16];
      if (u >= 2.8 && u < 3.05) st.iconsVis = 0;
    } else if (kind === 'minimize') {
      const cb = g0.caption.min, tb = taskButton();
      tr.at(T0 + 1.0, cb[0], cb[1], 1.0);
      tr.at(T0 + 3.5, tb[0] + 30, tb[1] + 4, 1.6);
      tr.at(T0 + 5.4, ...REST[hash(K, T0 | 0, 8) % REST.length], 1.2);
      if (u >= 1.05 && u < 1.2) st.down = 'n';
      if (u >= 1.2 && u < 3.95) st.winVis = false;
      if (u >= 1.2 && u < 1.45) st.zoom = lerpRect(win, tb, prog(u, 1.2, 1.45));
      if (u >= 1.2 && u < 3.95) st.active = false;
      if (u >= 3.7 && u < 3.95) { st.zoom = lerpRect(tb, win, prog(u, 3.7, 3.95)); st.taskDown = true; }
    } else if (kind === 'start') {
      const sm = startMenuBox();
      tr.at(T0 + 1.0, 14, 74, 1.2);
      tr.at(T0 + 2.2, sm.x + 30, menuRowY(sm.y, START_ITEMS, 0), 0.9);
      tr.at(T0 + 3.0, sm.x + sm.w + 14, menuRowY(sm.y, START_ITEMS, 0), 0.6);
      tr.at(T0 + 3.6, sm.x + sm.w + 18, menuRowY(sm.y, START_ITEMS, 0) + 16, 0.4);
      tr.at(T0 + 4.4, sm.x + sm.w + 16, menuRowY(sm.y, START_ITEMS, 0) + 24, 0.5);
      tr.at(T0 + 6.4, ...REST[hash(K, T0 | 0, 9) % REST.length], 1.2);
      if (u >= 1.2 && u < 5.4) { st.start = true; st.active = false; st.startOpen = prog(u, 1.2, 1.32); }
      if (u >= 2.1 && u < 5.4) st.sub = 'programs';
    } else {
      const r = (j) => REST[hash(K, T0 | 0, 20 + j) % REST.length];
      tr.at(T0 + 2.0, ...r(0), 1.6);
      tr.at(T0 + 5.0, ...r(1), 1.8);
      tr.at(T0 + 8.0, ...r(2), 1.8);
    }
    return inside;
  };

  const slot2 = !['saver', 'night', 'wake'].includes(chore);
  if (slot2) activity(-28, rectOf(posOf(K - 1)), ACTS[hash(K, 2) % ACTS.length]);

  // --- the chore
  const winA = rectOf(posOf(K - 1)), winB = rectOf(posOf(K));
  if (chore === 'retype') {
    retype(winA);
  } else if (chore === 'trails') {
    const ga = geo(winA);
    tr.at(-11.0, ...ga.grab, 1.2);
    const path = (u) => {
      const e = ease.inOutQuad(u);
      return [winA[0] + (winB[0] - winA[0]) * e + 40 * Math.sin(TAU * e) * (winA[0] > 20 ? -1 : 1),
        winA[1] + (winB[1] - winA[1]) * e + 16 * Math.sin(Math.PI * e)];
    };
    const T0 = -10.6, T1 = -7.6, N = 26;
    tr.at(T0, ...ga.grab, 0);
    if (tau >= T0 && tau < -6.6) {
      st.trails = [];
      for (let k = 0; k <= N; k++) {
        const tk = T0 + (T1 - T0) * (k / N);
        if (tk > tau) break;
        const p = path(k / N);
        st.trails.push([Math.round(p[0]), Math.round(p[1]), WW, WH]);
      }
      const p = path(prog(tau, T0, T1));
      st.win = [Math.round(p[0]), Math.round(p[1]), WW, WH];
      if (tau >= T1) st.win = winB;
      st.shape = 'busy';
    }
    if (tau >= T1) st.win = winB;
    later.push(() => {
      if (tau >= T0 && tau < T1) {
        const p = path(prog(tau, T0, T1));
        st.cursorAt = [p[0] + 30, p[1] + 6];
      }
    });
    tr.at(T1, ...geo(winB).grab, 0);
    if (tau >= -11.0 && tau < -6.6) st.shape = 'busy';
    retype(winB);
  } else if (chore === 'saver' || chore === 'wake') {
    const g0 = geo(winA), xs = bigStops(oldStr, SC);
    let i0 = 0;
    while (i0 < 5 && oldStr[i0] === newStr[i0]) i0++;
    const park = [g0.tx + xs[i0] + 1, g0.ty + 13];
    tr.at(-28.5, ...park, 1.5);
    tr.at(-4.5, park[0] + 3, park[1] + 2, 0.15);
    const from = chore === 'wake' ? -31 : -26;
    if (tau >= from && tau < -4.6) st.mode = 'saver';
    retype(winA);
  } else if (chore === 'crash') {
    const d = dialogBox(), sm = startMenuBox(), dy = menuRowY(sm.y, START_ITEMS, 1);
    tr.at(-6.3, d.close[0], d.close[1], 1.6);
    tr.at(-4.2, 14, 74, 1.3);
    tr.at(-2.6, sm.x + 30, dy, 1.0);
    tr.at(-1.5, sm.x + sm.w + 18, dy, 0.7);
    tr.at(1.6, ...REST[hash(K, 11) % REST.length], 1.0);
    if (tau >= -9 && tau < -5.8) { st.dialog = d; st.active = false; st.dlgDown = tau >= -6.0; }
    if (tau >= -5.8 && tau < 0.25) { st.winVis = false; st.taskBtn = false; }
    if (tau >= -4.0 && tau < -0.5) { st.start = true; st.startOpen = prog(tau, -4.0, -3.88); }
    if (tau >= -2.7 && tau < -0.5) st.sub = 'docs';
    if (tau >= -0.5 && tau < 0.6) st.shape = 'glass';
    if (tau >= 0 && tau < 0.25) st.zoom = lerpRect([sm.x + sm.w, dy - 4, 40, 8], winA, prog(tau, 0, 0.25));
    if (tau >= -0.5 && tau < 0) st.text = oldStr;
  } else if (chore === 'timedate') {
    const g0 = geo(winA), xs = bigStops(oldStr, SC);
    tr.at(-4.2, g0.tx + xs[5] + 8, g0.ty + 16, 1.0);
    tr.at(-2.2, g0.editX, g0.menuY + 4, 1.0);
    tr.at(-0.6, g0.editMenuX + 22, menuRowY(g0.editMenuY, EDIT_ITEMS, 5), 1.0);
    tr.at(1.4, ...REST[hash(K, 12) % REST.length], 1.0);
    if (tau >= -3.4 && tau < 0) { st.sel = [0, 5]; st.editAbs = -3.4; }
    if (tau >= -2.0 && tau < 0) st.editMenu = true;
    if (tau >= 0 && tau < 3) st.editAbs = 0;
  } else if (chore === 'bsod') {
    tr.at(-12.0, winA[0] + 70, winA[1] + 40, 1.0);
    tr.at(7.0, 80, 40, 0);
    tr.at(9.4, ...REST[hash(K, 13) % REST.length], 1.4);
    if (tau >= -12 && tau < -10) st.shape = 'glass';
    if (tau >= -10 && tau < -1.8) st.mode = 'bsod';
    else if (tau >= -1.8 && tau < 0) st.mode = 'black';
    else if (tau >= 0 && tau < 2.2) st.mode = 'text';
    else if (tau >= 2.2 && tau < 6.4) st.mode = 'splash';
    else if (tau >= 6.4 && tau < 7.85) {
      st.winVis = false; st.taskbar = tau >= 6.7; st.taskBtn = false;
      st.iconsVis = tau >= 7.2 ? 2 : tau >= 7.0 ? 1 : 0;
      st.cursor = tau >= 7.0;
      if (tau >= 7.6) st.zoom = lerpRect([70, 36, 20, 6], winB, prog(tau, 7.6, 7.85));
    }
    if (tau >= 6.4 && tau < 8.4) st.shape = 'glass';
    if (tau >= 0) st.editAbs = 7.85;
  } else if (night) {
    st.mode = 'saver';
  }
  if (chore === 'bsod' && nu.h === 23 && tau >= 20) st.mode = 'saver';

  // --- slot 1, after the turn
  if (!night && !(chore === 'bsod' && nu.h === 23)) activity(11, winB, ACTS[hash(K, 1) % ACTS.length]);

  tr.at(30, ...REST[hash(K, 3) % REST.length], 2.6);

  // --- the pointer
  let cur = tr.pos(tau);
  for (const fn of later) fn();
  if (st.cursorAt) cur = st.cursorAt;
  st.cur = [Math.round(cur[0]), Math.round(cur[1])];
  return st;
}

function lerpRect(a, b, u) {
  const e = ease.inOutQuad(u);
  return a.map((v, i) => Math.round(v + (b[i] - v) * e));
}
function taskButton() {
  const sw = startWidth();
  return [sw + 5, 71, 62, 8];
}
const startWidth = () => 11 + uiWidth('Start', true) + 3;
function startMenuBox() {
  let h = 4;
  for (const s of START_ITEMS) h += s === '-' ? 4 : 8;
  const w = 13 + Math.max(...START_ITEMS.map((s) => uiWidth(s))) + 12;
  return { x: 2, y: TB + 1 - h, w, h };
}
function dialogBox() {
  const w = 140, h = 44, x = 10, y = 12;
  return { x, y, w, h, close: [x + w - 22, y + 20], details: [x + w - 22, y + 33] };
}

// ------------------------------------------------------------ drawing: the desktop

function drawIcons(g, n) {
  const ic = [[ICON_COMPUTER, 10, 3, ['My', 'Computer']], [ICON_BIN, 11, 37, ['Recycle', 'Bin']]];
  ic.slice(0, n).forEach(([spr, x, y, lines]) => {
    g.blit(spr, x, y);
    lines.forEach((s, j) => uiText(g, s, 17 - (uiWidth(s) >> 1), y + spr.h + 2 + 8 * j, C.white));
  });
}

function drawNotepad(g, r, st, ws, { down = '' } = {}) {
  const [x, y, w, h] = r;
  const cl = frame(g, x, y, w, h, TITLE, { active: st.active, maxed: st.maxed, down });
  const gg = geo(r);
  // menu bar
  gg.labels.forEach((s, i) => {
    const open = i === 1 && st.editMenu;
    if (open) pressed(g, gg.lx[i] - 2, cl.y, uiWidth(s) + 4, 8);
    uiText(g, s, gg.lx[i] + (open ? 1 : 0), cl.y + 1 + (open ? 1 : 0), C.black);
  });
  // the edit field and its scrollbar
  const fy = cl.y + 8, fh = cl.h - 8;
  sunken(g, cl.x, fy, cl.w, fh);
  const sx = cl.x + cl.w - 2 - 7, sy = fy + 2, sh = fh - 4;
  checker(g, sx, sy, 7, sh);
  raised(g, sx, sy, 7, 7); g.blit(G_UP, sx + 1, sy + 2, { c: C.black });
  raised(g, sx, sy + sh - 7, 7, 7); g.blit(G_DOWN, sx + 1, sy + sh - 5, { c: C.black });
  raised(g, sx, sy + 7, 7, 7);
  // the text
  g.clip(cl.x + 2, fy + 2, cl.w - 11, fh - 4);
  const xs = bigStops(st.text, SC);
  if (st.sel) {
    const [a, b] = st.sel;
    const x0 = gg.tx + xs[a] - 1, x1 = gg.tx + xs[Math.min(b, st.text.length)] - 1;
    g.fillRect(x0, gg.ty - 2, x1 - x0, BIG_H * SC + 4, C.navy);
  }
  [...st.text].forEach((ch, i) => {
    const lit = st.sel && i >= st.sel[0] && i < st.sel[1];
    g.blit(BIG[ch], gg.tx + xs[i], gg.ty, { c: lit ? C.white : C.black, scale: SC });
  });
  if (!st.sel && st.active && st.caret != null) {
    const since = st.editAbs == null ? ws : ws - (st.K * 60 + st.editAbs);
    if (Math.floor(since / 0.53) % 2 === 0) {
      const cx = gg.tx + xs[Math.min(st.caret, st.text.length)] - 2;
      g.fillRect(cx, gg.ty - 1, 2, BIG_H * SC + 2, C.black);
    }
  }
  g.unclip();
  // the drop-down menu
  return gg;
}

function drawTaskbar(g, st, timeStr) {
  g.fillRect(0, TB, W, H - TB, C.silver);
  g.fillRect(0, TB + 1, W, 1, C.white);
  const sw = startWidth();
  (st.start ? pressed : raised)(g, 2, 71, sw, 8);
  const o = st.start ? 1 : 0;
  g.blit(FLAG, 4 + o, 72 + o);
  uiText(g, 'Start', 12 + o, 72 + o, C.black, true);
  if (st.taskBtn) {
    const [bx, by, bw, bh] = taskButton();
    const on = (st.winVis && st.active) || st.taskDown;
    if (on) { pressed(g, bx, by, bw, bh); checker(g, bx + 2, by + 2, bw - 3, bh - 3); } else raised(g, bx, by, bw, bh);
    g.clip(bx + 2, by + 1, bw - 4, bh - 2);
    g.blit(ICON_PAD, bx + 3 + (on ? 1 : 0), by + 1);
    uiText(g, TITLE, bx + 12 + (on ? 1 : 0), by + 1 + (on ? 1 : 0), C.black, on);
    g.unclip();
  }
  const tw = uiWidth(timeStr) + 14;
  const tx = W - 2 - tw;
  g.fillRect(tx, 71, tw, 8, C.silver);
  edge(g, tx, 71, tw, 8, C.grey, C.white);
  g.blit(G_SPEAKER, tx + 2, 72, { c: C.black });
  uiText(g, timeStr, tx + 10, 72, C.black);
}

function drawStartMenu(g, st, cur) {
  const sm = startMenuBox();
  const up = Math.round((1 - (st.startOpen ?? 1)) * sm.h);
  g.clip(0, 0, W, TB + 1);
  const y0 = sm.y + up;
  raised(g, sm.x, y0, sm.w, sm.h);
  g.fillRect(sm.x + 2, y0 + 2, 10, sm.h - 4, C.grey);
  const bottom = y0 + sm.h - 4;
  uiTextUp(g, 'Windows', sm.x + 3, bottom, C.silver, true);
  uiTextUp(g, hhmm(st.tau < 0 ? st.old : st.nu), sm.x + 3, bottom - uiWidth('Windows', true) - 4, C.white, true);
  const inMenu = cur[0] >= sm.x + 12 && cur[0] < sm.x + sm.w && cur[1] >= y0 && cur[1] < y0 + sm.h;
  const hi = inMenu ? menuRowAt(y0, START_ITEMS, cur[1]) : st.sub === 'programs' ? 0 : st.sub === 'docs' ? 1 : -1;
  let yy = y0 + 2;
  const icons = [ICON_FOLDER, ICON_DOC, ICON_FOLDER, null, null, null, null, null];
  START_ITEMS.forEach((s, i) => {
    if (s === '-') { g.fillRect(sm.x + 14, yy + 1, sm.w - 16, 1, C.grey); g.fillRect(sm.x + 14, yy + 2, sm.w - 16, 1, C.white); yy += 4; return; }
    const lit = i === hi;
    if (lit) g.fillRect(sm.x + 12, yy, sm.w - 14, 8, C.navy);
    if (icons[i]) g.blit(icons[i], sm.x + 14, yy + 1);
    uiText(g, s, sm.x + 24, yy + 1, lit ? C.white : C.black);
    if (i < 4) g.blit(sprite3(), sm.x + sm.w - 6, yy + 2, { c: lit ? C.white : C.black });
    yy += 8;
  });
  g.unclip();
  // the open submenu is the script's; its lit row is under the pointer
  const subs = { programs: [0, PROG_ITEMS], docs: [1, DOC_ITEMS] };
  if (st.sub && subs[st.sub]) {
    const [row, items] = subs[st.sub];
    const ry = menuRowY(y0, START_ITEMS, row) - 6;
    const w = Math.max(...items.map((s) => uiWidth(s))) + 22;
    const h = 4 + items.length * 8;
    const sx = sm.x + sm.w - 2;
    const inSub = cur[0] >= sx && cur[0] < sx + w && cur[1] >= ry + 2 && cur[1] < ry + h - 2;
    raised(g, sx, ry, w, h);
    const shi = inSub ? Math.floor((cur[1] - ry - 2) / 8) : -1;
    items.forEach((s, i) => {
      const yy2 = ry + 2 + i * 8;
      const lit = i === shi;
      if (lit) g.fillRect(sx + 2, yy2, w - 4, 8, C.navy);
      g.blit(row === 1 ? ICON_DOC : (i < 2 ? ICON_FOLDER : ICON_DOC), sx + 4, yy2 + 1);
      uiText(g, s, sx + 14, yy2 + 1, lit ? C.white : C.black);
    });
  }
}
let ARROW_SMALL = null;
function sprite3() {
  if (!ARROW_SMALL) ARROW_SMALL = { w: 2, h: 4, data: Int32Array.from([0, -1, 0, 0, 0, 0, 0, -1]) };
  return ARROW_SMALL;
}

function drawDialog(g, d, down) {
  frame(g, d.x, d.y, d.w, d.h, 'Notepad', { icon: null, buttons: 'c' });
  g.blit(ICON_ERROR, d.x + 7, d.y + 16);
  ['This program has', 'performed an illegal', 'operation and will', 'be shut down.'].forEach((s, i) =>
    uiText(g, s, d.x + 22, d.y + 14 + 7 * i, C.black));
  button(g, d.x + d.w - 38, d.y + 15, 34, 10, 'Close', { down, def: true });
  button(g, d.x + d.w - 38, d.y + 28, 34, 10, 'Details >>');
}

function drawCursor(g, st) {
  const [x, y] = st.cur;
  const sh = st.shape;
  if (sh === 'glass') { g.blit(HOURGLASS, x - 3, y - 5); return; }
  if (sh === 'ibeam') {
    const s = IBEAM;
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++)
      if (s.data[j * s.w + i] >= 0) { const px = x - 2 + i, py = y - 5 + j; g.pixel(px, py, g.get(px, py) ^ 0xffffff); }
    return;
  }
  g.blit(ARROW, x, y);
  if (sh === 'busy') g.blit(MINIGLASS, x + 7, y + 6);
}

// ------------------------------------------------------------ drawing: the other screens

const MARQUEE_COLS = [C.yellow, C.lime, C.cyan, C.magenta, C.white, C.red];
function drawSaver(g, ws, timeStr) {
  g.clear(C.black);
  const N = 54;
  for (let i = 0; i < N; i++) {
    const ph = ws / 2.6 + rand(i, 1);
    const cyc = Math.floor(ph), z = 1 - (ph - cyc) * 0.94;
    const a = rand(i, cyc, 2) * TAU, rr = 0.15 + rand(i, cyc, 3) * 0.85;
    const x = 80 + (cos(a) * rr * 30) / z, y = 40 + (sin(a) * rr * 20) / z;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const c = z > 0.6 ? C.grey : z > 0.3 ? C.silver : C.white;
    if (z < 0.22) g.fillRect(Math.floor(x), Math.floor(y), 2, 2, c);
    else g.pixel(x, y, c);
  }
  // the marquee: one pass every 6 s, aligned to the minute, so it changes text off-screen
  const p = Math.floor(ws / 6), u = (ws / 6) - p;
  const tw = bigWidth(timeStr, SC);
  const x = Math.round(W - u * (W + tw));
  const y = 4 + (hash(p, 31) % (H - BIG_H * SC - 8));
  const col = MARQUEE_COLS[hash(p, 32) % MARQUEE_COLS.length];
  const xs = bigStops(timeStr, SC);
  [...timeStr].forEach((ch, i) => g.blit(BIG[ch], x + xs[i], y, { c: col, scale: SC }));
}

function drawBsod(g, st) {
  g.clear(C.tblue);
  const hd = ' Windows ';
  const hw = hd.length * 6;
  g.fillRect(80 - hw / 2, 2, hw, 9, C.tgrey);
  g.text(hd, 80 - hw / 2 + 1, 3, { font: font5x7, c: C.tblue });
  const ss = String(Math.floor(60 + st.tau)).padStart(2, '0');
  const lines = [
    'A fatal exception 0E has',
    `occurred at ${hhmm(st.old)}:${ss}.`,
    'The current hour will be',
    'terminated.',
    '',
    '* Press any key to start',
    `  the next hour. ${Math.floor(st.ws / 0.5) % 2 ? '_' : ' '}`,
  ];
  lines.forEach((s, i) => g.text(s, 4, 15 + i * 9, { font: font5x7, c: C.white }));
}

function drawBoot(g, st) {
  g.clear(C.black);
  const s = `Starting Windows ${hhmm(st.nu)}...`;
  const n = Math.min(s.length, Math.floor(prog(st.tau, 0.25, 0.9) * s.length));
  g.text(s.slice(0, n), 2, 3, { font: font5x7, c: C.tgrey });
  g.fillRect(2 + n * 6, 9, 5, 1, Math.floor(st.ws / 0.25) % 2 ? C.grey : C.tgrey);
}

function drawSplash(g, st) {
  const u = st.tau - 2.2;
  g.gradient(0, 0, W, 72, [0x1a3fb8, 0x3c78e0, 0x8cbcf4]);
  // clouds, drifting
  const clouds = [[18, 12, 16, 5], [48, 9, 12, 4], [118, 14, 18, 6], [148, 8, 10, 4], [30, 58, 20, 6], [96, 62, 22, 6], [140, 56, 14, 5], [70, 4, 12, 3]];
  for (const [cx, cy, rx, ry] of clouds) {
    const x = ((cx + u * 4) % 190) - 15;
    g.fillEllipse(x, cy, rx, ry, 0xdce8fc, { a: 0.55, dither: true });
    g.fillEllipse(x - rx * 0.35, cy + 1, rx * 0.55, ry * 0.8, C.white, { a: 0.8, dither: true });
    g.fillEllipse(x + rx * 0.3, cy - 1, rx * 0.5, ry * 0.9, C.white, { a: 0.7, dither: true });
  }
  // the flag, waving, with its trail of squares
  const fx = 14, fy = 22, fw = 30, fh = 26;
  const panes = [[0, 0, C.red], [1, 0, C.lime], [0, 1, C.blue], [1, 1, C.yellow]];
  const wave = (x, t) => 2.2 * Math.sin(x * 0.16 + t * 5);
  for (const [i, j, c] of panes) {
    const x0 = fx + i * (fw / 2 + 1), x1 = x0 + fw / 2 - 1;
    const y0 = fy + j * (fh / 2 + 1), y1 = y0 + fh / 2 - 1;
    g.fillPolygon([[x0, y0 + wave(x0, u)], [x1, y0 + wave(x1, u)], [x1, y1 + wave(x1, u)], [x0, y1 + wave(x0, u)]], c);
  }
  [[-6, 3, C.red], [-11, 6, C.red], [-6, 16, C.blue], [-11, 19, C.blue], [-15, 10, C.lime], [-15, 22, C.yellow]].forEach(([dx, dy, c], k) => {
    const s = k < 2 ? 3 : 2;
    g.fillRect(fx + dx, fy + dy + Math.round(wave(fx + dx, u)), s, s, c);
  });
  uiText(g, 'Microsoft', 54, 14, C.white);
  g.text('Windows', 54, 23, { font: UI, c: C.white, scale: 2, spacing: 1 });
  g.text('Windows', 55, 23, { font: UI, c: C.white, scale: 2, spacing: 1 });
  const ts = hhmm(st.nu), xs = bigStops(ts, 3);
  [...ts].forEach((ch, i) => {
    g.blit(BIG[ch], 56 + xs[i] + 1, 41 + 1, { c: C.navy, scale: 3 });
    g.blit(BIG[ch], 56 + xs[i], 41, { c: C.white, scale: 3 });
  });
  // the bar along the bottom, its blues rolling
  for (let x = 0; x < W; x++) {
    const v = 0.5 + 0.5 * sin((x / W) * TAU * 2 - u * 6);
    g.fillRect(x, 72, 1, 8, v > 0.66 ? C.cyan : v > 0.33 ? C.blue : C.navy);
  }
}

// ------------------------------------------------------------ the face

export default {
  name: 'Desktop',
  blurb: 'A tiny 1995 PC keeps the time by hand: the pointer retypes TIME.TXT every minute, each time differently (window trails, screensaver, a crash, Edit > Time/Date), and the hour is a blue screen and a reboot into "Windows 11:00".',
  fps: 60,

  frame(g, ctx) {
    ctx.lcd.backlight(1 - 0.65 * ctx.night);
    const st = plan(ctx);
    const ws = st.ws;
    if (st.mode === 'saver') { drawSaver(g, ws, hhmm(ctx.fields)); return; }
    if (st.mode === 'bsod') { drawBsod(g, st); return; }
    if (st.mode === 'black') {
      // the key was pressed: text mode, nothing but the cursor
      g.clear(C.black);
      g.fillRect(2, 9, 5, 1, Math.floor(ws / 0.25) % 2 ? C.grey : C.tgrey);
      return;
    }
    if (st.mode === 'text') { drawBoot(g, st); return; }
    if (st.mode === 'splash') { drawSplash(g, st); return; }

    g.clear(C.teal);
    drawIcons(g, st.iconsVis);
    if (st.trails) {
      // the hung drag: every stamp but the last is drawn only where the next one won't cover it
      const T = st.trails;
      for (let k = 0; k < T.length; k++) {
        const a = T[k], b = T[k + 1] ?? st.win;
        for (const r of minus(a, b)) { g.clip(...r); drawNotepad(g, a, st, ws); g.unclip(); }
      }
    }
    let gg = null;
    if (st.winVis) gg = drawNotepad(g, st.win, st, ws, { down: st.down });
    if (st.dialog) drawDialog(g, st.dialog, st.dlgDown);
    if (st.zoom) {
      const [x, y, w] = st.zoom;
      g.fillRect(x, y, Math.max(w, 8), 9, C.navy);
      g.blit(ICON_PAD, x + 1, y + 1);
    }
    if (st.taskbar) drawTaskbar(g, st, st.tray);
    if (st.ctx) {
      const [mx, my] = st.ctx;
      const hi = st.cur[0] >= mx && st.cur[1] >= my ? menuRowAt(my, CTX_ITEMS, st.cur[1]) : -1;
      menu(g, mx, my, CTX_ITEMS, hi, { arrows: [0, 4] });
    }
    if (st.editMenu && gg) {
      const inX = st.cur[0] >= gg.editMenuX && st.cur[0] < gg.editMenuX + 60;
      const hi = inX ? menuRowAt(gg.editMenuY, EDIT_ITEMS, st.cur[1]) : -1;
      menu(g, gg.editMenuX, gg.editMenuY, EDIT_ITEMS, hi);
    }
    if (st.start) drawStartMenu(g, st, st.cur);
    if (st.cursor) {
      if (!st.shape) {
        const tb = st.winVis && !st.editMenu && !st.start && !st.ctx && !st.dialog ? geo(st.win).textBox : null;
        if (tb && st.cur[0] >= tb[0] && st.cur[0] < tb[0] + tb[2] && st.cur[1] >= tb[1] && st.cur[1] < tb[1] + tb[3]) st.shape = 'ibeam';
      }
      drawCursor(g, st);
    }
  },
};

/** Rectangle a minus rectangle b: up to four boxes [x, y, w, h]. */
function minus(a, b) {
  const [ax, ay, aw, ah] = a, [bx, by, bw, bh] = b;
  const ax1 = ax + aw, ay1 = ay + ah, bx1 = bx + bw, by1 = by + bh;
  if (bx >= ax1 || bx1 <= ax || by >= ay1 || by1 <= ay) return [a];
  const out = [];
  if (by > ay) out.push([ax, ay, aw, by - ay]);
  if (by1 < ay1) out.push([ax, by1, aw, ay1 - by1]);
  const y0 = Math.max(ay, by), y1 = Math.min(ay1, by1);
  if (bx > ax) out.push([ax, y0, bx - ax, y1 - y0]);
  if (bx1 < ax1) out.push([bx1, y0, ax1 - bx1, y1 - y0]);
  return out;
}
