// The gallery page: halls of live faces on one shared clock, and a focus view.
//
// The page itself never runs a face. Each face's canvas is handed to a worker
// (worker.js) the first time it scrolls into view; workers run the faces that
// are on screen at their own frame rate and skip the rest. The focus view gets
// a worker of its own while the halls behind it are suspended.

const $ = (id) => document.getElementById(id);
const DPR = Math.min(2, window.devicePixelRatio || 1);
const wallNow = () => performance.timeOrigin + performance.now();

/** How each hall shows its faces: crop, screen px per mm, and the case they must fit. */
const VIEW = {
  '1602': { crop: 'body', pxmm: 4, box: { w: 320, h: 196 }, focusCrop: 'body', focusMax: 14 },
  oled: { crop: 'body', pxmm: 10, box: { w: 300, h: 273 }, focusCrop: 'body', focusMax: 30 },
  tft: { crop: 'glass', pxmm: 11.1, box: { w: 330, h: 160 }, focusCrop: 'body', focusMax: 34 },
  led: { pxmm: 5, box: { w: 300, h: 300 }, focusMax: 12 },
};
const CSS_PX_PER_MM = 96 / 25.4;

let halls = [];               // from manifest.json
let version = '';             // manifest.json's: put on each design's URL so caches never mix two versions
const hallById = new Map();

// ---- the shared clock ------------------------------------------------------------
const q = new URLSearchParams(location.search);
const clock = { anchorSim: Date.now(), anchorWall: wallNow(), speed: 1, paused: false, epoch: Date.now(), gen: 0 };
const simNow = () => (clock.paused ? clock.anchorSim : clock.anchorSim + (wallNow() - clock.anchorWall) * clock.speed);

function broadcast() {
  const m = { type: 'clock', clock: { ...clock } };
  for (const p of pool) p.worker.postMessage(m);
  focus.worker?.postMessage(m);
}
/** Show `ms` on every face from now on: a jump, so each face starts afresh there. */
function jumpTo(ms) {
  clock.anchorSim = ms; clock.anchorWall = wallNow(); clock.epoch = ms; clock.gen++;
  broadcast();
}
function setSpeed(speed) {
  clock.anchorSim = simNow(); clock.anchorWall = wallNow(); clock.speed = speed;
  broadcast();
}
function setPaused(on) {
  clock.anchorSim = simNow(); clock.anchorWall = wallNow(); clock.paused = on;
  $('pause').textContent = on ? 'Play' : 'Pause';
  $('pause').setAttribute('aria-pressed', String(on));
  broadcast();
}

/** 'HH:MM[:SS]' today, as epoch ms. */
function todayAt(text) {
  const [h = 0, m = 0, s = 0] = text.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, s, 0);
  return d.getTime();
}
if (q.get('clock')) { const ms = todayAt(q.get('clock')); Object.assign(clock, { anchorSim: ms, epoch: ms }); }
if (q.get('pause') === '1') clock.paused = true;

function wireClock() {
  $('pause').onclick = () => setPaused(!clock.paused);
  $('speed').onchange = () => setSpeed(Number($('speed').value));
  const turn = (unit) => {
    const d = new Date(simNow()), target = new Date(d);
    if (unit === 'hour') { target.setMinutes(59, 55, 0); if (target <= d) target.setHours(target.getHours() + 1); }
    else { target.setSeconds(55, 0); if (target <= d) target.setMinutes(target.getMinutes() + 1); }
    jumpTo(target.getTime());
  };
  $('next-minute').onclick = () => turn('minute');
  $('next-hour').onclick = () => turn('hour');
  $('now').onclick = () => {
    $('speed').value = '1'; clock.speed = 1;
    if (clock.paused) setPaused(false);
    jumpTo(Date.now());
  };

  // The day scrubber: drag through 24 hours; the thumb follows the clock otherwise.
  const day = $('day');
  let dragging = false, pendingScrub = null;
  day.addEventListener('pointerdown', () => { dragging = true; });
  addEventListener('pointerup', () => { dragging = false; });
  day.addEventListener('input', () => {
    // coalesce a fast drag to one jump per frame
    if (pendingScrub === null) requestAnimationFrame(() => {
      const d = new Date(simNow()); d.setHours(0, 0, 0, 0);
      jumpTo(d.getTime() + pendingScrub * 1000);
      pendingScrub = null;
    });
    pendingScrub = Number(day.value);
  });

  let shown = '';
  const fmt = (d) => d.toTimeString().slice(0, 8);
  (function show() {
    requestAnimationFrame(show);
    const d = new Date(simNow()), text = fmt(d);
    if (text === shown) return;
    shown = text;
    $('clock-time').textContent = text;
    if (!dragging && pendingScrub === null) {
      day.value = String(d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds());
      day.setAttribute('aria-valuetext', text.slice(0, 5));
    }
  })();
}

