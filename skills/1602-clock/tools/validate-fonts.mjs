// Sanity-check hand-authored glyph sets: every glyph must be exactly
// 5 columns wide and the declared number of rows tall.
import { DIGITS_TALL, DIGITS_COMPACT, PUNCTUATION } from '../sim/js/kit.js';

let bad = 0;
const check = (name, font, h) => {
  for (const [ch, g] of Object.entries(font)) {
    if (g.length !== h) { console.log(`${name} '${ch}': ${g.length} rows (want ${h})`); bad++; }
    g.forEach((row, i) => {
      if (row.length !== 5) { console.log(`${name} '${ch}' row ${i}: ${row.length} chars "${row}"`); bad++; }
    });
  }
};
check('TALL', DIGITS_TALL, 16);
check('COMPACT', DIGITS_COMPACT, 8);
check('PUNCT', PUNCTUATION, 8);
console.log(bad === 0 ? 'all glyph sets valid' : `${bad} problems`);
process.exitCode = bad ? 1 : 0;
