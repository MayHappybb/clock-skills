// The four skills the gallery shows, and where their files are.
//
// Two layouts are known, and the first that exists is used:
//   - the clock-skills repo: the gallery is <repo>/gallery, the skills <repo>/skills/<name>
//   - the working projects: the gallery is ~/coding/clock-gallery, the skills in
//     1602display/.claude/skills and lcd_clock/.claude/skills next to it
// In the browser the page always finds a skill at ../skills/<name>/ (GitHub
// Pages serves the repo that way; tools/serve.mjs mirrors it).

import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

/** The gallery site: index.html and the rest. */
export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const SKILLS = {
  '1602': { name: '1602-clock', work: '../1602display/.claude/skills/1602-clock' },
  oled: { name: 'oled-clock', work: '../1602display/.claude/skills/oled-clock' },
  tft: { name: 'tft-clock', work: '../lcd_clock/.claude/skills/tft-clock' },
  led: { name: 'ws2812-clock', work: '../1602display/.claude/skills/ws2812-clock' },
};

for (const [id, s] of Object.entries(SKILLS)) {
  const dir = [join(ROOT, '..', 'skills', s.name), resolve(ROOT, s.work)].find((d) => existsSync(join(d, 'sim', 'js', 'player.js')));
  if (!dir) throw new Error(`skill '${s.name}' not found next to ${ROOT}`);
  s.dir = dir;
  s.sim = join(dir, 'sim');
  s.url = `../skills/${s.name}/sim/`;   // from the gallery page
  s.id = id;
}