// ---- the worker pool -----------------------------------------------------------------
const pool = [];
const tiles = new Map();      // id -> tile
const tileByEl = new Map();
let nextId = 1;

function makePool() {
  const n = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 2));
  for (let i = 0; i < n; i++) addWorker();
}

function addWorker() {
  const worker = new Worker('worker.js', { type: 'module' });
  // tainted: a module failed to load here, and the worker would fail it again
  const p = { worker, load: 0, ticks: 0, tainted: false };
  worker.onmessage = ({ data: m }) => {
    if (m.type === 'stats') { p.load = m.load; p.ticks = m.ticks; for (const [id, fps, ms] of m.fps) rate(tiles.get(id), fps, ms); }
    if (m.type === 'error') failed(tiles.get(m.id), m);
  };
  worker.onerror = (e) => console.error('gallery worker failed', e.message);
  worker.postMessage({ type: 'clock', clock: { ...clock } });
  if (focus.open) worker.postMessage({ type: 'suspend', on: true });
  pool.push(p);
  return p;
}

/** Work a face of each display costs before it has been measured, ms per second. */
const GUESS = { '1602': 5, oled: 60, tft: 120, led: 120 };

/** The worker whose faces on screen cost the least, as measured. */
function pickWorker(tile) {
  const ok = pool.filter((p) => !p.tainted);
  const choice = ok.length ? ok : pool.length < MAX_WORKERS ? [addWorker()] : pool;
  const cost = new Map(choice.map((p) => [p, 0]));
  for (const t of tiles.values()) if (cost.has(t.pool) && t.visible && t !== tile) cost.set(t.pool, cost.get(t.pool) + (t.cost ?? GUESS[t.hall.id]));
  return [...cost].sort((a, b) => a[1] - b[1])[0][0];
}

function start(tile) {
  const off = tile.canvas.transferControlToOffscreen();
  tile.pool = pickWorker(tile);
  tile.pool.worker.postMessage({ type: 'add', id: tile.id, kind: tile.hall.id, key: tile.face.key, file: designFile(tile.face), opts: tile.opts, canvas: off, visible: true }, [off]);
}

const seen = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const tile = tileByEl.get(e.target);
    if (!tile) continue;
    tile.visible = e.isIntersecting;
    if (tile.visible && !tile.pool) start(tile);
    else if (tile.pool) tile.pool.worker.postMessage({ type: 'visible', id: tile.id, on: tile.visible });
  }
}, { rootMargin: '160px 0px' });

function suspendHalls(on) {
  for (const p of pool) p.worker.postMessage({ type: 'suspend', on });
}
document.addEventListener('visibilitychange', () => {
  const hidden = document.visibilityState === 'hidden';
  suspendHalls(hidden || focus.open);
  focus.worker?.postMessage({ type: 'suspend', on: hidden });
});

