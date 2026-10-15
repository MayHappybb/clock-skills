// Runs faces off the main thread. Each face draws onto a canvas the page
// handed over (transferControlToOffscreen), at the design's own frame rate,
// on the page's shared clock. Faces that are scrolled out of view are not run.
//
// Messages in:  clock {clock} · add {id, kind, key, file (in the skill's designs/), opts, canvas, visible}
//               configure {id, opts} · visible {id, on} · remove {id} · suspend {on}
// Messages out: stats {load, ticks (loop runs a second), fps: [[id, frames per second, ms of work per second]]}
//               error {id, message, load: true when a module could not be fetched}

const KINDS = {
  '1602': () => import('./faces/lcd1602.js'),
  oled: () => import('./faces/oled.js'),
  tft: () => import('./faces/tft.js'),
  led: () => import('./faces/led.js'),
};

const faces = new Map();   // id -> { face, visible, frames, failed, queued }
let clock = null, suspended = false;

const wallNow = () => performance.timeOrigin + performance.now();
const simAt = (w) => (clock.paused ? clock.anchorSim : clock.anchorSim + (w - clock.anchorWall) * clock.speed);

function fail(id, e, err) {
  e.failed = true;
  // A module that could not be fetched (Chrome, Firefox and Safari word it
  // differently, all as a TypeError). The failure stays in this worker's
  // module map, so only a fresh worker can try again.
  const load = err instanceof TypeError && /module/i.test(err.message);
  postMessage({ type: 'error', id, message: String(err?.message ?? err), load });
}

self.onmessage = async ({ data: m }) => {
  if (m.type === 'clock') { clock = m.clock; return; }
  if (m.type === 'suspend') { suspended = m.on; return; }
  const e = faces.get(m.id);
  if (m.type === 'add') {
    const entry = { face: null, visible: m.visible ?? true, frames: 0, ms: 0, failed: false, queued: {} };
    faces.set(m.id, entry);
    try {
      const mod = await KINDS[m.kind]();
      entry.face = await mod.make(m.key, m.file, { ...m.opts, ...entry.queued }, m.canvas);
    } catch (err) { fail(m.id, entry, err); }
  } else if (!e) {
    // a message for a face that was removed
  } else if (m.type === 'configure') {
    if (!e.face) Object.assign(e.queued, m.opts);
    else try { e.face.configure(m.opts); } catch (err) { fail(m.id, e, err); }
  } else if (m.type === 'visible') e.visible = m.on;
  else if (m.type === 'remove') faces.delete(m.id);
};

// ---- the loop ------------------------------------------------------------------
const schedule = typeof self.requestAnimationFrame === 'function'
  ? (f) => self.requestAnimationFrame(f)
  : (f) => setTimeout(f, 1000 / 60);

let last = wallNow(), busy = 0, ticks = 0, statFrom = performance.now();

function loop() {
  schedule(loop);
  ticks++;
  const w = wallNow();
  const dt = Math.min(0.25, (w - last) / 1000);
  last = w;
  if (clock && !suspended) {
    const sim = simAt(w);
    const c = { sim, t: (sim - clock.epoch) / 1000, epoch: clock.epoch, gen: clock.gen, dt };
    const t0 = performance.now();
    for (const [id, e] of faces) {
      if (!e.face || !e.visible || e.failed) continue;
      const s0 = performance.now();
      try { if (e.face.tick(c)) e.frames++; } catch (err) { fail(id, e, err); }
      e.ms += performance.now() - s0;
    }
    busy += performance.now() - t0;
  }
  const now = performance.now();
  if (now - statFrom >= 1000) {
    const span = now - statFrom, fps = [];
    for (const [id, e] of faces) {
      if (e.visible && e.face && !e.failed) fps.push([id, (e.frames * 1000) / span, (e.ms * 1000) / span]);
      e.frames = 0; e.ms = 0;
    }
    postMessage({ type: 'stats', load: busy / span, ticks: (ticks * 1000) / span, fps });
    busy = 0; ticks = 0; statFrom = now;
  }
}
schedule(loop);