/** Say so on the placard when a face is running slower than it was designed to. */
function rate(tile, fps, ms) {
  if (!tile) return;
  tile.fps = fps;
  tile.cost = ms;
  if (clock.paused) return;
  const slow = fps < tile.face.fps * 0.85 && clock.speed <= 1;
  tile.slowCount = slow ? (tile.slowCount ?? 0) + 1 : 0;
  const text = tile.slowCount >= 2 ? `running at ${Math.round(fps)}` : '';
  if (tile.rateEl.textContent !== text) tile.rateEl.textContent = text;
}

const LOAD_TRIES = 3;
const MAX_WORKERS = 12;

/** Stop a tainted worker once it has no faces left. */
function retire(p) {
  if (!p.tainted || [...tiles.values()].some((t) => t.pool === p)) return;
  p.worker.terminate();
  pool.splice(pool.indexOf(p), 1);
}

function failed(tile, { message, load }) {
  if (!tile) return;
  if (load && (tile.tries = (tile.tries ?? 1) + 1) <= LOAD_TRIES) {
    // The network dropped one of its modules: try again in a worker that has
    // not seen the failure, on a new canvas (a canvas is handed over once).
    const old = tile.pool;
    old.tainted = true;
    old.worker.postMessage({ type: 'remove', id: tile.id });
    const canvas = tile.canvas.cloneNode(false);
    tile.canvas.replaceWith(canvas);
    tile.canvas = canvas;
    tile.pool = null;
    retire(old);
    if (tile.visible) start(tile);
    return;
  }
  tile.el.classList.add('is-failed');
  tile.el.querySelector('.vitrine').dataset.error = load
    ? 'This face could not be downloaded. Reload the page to try again.'
    : `This face stopped with an error: ${message}`;
}

// ---- geometry --------------------------------------------------------------------------
function mmOf(hall, face, crop, layout) {
  if (hall.id === '1602') { const c = hall.crops[crop]; return face.rotate === 90 ? { w: c.h, h: c.w } : c; }
  if (hall.id === 'led') return hall.layouts[layout ?? face.layout].mm;
  return hall.modules[face.module].crops[crop];
}
/** CSS px per mm that fits `mm` into `box` without going over `max` (and never under 0.5). */
const fit = (mm, box, max) => Math.max(0.5, Math.min(max, box.w / mm.w, box.h / mm.h));

/** The stacked, scrolling focus layout of gallery.css (narrow screens). */
const STACKED = matchMedia('(max-width: 900px)');

/** Rough frames and underlines from the site's sketch kit, if it has loaded (the gallery works without it). */
const sketchDraw = (root) => {
  if (window.sketch) window.sketch.draw(root);
  else document.addEventListener('sketch:ready', () => window.sketch.draw(root), { once: true });
};

// ---- the halls ---------------------------------------------------------------------------
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k !== null && k !== undefined));
  return n;
};
const roundText = (r) => {
  if (!r) return '';
  const date = r.date ? new Date(`${r.date}T12:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  if (r.label === 'Round') return date ? `Round of ${date}` : 'Round';
  const label = r.label.charAt(0).toUpperCase() + r.label.slice(1);
  return date ? `${label}, ${date}` : label;
};
const designFile = (face) => (version ? `${face.file}?v=${version}` : face.file);
const faceUrl = (hall, face) => `?face=${hall.id}/${encodeURIComponent(face.key)}`;

function buildHalls() {
  const main = $('halls');
  const total = halls.reduce((n, h) => n + h.faces.length, 0);
  $('intro-text').textContent =
    `${total} clock faces made for ${['no', 'one', 'two', 'three', 'four', 'five', 'six'][halls.length] ?? halls.length} kinds of small display. Each one runs live in its display's emulator, and all of them keep the time shown above. ` +
    'Pause it, speed it up, or drag through the day to watch every face turn the hour together. Choose a face to see it up close.';

  const nav = $('halls-nav');
  for (const hall of halls) {
    nav.append(el('a', { href: `#hall-${hall.id}` }, hall.title, el('span', { className: 'count', textContent: ` ${hall.faces.length}` })));

    const v = VIEW[hall.id];
    const section = el('section', { className: `hall hall-${hall.id}`, id: `hall-${hall.id}` });
    section.setAttribute('aria-labelledby', `hall-${hall.id}-title`);
    section.append(el('header', { className: 'hall-head' },
      el('h2', { id: `hall-${hall.id}-title`, textContent: hall.title }),
      el('p', { className: 'hall-spec', textContent: `${hall.spec}. ${hall.faces.length} faces.` }),
      el('p', { className: 'hall-about', textContent: hall.about }),
    ));
    const list = el('ul', { className: 'cases' });
    list.style.setProperty('--case-w', `${v.box.w}px`);
    list.style.setProperty('--vitrine-h', `${v.box.h}px`);
    for (const face of hall.faces) list.append(buildTile(hall, face));
    section.querySelector('h2').setAttribute('data-under', '');
    section.append(list);
    main.append(section);
  }
  sketchDraw(main);
}

function buildTile(hall, face) {
  const v = VIEW[hall.id];
  const id = nextId++;
  const crop = v.crop;
  const mm = mmOf(hall, face, crop);
  const css = fit(mm, v.box, v.pxmm);
  const canvas = el('canvas', { width: Math.round(mm.w * css * DPR), height: Math.round(mm.h * css * DPR) });
  canvas.style.width = `${(mm.w * css).toFixed(1)}px`;
  canvas.style.aspectRatio = `${mm.w} / ${mm.h}`;
  canvas.setAttribute('aria-hidden', 'true');

  const nameId = `face-${id}-name`, blurbId = `face-${id}-blurb`;
  const rateEl = el('span', { className: 'placard-rate' });
  const link = el('a', { className: 'case-link', href: faceUrl(hall, face) },
    el('div', { className: 'vitrine' }, el('div', { className: 'lamp' }), canvas),
    el('div', { className: 'placard' },
      el('h3', { className: 'placard-name', id: nameId, textContent: face.name }),
      el('p', { className: 'placard-meta' },
        el('span', { textContent: roundText(face.round) }),
        el('span', { className: 'placard-fps' }, `${face.fps} fps`, rateEl)),
      el('p', { className: 'placard-blurb', id: blurbId, textContent: face.blurb }),
    ));
  link.setAttribute('data-frame', '');           // a rough frame from the sketch kit
  link.setAttribute('aria-labelledby', nameId);
  link.setAttribute('aria-describedby', blurbId);
  link.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    openFocus(hall, face);
  });

  const li = el('li', { className: 'case' }, link);
  const opts = hall.id === 'led' ? { scale: css * DPR, layout: face.layout } : { scale: css * DPR, crop };
  if (hall.id === 'oled' || hall.id === '1602') opts.painter = 'fast';   // see faces/oled.js, faces/lcd1602.js
  const tile = { id, hall, face, el: li, canvas, opts, rateEl, pool: null, visible: false };
  tiles.set(id, tile);
  tileByEl.set(li, tile);
  seen.observe(li);
  return li;
}

// ---- the focus view ----------------------------------------------------------------------------
const focus = { open: false, worker: null, hall: null, face: null, state: null, canvas: null, returnTo: null };

const NIGHT = [['auto', 'By the clock, 23:00 to 07:00'], ['off', 'Off'], ['on', 'Always on']];
const STYLE = [['photo', 'Photo of the glass'], ['clean', 'Clean pixels']];

/** The options each display offers, as [key, label, choices | 'check', default]. */
function controlsFor(hall, face) {
  if (hall.id === '1602') return [
    ['preset', 'Panel colour', Object.entries(hall.presets), face.panel],
    ['response', 'Liquid crystal lag', [['typ', 'Typical, 150 ms'], ['max', 'Worst case, 200 ms'], ['off', 'Off']], 'typ'],
    ['crop', 'Show', [['body', 'Whole module'], ['view', 'Glass only']], 'body'],
    ['style', 'Rendering', STYLE, 'photo'],
  ];
  if (hall.id === 'oled') {
    const mod = hall.modules[face.module];
    return [
      ['colour', 'Panel colour', mod.colours.map((c) => [c, c]), face.colour ?? mod.colours[0]],
      ['crop', 'Show', [['body', 'Whole module'], ['glass', 'Glass'], ['view', 'Pixels only']], 'body'],
      ['style', 'Rendering', STYLE, 'photo'],
      ['night', 'Night dimming', NIGHT, 'auto'],
      ['tear', 'Show tearing', 'check', false],
    ];
  }
  // On a narrow screen the TFT's board is twice the width of its glass, so
  // showing the whole module would draw the face smaller than in the hall.
  if (hall.id === 'tft') return [
    ['crop', 'Show', [['body', 'Whole module'], ['glass', 'Glass'], ['view', 'Pixels only']], STACKED.matches ? 'glass' : 'body'],
    ['style', 'Rendering', STYLE, 'photo'],
    ['room', 'Room', [['dark', 'Dark'], ['lit', 'Lit']], 'dark'],
    ['night', 'Night dimming', NIGHT, 'auto'],
    ['tear', 'Show tearing', 'check', false],
  ];
  return [
    ['layout', 'Layout', face.layouts.map((k) => [k, hall.layouts[k].label]), face.layout],
    ['look', 'Diffuser', [['bare', 'Bare LEDs'], ['smoke', 'Smoked acrylic'], ['opal', 'Opal sheet']], face.look],
    ['gap', 'Opal sheet gap', [4, 6, 8, 12, 16, 24].map((g) => [String(g), `${g} mm`]), String(face.gap)],
    ['room', 'Room', [['dark', 'Dark'], ['lit', 'Lit']], 'dark'],
    ['night', 'Night dimming', NIGHT, 'auto'],
  ];
}

function buildControls() {
  const form = $('focus-controls');
  form.replaceChildren();
  const specs = [...controlsFor(focus.hall, focus.face), ['actual', 'Actual size', 'check', false]];
  for (const [key, label, choices, value] of specs) {
    focus.state[key] = value;
    const id = `opt-${key}`;
    if (choices === 'check') {
      const box = el('input', { type: 'checkbox', id, checked: !!value });
      box.onchange = () => setOption(key, box.checked);
      form.append(el('div', { className: 'opt opt-check' }, box, el('label', { htmlFor: id, textContent: label })));
    } else {
      const s = el('select', { id });
      for (const [v, text] of choices) s.add(new Option(text, v));
      s.value = value;
      s.onchange = () => setOption(key, s.value);
      form.append(el('div', { className: 'opt' }, el('label', { htmlFor: id, textContent: label }), s));
    }
  }
  form.append(el('a', { className: 'opt-sim', href: simUrl(), target: '_blank', rel: 'noopener', textContent: 'Open in the full simulator' }));
  syncGap();
}

const simUrl = () => {
  const u = new URLSearchParams({ design: focus.face.key });
  if (focus.hall.id === 'led') u.set('layout', focus.state.layout);
  return `${focus.hall.sim}?${u}`;
};
function syncGap() {
  const gap = $('opt-gap');
  if (gap) gap.closest('.opt').hidden = focus.state.look !== 'opal';
}

function setOption(key, value) {
  focus.state[key] = value;
  syncGap();
  if (key === 'layout') $('focus-controls').querySelector('.opt-sim').href = simUrl();
  sizeFocus();
}

/** Re-fit the face after an option or the window changed, and tell its worker. */
function sizeFocus() {
  if (focus.canvas) focus.worker.postMessage({ type: 'configure', id: 0, opts: focusOpts() });
}

/** Fit the face into the stage (or at its real size): sizes the canvas, returns the worker's options. */
function focusOpts() {
  const { hall, face, state, canvas } = focus;
  const v = VIEW[hall.id];
  const crop = state.crop ?? v.focusCrop;
  const mm = mmOf(hall, face, crop, state.layout);
  // Side by side, the stage is the space left between the bar and the label.
  // Stacked, the stage grows to fit the display, so fit the width and let the
  // display take up to 60% of the screen's height, leaving the name in view.
  const stage = $('focus-stage').getBoundingClientRect();
  const box = STACKED.matches
    ? { w: stage.width, h: Math.max(180, innerHeight * 0.6) }
    : { w: stage.width - 48, h: stage.height - 48 };
  const css = state.actual ? CSS_PX_PER_MM : fit(mm, box, v.focusMax);
  canvas.style.width = `${(mm.w * css).toFixed(1)}px`;
  canvas.style.aspectRatio = `${mm.w} / ${mm.h}`;
  const opts = { ...state, scale: css * DPR, gap: state.gap !== undefined ? Number(state.gap) : undefined };
  delete opts.actual;
  if (hall.id !== 'led') opts.crop = crop;
  return opts;
}

function openFocus(hall, face, { push = true, retry = false } = {}) {
  if (!retry) focus.tries = 1;
  if (!focus.open) focus.returnTo = document.activeElement;
  closeWorker();
  Object.assign(focus, { open: true, hall, face, state: {} });
  suspendHalls(true);
  const root = $('focus');
  root.hidden = false;
  root.dataset.hall = hall.id;
  document.body.classList.add('is-focused');

  $('focus-name').textContent = face.name;
  const spec = hall.id === 'led' ? hall.layouts[face.layout].label
    : hall.id === 'oled' || hall.id === 'tft' ? hall.modules[face.module].label : hall.spec;
  const when = roundText(face.round);
  $('focus-meta').textContent = `${hall.title}: ${spec}. ${when ? `${when}. ` : ''}Made for ${face.fps} frame${face.fps === 1 ? '' : 's'} a second.`;
  $('focus-blurb').textContent = face.blurb;
  $('focus-rate').textContent = '';
  const i = hall.faces.indexOf(face);
  $('focus-pos').textContent = `${i + 1} of ${hall.faces.length}`;
  buildControls();

  const canvas = el('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${face.name}, running live`);
  $('focus-stage').replaceChildren(el('div', { className: 'lamp' }), canvas);
  focus.canvas = canvas;
  const worker = new Worker('worker.js', { type: 'module' });
  focus.worker = worker;
  worker.onmessage = ({ data: m }) => {
    if (worker !== focus.worker) return;
    if (m.type === 'stats') {
      const fps = m.fps[0]?.[1];
      if (fps !== undefined && !clock.paused) $('focus-rate').textContent = `Showing ${Math.round(fps)} of ${face.fps} frames a second.`;
    }
    if (m.type === 'error' && m.load && (focus.tries = (focus.tries ?? 1) + 1) <= LOAD_TRIES) return openFocus(hall, face, { push: false, retry: true });
    if (m.type === 'error') $('focus-rate').textContent = m.load ? 'This face could not be downloaded. Reload the page to try again.' : `This face stopped with an error: ${m.message}`;
  };
  worker.postMessage({ type: 'clock', clock: { ...clock } });
  const opts = focusOpts();
  const off = canvas.transferControlToOffscreen();
  worker.postMessage({ type: 'add', id: 0, kind: hall.id, key: face.key, file: designFile(face), opts, canvas: off, visible: true }, [off]);

  if (push) history.pushState({ face: `${hall.id}/${face.key}` }, '', faceUrl(hall, face) + location.hash);
  $('focus-close').focus({ preventScroll: true });
}

function closeWorker() {
  focus.worker?.terminate();
  focus.worker = null;
  focus.canvas = null;
}

function closeFocus({ push = true } = {}) {
  if (!focus.open) return;
  closeWorker();
  focus.open = false;
  $('focus').hidden = true;
  $('focus-stage').replaceChildren();
  document.body.classList.remove('is-focused');
  suspendHalls(document.visibilityState === 'hidden');
  if (push) history.pushState({}, '', location.pathname + location.hash);
  focus.returnTo?.focus?.({ preventScroll: false });
}

function stepFocus(d) {
  const list = focus.hall.faces;
  const i = (list.indexOf(focus.face) + d + list.length) % list.length;
  openFocus(focus.hall, list[i], { push: false });
  history.replaceState({ face: `${focus.hall.id}/${list[i].key}` }, '', faceUrl(focus.hall, list[i]) + location.hash);
}

function wireFocus() {
  $('focus-close').onclick = () => closeFocus();
  $('focus-prev').onclick = () => stepFocus(-1);
  $('focus-next').onclick = () => stepFocus(1);
  addEventListener('keydown', (e) => {
    if (!focus.open) return;
    if (e.key === 'Escape') { e.preventDefault(); closeFocus(); }
    const typing = e.target.closest?.('select, input');
    if (!typing && e.key === 'ArrowLeft') stepFocus(-1);
    if (!typing && e.key === 'ArrowRight') stepFocus(1);
    if (e.key === 'Tab') {
      // keep keyboard focus inside the dialog
      const items = [...$('focus').querySelectorAll('button, select, input, a[href]')].filter((n) => !n.closest('[hidden]'));
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  let resizeT;
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => focus.open && sizeFocus(), 120); });
  addEventListener('popstate', () => routeFromUrl());
}

function routeFromUrl() {
  const want = new URLSearchParams(location.search).get('face');
  if (!want) return closeFocus({ push: false });
  const [hallId, key] = want.split('/');
  const hall = hallById.get(hallId), face = hall?.faces.find((f) => f.key === decodeURIComponent(key ?? ''));
  if (face) openFocus(hall, face, { push: false });
}

// ---- start ---------------------------------------------------------------------------------------
async function main() {
  wireClock();
  wireFocus();
  // the focus view sits below the masthead, so the clock stays in reach
  const mast = document.querySelector('.masthead');
  // its bottom edge, not its height: the site header above it scrolls away before the masthead sticks
  const setMh = () => {
    const root = document.documentElement.style;
    root.setProperty('--mh', `${Math.round(mast.getBoundingClientRect().bottom)}px`);
    root.setProperty('--mast-h', `${mast.offsetHeight}px`);
  };
  new ResizeObserver(setMh).observe(mast);
  addEventListener('scroll', setMh, { passive: true });
  if (!('transferControlToOffscreen' in HTMLCanvasElement.prototype)) {
    $('intro-text').textContent = 'This browser cannot draw from workers (OffscreenCanvas), which the gallery needs. Recent Chrome, Edge, Firefox and Safari can.';
    return;
  }
  let manifest;
  try {
    const res = await fetch('manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    manifest = await res.json();
  } catch (err) {
    $('intro-text').textContent = `The list of faces (manifest.json) could not be loaded: ${err.message}. Locally, run node tools/serve.mjs; for a static host, run node tools/build.mjs first.`;
    return;
  }
  halls = manifest.halls;
  version = manifest.version ?? '';
  for (const h of halls) hallById.set(h.id, h);
  makePool();
  buildHalls();
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  routeFromUrl();
}
// For tools/smoke.mjs: what every face on screen is doing.
window.galleryStats = () => ({
  workers: pool.map((p) => `${(p.load * 100).toFixed(0)}% busy, ${p.ticks.toFixed(0)} Hz`),
  tiles: [...tiles.values()].filter((t) => t.visible && t.pool).map((t) => ({ hall: t.hall.id, key: t.face.key, fps: t.face.fps, shown: t.fps ?? null, failed: t.el.classList.contains('is-failed'), error: t.el.querySelector('.vitrine').dataset.error ?? null })),
});

main();
